//! Owner-reviewed imports and reversible revision history, stored only in SQLCipher.
use crate::{model::Item, vault::Vault, Error, Result};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use zeroize::Zeroizing;

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Proposal {
    pub id: Uuid,
    pub agent: String,
    pub item: Item,
    pub reason: String,
}

impl Vault {
    pub fn save_foundation(&mut self, items:Vec<Item>)->Result<()> {
        self.check()?;
        if items.is_empty() || items.len()>100 { return Err(Error::Invalid); }
        for item in &items { item.validate()?; if item.version!=1 {return Err(Error::Invalid);} }
        let tx=self.connection.transaction()?;
        for item in items { Self::write_item(&tx,item,"onboarding")?; }
        tx.execute("INSERT INTO audit(at,actor,action) VALUES (?1,'owner','Saved reviewed onboarding')",[Utc::now().to_rfc3339()])?;
        tx.commit()?;self.check()
    }
    pub(super) fn prepare_review(&self) -> Result<()> {
        self.connection.execute_batch(
            "BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS proposals (id TEXT PRIMARY KEY,json TEXT NOT NULL);
            PRAGMA user_version=2; COMMIT;",
        )?;
        Ok(())
    }
    pub fn proposals(&self) -> Result<Vec<Proposal>> {
        self.check()?;
        let mut stmt = self
            .connection
            .prepare("SELECT json FROM proposals ORDER BY rowid")?;
        let mut result = Vec::new();
        for row in stmt.query_map([], |r| r.get::<_, String>(0))? {
            result.push(serde_json::from_str(&Zeroizing::new(row?))?);
        }
        self.check()?;
        Ok(result)
    }
    /// A bounded batch is staged atomically. Import content is never trusted as authority.
    pub fn stage_import(&mut self, items: Vec<Item>) -> Result<()> {
        self.check()?;
        if items.is_empty() || items.len() > 100 {
            return Err(Error::Invalid);
        }
        for item in &items {
            item.validate()?;
        }
        let tx = self.connection.transaction()?;
        let pending: i64 = tx.query_row("SELECT count(*) FROM proposals", [], |r| r.get(0))?;
        if pending + items.len() as i64 > 500 {
            return Err(Error::Invalid);
        }
        for mut item in items {
            // Imported identifiers cannot overwrite existing memory.
            item.id = Uuid::new_v4();
            item.version = 1;
            item.links.clear();
            let proposal = Proposal {
                id: Uuid::new_v4(),
                agent: "File import".into(),
                item,
                reason: "Review this imported memory before adding it to your vault.".into(),
            };
            let json = Zeroizing::new(serde_json::to_string(&proposal)?);
            tx.execute(
                "INSERT INTO proposals VALUES (?1,?2)",
                params![proposal.id.to_string(), json.as_str()],
            )?;
        }
        tx.execute(
            "INSERT INTO audit(at,actor,action) VALUES (?1,'owner','Staged import for review')",
            [Utc::now().to_rfc3339()],
        )?;
        tx.commit()?;
        self.check()
    }
    pub fn review_proposal(&mut self, id: Uuid, accept: bool) -> Result<()> {
        self.check()?;
        let tx = self.connection.transaction()?;
        let json: Option<String> = tx
            .query_row(
                "SELECT json FROM proposals WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        let json = Zeroizing::new(json.ok_or(Error::Conflict)?);
        let proposal: Proposal = serde_json::from_str(&json)?;
        if accept {
            proposal.item.validate()?;
            Self::write_item(&tx, proposal.item, "file-import")?;
        }
        tx.execute("DELETE FROM proposals WHERE id=?1", [id.to_string()])?;
        tx.execute(
            "INSERT INTO audit(at,actor,action) VALUES (?1,'owner',?2)",
            params![
                Utc::now().to_rfc3339(),
                if accept {
                    "Accepted proposal"
                } else {
                    "Rejected proposal"
                }
            ],
        )?;
        tx.commit()?;
        self.check()
    }
    pub fn history(&self, id: Uuid) -> Result<Vec<Item>> {
        self.check()?;
        let mut stmt = self
            .connection
            .prepare("SELECT json FROM history WHERE id=?1 ORDER BY version DESC")?;
        let mut result = Vec::new();
        for row in stmt.query_map([id.to_string()], |r| r.get::<_, String>(0))? {
            result.push(serde_json::from_str(&Zeroizing::new(row?))?);
        }
        self.check()?;
        Ok(result)
    }
    /// Restore creates a new revision and preserves all prior revisions.
    pub fn restore_revision(
        &mut self,
        id: Uuid,
        version: u32,
        expected_version: u32,
    ) -> Result<()> {
        self.check()?;
        let tx = self.connection.transaction()?;
        let current: Option<u32> = tx
            .query_row(
                "SELECT version FROM items WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        if current != Some(expected_version) {
            return Err(Error::Conflict);
        }
        let json: Option<String> = tx
            .query_row(
                "SELECT json FROM history WHERE id=?1 AND version=?2",
                params![id.to_string(), version],
                |r| r.get(0),
            )
            .optional()?;
        let mut item: Item = serde_json::from_str(&Zeroizing::new(json.ok_or(Error::Invalid)?))?;
        item.version = expected_version.checked_add(1).ok_or(Error::Conflict)?;
        item.validate()?;
        Self::write_item(&tx, item, "manual")?;
        tx.execute(
            "INSERT INTO audit(at,actor,action,item_id) VALUES (?1,'owner','Restored revision',?2)",
            params![Utc::now().to_rfc3339(), id.to_string()],
        )?;
        tx.commit()?;
        self.check()
    }
}
