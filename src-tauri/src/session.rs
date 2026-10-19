//! Monotonic session leases never hold their mutex during storage operations.
use crate::{Error, Result};
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};
pub const LEASE_DURATION: Duration = Duration::from_millis(600);
#[derive(Default)]
struct Inner {
    epoch: u64,
    deadline: Option<Instant>,
    activated: bool,
}
#[derive(Default)]
pub struct Lease(Mutex<Inner>);
impl Lease {
    pub fn pending(&self, epoch: u64) -> bool {
        self.0
            .lock()
            .is_ok_and(|s| s.epoch == epoch && !s.activated)
    }
    pub fn begin(&self) -> Result<u64> {
        let mut s = self.0.lock().map_err(|_| Error::Locked)?;
        s.epoch = s.epoch.checked_add(1).ok_or(Error::Locked)?;
        s.deadline = None;
        s.activated = false;
        Ok(s.epoch)
    }
    pub fn activate(&self, epoch: u64, now: Instant) -> Result<()> {
        let mut s = self.0.lock().map_err(|_| Error::Locked)?;
        if s.epoch != epoch || s.activated {
            return Err(Error::Locked);
        }
        s.activated = true;
        s.deadline = Some(now + LEASE_DURATION);
        Ok(())
    }
    pub fn current(&self, now: Instant) -> Result<u64> {
        let mut s = self.0.lock().map_err(|_| Error::Locked)?;
        if !s.deadline.is_some_and(|d| now < d) {
            s.deadline = None;
            return Err(Error::Locked);
        }
        Ok(s.epoch)
    }
    pub fn valid(&self, epoch: u64, now: Instant) -> bool {
        self.current(now).is_ok_and(|current| current == epoch)
    }
    pub fn renew(&self, epoch: u64, now: Instant) -> Result<()> {
        let mut s = self.0.lock().map_err(|_| Error::Locked)?;
        if s.epoch != epoch || !s.deadline.is_some_and(|d| now < d) {
            return Err(Error::Locked);
        }
        s.deadline = Some(now + LEASE_DURATION);
        Ok(())
    }
    pub fn invalidate(&self, epoch: u64) {
        if let Ok(mut s) = self.0.lock() {
            if s.epoch == epoch {
                s.deadline = None;
                s.activated = true;
            }
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn starts_locked() {
        assert!(Lease::default().current(Instant::now()).is_err());
    }
    #[test]
    fn expires_without_device_io() {
        let l = Lease::default();
        let now = Instant::now();
        let e = l.begin().unwrap();
        l.activate(e, now).unwrap();
        assert!(l.valid(e, now + LEASE_DURATION - Duration::from_millis(1)));
        assert!(!l.valid(e, now + LEASE_DURATION));
    }
    #[test]
    fn cannot_revive_expired_lease() {
        let l = Lease::default();
        let now = Instant::now();
        let e = l.begin().unwrap();
        l.activate(e, now).unwrap();
        assert!(l.renew(e, now + LEASE_DURATION).is_err());
        assert!(l.activate(e, now + LEASE_DURATION).is_err());
    }
    #[test]
    fn revoke_cancels_inflight_unlock() {
        let l = Lease::default();
        let old = l.begin().unwrap();
        l.begin().unwrap();
        assert!(l.activate(old, Instant::now()).is_err());
    }
    #[test]
    fn old_heartbeat_cannot_touch_new_session() {
        let l = Lease::default();
        let now = Instant::now();
        let old = l.begin().unwrap();
        l.activate(old, now).unwrap();
        let new = l.begin().unwrap();
        l.activate(new, now).unwrap();
        assert!(l.renew(old, now).is_err());
        l.invalidate(old);
        assert!(l.valid(new, now));
    }
}
