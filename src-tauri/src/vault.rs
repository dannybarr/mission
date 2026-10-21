use crate::{crypto::Manifest, device, model::Item, policy::Grant, Error, Result};
use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};
use zeroize::Zeroizing;

// A single owner controls this connection. No database handle escapes the session.
pub struct Vault {
    root: PathBuf,
    manifest_bytes: Vec<u8>,
    pub(super) connection: Connection,
}
// The watchdog checks this proof without waiting for the database connection.
pub(crate) struct Presence {
    root: PathBuf,
    manifest_bytes: Vec<u8>,
}
impl Presence {
    pub(crate) fn check(&self) -> Result<()> {
        let dir = self.root.join("mission");
        device::check_child(&self.root, &dir)?;
        device::check_child(&self.root, &dir.join("manifest.json"))?;
        if read_manifest(&dir.join("manifest.json"))? != self.manifest_bytes {
            return Err(Error::Locked);
        }
        Ok(())
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audit {
    at: String,
    actor: String,
    action: String,
    item_id: Option<String>,
}
#[derive(Serialize)]
pub struct Snapshot {
    items: Vec<Item>,
    grants: Vec<Grant>,
    proposals: Vec<crate::review::Proposal>,
    audit: Vec<Audit>,
}
fn read_manifest(path: &Path) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    fs::File::open(path)?.take(8193).read_to_end(&mut bytes)?;
    if bytes.len() > 8192 {
        return Err(Error::Invalid);
    }
    Ok(bytes)
}
fn connect(path: &Path, key: &[u8]) -> Result<Connection> {
    let db = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let key_hex = Zeroizing::new(hex::encode(key));
    let pragma = Zeroizing::new(format!("PRAGMA key = \"x'{}'\";", key_hex.as_str()));
    db.execute_batch(&pragma)?;
    let version: String = db
        .query_row("PRAGMA cipher_version", [], |r| r.get(0))
        .map_err(|_| Error::Crypto)?;
    if version.is_empty() {
        return Err(Error::Crypto);
    }
    db.execute_batch("PRAGMA cipher_memory_security=ON; PRAGMA temp_store=MEMORY; PRAGMA mmap_size=0; PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA foreign_keys=ON;")?;
    // Forces authentication now, not on the first later command.
    db.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    })
    .map_err(|_| Error::Crypto)?;
    Ok(db)
}
impl Vault {
    // Production callers MUST use device::resolve first. Tests use isolated synthetic directories.
    pub(crate) fn create(root: &Path, passphrase: &[u8]) -> Result<Self> {
        device::reject_links(root)?;
        let (manifest, key) = Manifest::create(passphrase)?;
        let dir = root.join("mission");
        // Exclusive directory creation prevents overwriting an existing or partial vault.
        fs::create_dir(&dir)?;
        device::check_child(root, &dir)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))?;
        }
        let path = dir.join("vault.db");
        OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?
            .sync_all()?;
        let db = connect(&path, key.as_ref())?;
        db.execute_batch("BEGIN IMMEDIATE;
            CREATE TABLE metadata (name TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE items (id TEXT PRIMARY KEY,version INTEGER NOT NULL,json TEXT NOT NULL);
            CREATE TABLE history (id TEXT NOT NULL,version INTEGER NOT NULL,json TEXT NOT NULL,PRIMARY KEY(id,version));
            CREATE TABLE grants (agent TEXT PRIMARY KEY,json TEXT NOT NULL);
            CREATE TABLE audit (sequence INTEGER PRIMARY KEY,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,item_id TEXT);
            PRAGMA user_version=1; COMMIT;")?;
        db.execute(
            "INSERT INTO metadata VALUES ('vault_id',?1)",
            [manifest.header.vault_id.to_string()],
        )?;
        let manifest_bytes = serde_json::to_vec(&manifest)?;
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(dir.join("manifest.json"))?;
        file.write_all(&manifest_bytes)?;
        file.sync_all()?;
        let vault = Self {
            root: root.to_path_buf(),
            manifest_bytes,
            connection: db,
        };
        vault.check()?;
        vault.prepare_review()?;
        Ok(vault)
    }
    pub(crate) fn open(root: &Path, passphrase: &[u8]) -> Result<Self> {
        let dir = root.join("mission");
        device::check_child(root, &dir)?;
        device::check_child(root, &dir.join("manifest.json"))?;
        device::check_child(root, &dir.join("vault.db"))?;
        for name in ["vault.db-journal", "vault.db-wal", "vault.db-shm"] {
            let path = dir.join(name);
            if path.try_exists()? {
                device::check_child(root, &path)?;
            }
        }
        let manifest_bytes = read_manifest(&dir.join("manifest.json"))?;
        let manifest: Manifest = serde_json::from_slice(&manifest_bytes)?;
        let key = manifest.unlock(passphrase)?;
        let db = connect(&dir.join("vault.db"), key.as_ref())?;
        let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version != 1 && version != 2 {
            return Err(Error::Invalid);
        }
        let id: String = db.query_row(
            "SELECT value FROM metadata WHERE name='vault_id'",
            [],
            |r| r.get(0),
        )?;
        if id != manifest.header.vault_id.to_string() {
            return Err(Error::Crypto);
        }
        let vault = Self {
            root: root.to_path_buf(),
            manifest_bytes,
            connection: db,
        };
        vault.check()?;
        vault.prepare_review()?;
        Ok(vault)
    }
    pub fn check(&self) -> Result<()> {
        self.presence().check()?;
        let dir = self.root.join("mission");
        device::check_child(&self.root, &dir.join("vault.db"))?;
        for name in ["vault.db-journal", "vault.db-wal", "vault.db-shm"] {
            let path = dir.join(name);
            if path.try_exists()? {
                device::check_child(&self.root, &path)?;
            }
        }
        Ok(())
    }
    pub(crate) fn presence(&self) -> Presence {
        Presence {
            root: self.root.clone(),
            manifest_bytes: self.manifest_bytes.clone(),
        }
    }
    pub(crate) fn root(&self) -> &Path {
        &self.root
    }
    pub(crate) fn reset_challenge(&self) -> Result<Vec<u8>> {
        self.check()?;
        Ok(self.manifest_bytes.clone())
    }
    pub(crate) fn authorize_reset(manifest_bytes: &[u8], passphrase: &[u8]) -> Result<()> {
        let manifest: Manifest = serde_json::from_slice(manifest_bytes)?;
        manifest.unlock(passphrase)?;
        Ok(())
    }
    // Call only after the session lease and agent credentials have been revoked.
    // This removes Mission's files, not other content on the removable volume.
    pub(crate) fn delete_verified(self) -> Result<()> {
        self.check()?;
        let root = self.root.clone();
        let expected_manifest = self.manifest_bytes.clone();
        let dir = root.join("mission");
        let allowed = [
            "manifest.json", "vault.db", "vault.db-journal", "vault.db-wal", "vault.db-shm",
        ];
        let mut files = Vec::new();
        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let name = entry.file_name();
            let name = name.to_str().ok_or(Error::Denied)?;
            if !allowed.contains(&name) || !entry.file_type()?.is_file() {
                return Err(Error::Denied);
            }
            device::check_child(&root, &entry.path())?;
            files.push((name.to_owned(), entry.path()));
        }
        drop(self); // Close SQLCipher before removing its database on Windows.
        device::check_child(&root, &dir)?;
        if read_manifest(&dir.join("manifest.json"))? != expected_manifest {
            return Err(Error::Locked);
        }
        for (name, path) in &files {
            if path.try_exists()? {
                device::check_child(&root, path)?;
            } else if name == "manifest.json" || name == "vault.db" {
                return Err(Error::Locked);
            }
        }
        for (_, path) in files.iter().filter(|(name, _)| name != "manifest.json") {
            if path.try_exists()? { fs::remove_file(path)?; }
        }
        fs::remove_file(dir.join("manifest.json"))?;
        fs::remove_dir(dir)?;
        Ok(())
    }
    pub fn snapshot(&self) -> Result<Snapshot> {
        self.check()?;
        let mut stmt = self
            .connection
            .prepare("SELECT json FROM items ORDER BY rowid DESC")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        let mut items = Vec::new();
        for row in rows {
            let json = Zeroizing::new(row?);
            items.push(serde_json::from_str(&json)?);
        }
        let mut stmt = self
            .connection
            .prepare("SELECT json FROM grants ORDER BY agent")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        let mut grants = Vec::new();
        for row in rows {
            let json = Zeroizing::new(row?);
            grants.push(serde_json::from_str(&json)?);
        }
        let mut stmt = self.connection.prepare(
            "SELECT at,actor,action,item_id FROM audit ORDER BY sequence DESC LIMIT 200",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(Audit {
                at: r.get(0)?,
                actor: r.get(1)?,
                action: r.get(2)?,
                item_id: r.get(3)?,
            })
        })?;
        let audit = rows.collect::<std::result::Result<Vec<_>, _>>()?;
        let proposals = self.proposals()?;
        self.check()?;
        Ok(Snapshot {
            items,
            grants,
            proposals,
            audit,
        })
    }
    pub fn owner_item(&self, id: uuid::Uuid) -> Result<Item> {
        self.check()?;
        let raw: Option<String> = self.connection.query_row(
            "SELECT json FROM items WHERE id=?1", [id.to_string()], |r| r.get(0)
        ).optional()?;
        let raw = Zeroizing::new(raw.ok_or(Error::Invalid)?);
        let item = serde_json::from_str(&raw)?;
        self.check()?;
        Ok(item)
    }
    pub fn save_item(&mut self, item: Item) -> Result<()> {
        self.check()?;
        item.validate()?;
        let tx = self.connection.transaction()?;
        Self::write_item(&tx, item, "manual")?;
        tx.commit()?;
        self.check()
    }
    pub(super) fn write_item(
        tx: &rusqlite::Transaction<'_>,
        mut item: Item,
        source_kind: &str,
    ) -> Result<()> {
        let previous: Option<(u32, String)> = tx
            .query_row(
                "SELECT version,json FROM items WHERE id=?1",
                [item.id.to_string()],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        if let Some((version, previous)) = previous {
            if item.version != version.checked_add(1).ok_or(Error::Conflict)? {
                return Err(Error::Conflict);
            }
            let json = Zeroizing::new(previous);
            let old: Item = serde_json::from_str(&json)?;
            item.created_at = old.created_at;
            item.source = old.source;
        } else if item.version != 1 {
            return Err(Error::Conflict);
        }
        let now = Utc::now();
        if item.version == 1 {
            item.created_at = now;
            item.source.kind = source_kind.into();
            item.source.reference = None;
        }
        item.updated_at = now;
        item.provenance.actor = "owner".into();
        item.provenance.at = now;
        let json = Zeroizing::new(serde_json::to_string(&item)?);
        tx.execute(
            "INSERT INTO history VALUES (?1,?2,?3)",
            params![item.id.to_string(), item.version, json.as_str()],
        )?;
        tx.execute("INSERT INTO items VALUES (?1,?2,?3) ON CONFLICT(id) DO UPDATE SET version=excluded.version,json=excluded.json",params![item.id.to_string(),item.version,json.as_str()])?;
        tx.execute(
            "INSERT INTO audit(at,actor,action,item_id) VALUES (?1,'owner',?2,?3)",
            params![
                now.to_rfc3339(),
                if item.version == 1 {
                    "Created memory"
                } else {
                    "Updated memory"
                },
                item.id.to_string()
            ],
        )?;
        Ok(())
    }
    pub fn save_grant(&mut self, grant: Grant) -> Result<()> {
        self.check()?;
        grant.validate()?;
        let json = Zeroizing::new(serde_json::to_string(&grant)?);
        let tx = self.connection.transaction()?;
        tx.execute(
            "INSERT INTO grants VALUES (?1,?2) ON CONFLICT(agent) DO UPDATE SET json=excluded.json",
            params![grant.agent, json.as_str()],
        )?;
        tx.execute(
            "INSERT INTO audit(at,actor,action) VALUES (?1,'owner','Updated agent permissions')",
            [Utc::now().to_rfc3339()],
        )?;
        tx.commit()?;
        self.check()
    }
    pub fn revoke_all(&mut self) -> Result<()> {
        self.check()?;
        let tx = self.connection.transaction()?;
        tx.execute("DELETE FROM grants", [])?;
        tx.execute("INSERT INTO audit(at,actor,action) VALUES (?1,'owner','Revoked all agent permissions')",[Utc::now().to_rfc3339()])?;
        tx.commit()?;
        self.check()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const PASS: &[u8] = b"four long words for tests only";
    #[test]
    fn owner_selected_read_uses_current_vault_item() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::create(dir.path(), PASS).unwrap();
        let original = item();
        let id = original.id;
        vault.save_item(original.clone()).unwrap();
        assert_eq!(vault.owner_item(id).unwrap().body, original.body);
        assert!(matches!(vault.owner_item(uuid::Uuid::new_v4()), Err(Error::Invalid)));
        let mut updated = original;
        updated.version = 2;
        updated.body = "Updated synthetic context".into();
        vault.save_item(updated).unwrap();
        assert_eq!(vault.owner_item(id).unwrap().body, "Updated synthetic context");
    }
    #[test]
    fn onboarding_batch_is_atomic_and_starts_without_grants() {
        let dir=tempfile::tempdir().unwrap();let mut v=Vault::create(dir.path(),PASS).unwrap();
        let existing=item();v.save_item(existing.clone()).unwrap();
        assert!(v.save_foundation(vec![item(),existing]).is_err());
        assert_eq!(v.snapshot().unwrap().items.len(),1);
        v.save_foundation(vec![item(),item()]).unwrap();
        let snapshot=v.snapshot().unwrap();assert_eq!(snapshot.items.len(),3);assert!(snapshot.grants.is_empty());
        assert_eq!(snapshot.items.iter().filter(|i|i.source.kind=="onboarding").count(),2);
    }
    #[test]
    fn agent_reads_are_scoped_audited_and_revocable() {
        let dir=tempfile::tempdir().unwrap();let mut v=Vault::create(dir.path(),PASS).unwrap();
        let allowed=item();let id=allowed.id;v.save_item(allowed).unwrap();
        let mut hidden=item();hidden.domain="health".into();hidden.title="Hidden canary".into();let hidden_id=hidden.id;v.save_item(hidden).unwrap();
        assert!(v.agent_get("Claude Desktop",id).is_err());
        let mut grant:Grant=serde_json::from_value(serde_json::json!({"agent":"Claude Desktop","domains":{"work":"read"},"ceiling":"personal","excludedIds":[],"excludedTags":[],"expiresAt":null})).unwrap();
        v.save_grant(grant.clone()).unwrap();
        let results=v.agent_search("Claude Desktop","",0).unwrap();
        assert_eq!(results["items"].as_array().unwrap().len(),1);
        assert!(!results.to_string().contains("Hidden canary"));
        assert!(v.agent_get("Claude Desktop",hidden_id).is_err());
        assert!(v.agent_get("Claude Desktop",uuid::Uuid::new_v4()).is_err());
        assert_eq!(v.agent_get("Claude Desktop",id).unwrap().id,id);
        assert!(v.snapshot().unwrap().audit.iter().any(|a|a.actor=="Claude Desktop" && a.action=="Read memory"));
        grant.domains.insert("work".into(),crate::policy::Level::Summary);v.save_grant(grant).unwrap();
        assert!(v.agent_get("Claude Desktop",id).is_err());
        assert!(v.agent_search("Claude Desktop","",0).unwrap()["items"].as_array().unwrap().is_empty());
        v.revoke_all().unwrap();assert!(v.agent_search("Claude Desktop","",0).is_err());
    }
    #[test]
    fn creates_reopens_and_rejects_wrong_key() {
        let dir = tempfile::tempdir().unwrap();
        let v = Vault::create(dir.path(), PASS).unwrap();
        assert!(v.snapshot().unwrap().items.is_empty());
        drop(v);
        assert!(Vault::open(dir.path(), b"incorrect password").is_err());
        assert!(Vault::open(dir.path(), PASS).is_ok());
    }
    #[test]
    fn removal_denies_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let v = Vault::create(dir.path(), PASS).unwrap();
        fs::remove_file(dir.path().join("mission/manifest.json")).unwrap();
        assert!(v.snapshot().is_err());
    }
    #[test]
    fn never_overwrites_existing_vault() {
        let dir = tempfile::tempdir().unwrap();
        drop(Vault::create(dir.path(), PASS).unwrap());
        let before = fs::read(dir.path().join("mission/manifest.json")).unwrap();
        assert!(Vault::create(dir.path(), PASS).is_err());
        assert_eq!(
            before,
            fs::read(dir.path().join("mission/manifest.json")).unwrap()
        );
    }
    #[test]
    fn reset_rejects_wrong_passphrase_and_allows_fresh_onboarding() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("unrelated.txt"), b"keep this").unwrap();
        let mut vault = Vault::create(dir.path(), PASS).unwrap();
        let first_manifest = fs::read(dir.path().join("mission/manifest.json")).unwrap();
        vault.save_item(item()).unwrap();
        let challenge = vault.reset_challenge().unwrap();
        assert!(Vault::authorize_reset(&challenge, b"wrong passphrase").is_err());
        assert_eq!(vault.snapshot().unwrap().items.len(), 1);
        Vault::authorize_reset(&challenge, PASS).unwrap();
        vault.delete_verified().unwrap();
        assert!(!dir.path().join("mission").exists());
        assert_eq!(fs::read(dir.path().join("unrelated.txt")).unwrap(), b"keep this");
        let fresh = Vault::create(dir.path(), PASS).unwrap();
        assert!(fresh.snapshot().unwrap().items.is_empty());
        assert_ne!(fs::read(dir.path().join("mission/manifest.json")).unwrap(), first_manifest);
    }
    #[test]
    fn reset_refuses_unexpected_files_without_deleting_memory() {
        let dir = tempfile::tempdir().unwrap();
        let mut vault = Vault::create(dir.path(), PASS).unwrap();
        vault.save_item(item()).unwrap();
        fs::write(dir.path().join("mission/unknown.txt"), b"not a Mission file").unwrap();
        let challenge = vault.reset_challenge().unwrap();
        Vault::authorize_reset(&challenge, PASS).unwrap();
        assert!(matches!(vault.delete_verified(), Err(Error::Denied)));
        assert_eq!(Vault::open(dir.path(), PASS).unwrap().snapshot().unwrap().items.len(), 1);
    }
    #[test]
    fn database_is_not_plaintext_sqlite() {
        let dir = tempfile::tempdir().unwrap();
        drop(Vault::create(dir.path(), PASS).unwrap());
        let bytes = fs::read(dir.path().join("mission/vault.db")).unwrap();
        assert!(!bytes.starts_with(b"SQLite format 3"));
        assert!(!bytes.windows(8).any(|w| w == b"vault_id"));
    }
    fn item() -> Item {
        serde_json::from_value(serde_json::json!({"id":uuid::Uuid::new_v4(),"domain":"work","type":"note","title":"Synthetic canary","body":"MISSION_SYNTHETIC_CANARY_928614","fields":{},"tags":[],"links":[],"sensitivity":"personal","confidence":1.0,"source":{"kind":"fake-agent"},"createdAt":Utc::now(),"updatedAt":Utc::now(),"validFrom":null,"validUntil":null,"version":1,"provenance":{"actor":"spoofed","at":Utc::now()}})).unwrap()
    }
    #[test]
    fn transactional_edits_stamp_owner_and_reject_stale_versions() {
        let dir = tempfile::tempdir().unwrap();
        let mut v = Vault::create(dir.path(), PASS).unwrap();
        let original = item();
        v.save_item(original.clone()).unwrap();
        assert!(matches!(
            v.save_item(original.clone()),
            Err(Error::Conflict)
        ));
        let snap = v.snapshot().unwrap();
        assert_eq!(snap.items[0].provenance.actor, "owner");
        assert_eq!(snap.items[0].source.kind, "manual");
        assert_eq!(snap.audit.len(), 1);
        let mut next = original;
        next.version = 2;
        next.title = "Revised synthetic item".into();
        v.save_item(next).unwrap();
        assert_eq!(v.snapshot().unwrap().items[0].version, 2);
        assert_eq!(
            v.connection
                .query_row("SELECT count(*) FROM history", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            2
        );
    }
    #[test]
    fn canary_not_present_in_vault_files() {
        let dir = tempfile::tempdir().unwrap();
        let mut v = Vault::create(dir.path(), PASS).unwrap();
        v.save_item(item()).unwrap();
        drop(v);
        let canary = b"MISSION_SYNTHETIC_CANARY_928614";
        for entry in fs::read_dir(dir.path().join("mission")).unwrap() {
            let bytes = fs::read(entry.unwrap().path()).unwrap();
            assert!(!bytes.windows(canary.len()).any(|w| w == canary));
        }
    }
    #[test]
    fn import_is_reviewed_atomic_and_replay_safe() {
        let dir = tempfile::tempdir().unwrap();
        let mut v = Vault::create(dir.path(), PASS).unwrap();
        let original = item();
        let original_id = original.id;
        v.stage_import(vec![original]).unwrap();
        let snap = v.snapshot().unwrap();
        assert!(snap.items.is_empty());
        assert_eq!(snap.proposals.len(), 1);
        assert_ne!(snap.proposals[0].item.id, original_id);
        let id = snap.proposals[0].id;
        v.review_proposal(id, true).unwrap();
        let snap = v.snapshot().unwrap();
        assert!(snap.proposals.is_empty());
        assert_eq!(snap.items.len(), 1);
        assert_eq!(snap.items[0].source.kind, "file-import");
        assert!(matches!(v.review_proposal(id, true), Err(Error::Conflict)));
        v.stage_import(vec![item()]).unwrap();
        let id = v.proposals().unwrap()[0].id;
        v.review_proposal(id, false).unwrap();
        assert_eq!(v.snapshot().unwrap().items.len(), 1);
        let mut invalid = item();
        invalid.title.clear();
        assert!(v.stage_import(vec![item(), invalid]).is_err());
        assert!(v.proposals().unwrap().is_empty());
    }
    #[test]
    fn restore_preserves_history_and_checks_current_version() {
        let dir = tempfile::tempdir().unwrap();
        let mut v = Vault::create(dir.path(), PASS).unwrap();
        let first = item();
        let id = first.id;
        let title = first.title.clone();
        v.save_item(first.clone()).unwrap();
        let mut next = first;
        next.version = 2;
        next.title = "Second version".into();
        v.save_item(next).unwrap();
        assert!(matches!(v.restore_revision(id, 1, 1), Err(Error::Conflict)));
        v.restore_revision(id, 1, 2).unwrap();
        let history = v.history(id).unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].version, 3);
        assert_eq!(history[0].title, title);
        assert_eq!(history[1].title, "Second version");
    }
}
