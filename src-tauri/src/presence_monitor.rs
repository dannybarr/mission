//! Renew an open session from an independent file-presence proof, not the database lock.
use crate::{session::Lease, vault::Presence};
use std::time::Instant;

pub(crate) fn check_and_renew(lease: &Lease, epoch: u64, proof: &Presence) -> bool {
    check_and_renew_at(lease, epoch, proof, Instant::now())
}

fn check_and_renew_at(lease: &Lease, epoch: u64, proof: &Presence, now: Instant) -> bool {
    if !lease.valid(epoch, now) || proof.check().is_err() || lease.renew(epoch, now).is_err() {
        lease.invalidate(epoch);
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::Vault;
    use chrono::Utc;
    use std::{fs, sync::Mutex, time::Duration};

    #[test]
    fn slow_save_keeps_lease_alive_without_database_lock() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path(), b"long synthetic passphrase").unwrap();
        let proof = vault.presence();
        let vault = Mutex::new(vault);
        let lease = Lease::default();
        let epoch = lease.begin().unwrap();
        let start = Instant::now();
        lease.activate(epoch, start).unwrap();
        let mut guard = vault.lock().unwrap();
        assert!(vault.try_lock().is_err());
        for tick in 1..=15 {
            assert!(check_and_renew_at(
                &lease,
                epoch,
                &proof,
                start + Duration::from_millis(tick * 100),
            ));
        }
        let now = Utc::now();
        let item = serde_json::from_value(serde_json::json!({
            "id": uuid::Uuid::new_v4(), "domain": "work", "type": "note",
            "title": "Synthetic save", "body": "No personal data", "fields": {},
            "tags": [], "links": [], "sensitivity": "personal", "confidence": 1.0,
            "source": {"kind": "manual"}, "createdAt": now, "updatedAt": now,
            "validFrom": null, "validUntil": null, "version": 1,
            "provenance": {"actor": "owner", "at": now}
        })).unwrap();
        guard.save_item(item).unwrap();
        drop(guard);
        assert!(lease.valid(epoch, start + Duration::from_millis(1500)));
        assert!(vault.lock().unwrap().snapshot().is_ok());
    }

    #[test]
    fn removal_revokes_even_when_database_is_busy() {
        let dir = tempfile::tempdir().unwrap();
        let vault = Vault::create(dir.path(), b"long synthetic passphrase").unwrap();
        let proof = vault.presence();
        let vault = Mutex::new(vault);
        let lease = Lease::default();
        let epoch = lease.begin().unwrap();
        let start = Instant::now();
        lease.activate(epoch, start).unwrap();
        let guard = vault.lock().unwrap();
        fs::remove_file(dir.path().join("mission/manifest.json")).unwrap();
        assert!(!check_and_renew_at(&lease, epoch, &proof, start + Duration::from_millis(200)));
        assert!(lease.current(Instant::now()).is_err());
        drop(guard);
    }
}
