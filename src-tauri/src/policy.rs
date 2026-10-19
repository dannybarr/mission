use crate::model::{Item, Sensitivity, DOMAINS};
use crate::{Error, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    None,
    Summary,
    Read,
    Suggest,
    Write,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Grant {
    pub agent: String,
    pub domains: BTreeMap<String, Level>,
    pub ceiling: Sensitivity,
    pub excluded_ids: Vec<Uuid>,
    pub excluded_tags: Vec<String>,
    pub expires_at: Option<DateTime<Utc>>,
}
impl Grant {
    pub fn validate(&self) -> Result<()> {
        if self.agent.trim().is_empty()
            || self.agent.len() > 100
            || self.domains.keys().any(|d| !DOMAINS.contains(&d.as_str()))
            || self.ceiling == Sensitivity::Sensitive
            || self
                .domains
                .get("sensitive")
                .is_some_and(|l| *l != Level::None)
            || self.excluded_ids.len() > 10000
            || self.excluded_tags.len() > 100
            || self.excluded_tags.iter().any(|s| s.len() > 256)
        {
            return Err(Error::Invalid);
        }
        Ok(())
    }
    pub fn permits(&self, item: &Item, required: Level, now: DateTime<Utc>) -> bool {
        if self.validate().is_err()
            || required < Level::Read
            || item.domain == "sensitive"
            || item.sensitivity == Sensitivity::Sensitive
            || item.sensitivity > self.ceiling
            || self.expires_at.is_some_and(|t| t <= now)
            || self.excluded_ids.contains(&item.id)
            || item.tags.iter().any(|t| self.excluded_tags.contains(t))
        {
            return false;
        }
        self.domains
            .get(&item.domain)
            .copied()
            .unwrap_or(Level::None)
            >= required
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item() -> Item {
        serde_json::from_value(serde_json::json!({"id":Uuid::new_v4(),"domain":"work","type":"note","title":"Test context","body":"private test body","fields":{},"tags":["therapy"],"links":[],"sensitivity":"personal","confidence":1.0,"source":{"kind":"manual"},"createdAt":Utc::now(),"updatedAt":Utc::now(),"validFrom":null,"validUntil":null,"version":1,"provenance":{"actor":"owner","at":Utc::now()}})).unwrap()
    }
    fn grant() -> Grant {
        Grant {
            agent: "test".into(),
            domains: BTreeMap::new(),
            ceiling: Sensitivity::Personal,
            excluded_ids: vec![],
            excluded_tags: vec![],
            expires_at: None,
        }
    }
    #[test]
    fn default_deny_and_explicit_read() {
        let i = item();
        let mut g = grant();
        assert!(!g.permits(&i, Level::Read, Utc::now()));
        g.domains.insert("work".into(), Level::Read);
        assert!(g.permits(&i, Level::Read, Utc::now()));
        assert!(!g.permits(&i, Level::Write, Utc::now()));
    }
    #[test]
    fn summary_never_grants_full_read() {
        let i = item();
        let mut g = grant();
        g.domains.insert("work".into(), Level::Summary);
        assert!(!g.permits(&i, Level::Read, Utc::now()));
    }
    #[test]
    fn exclusions_override_write() {
        let i = item();
        let mut g = grant();
        g.domains.insert("work".into(), Level::Write);
        g.excluded_tags.push("therapy".into());
        assert!(!g.permits(&i, Level::Read, Utc::now()));
        g.excluded_tags.clear();
        g.excluded_ids.push(i.id);
        assert!(!g.permits(&i, Level::Read, Utc::now()));
    }
    #[test]
    fn expires_at_boundary() {
        let i = item();
        let mut g = grant();
        g.domains.insert("work".into(), Level::Read);
        let now = Utc::now();
        g.expires_at = Some(now);
        assert!(!g.permits(&i, Level::Read, now));
    }
    #[test]
    fn sensitive_denied_even_with_broad_grant() {
        let mut i = item();
        let mut g = grant();
        g.domains.insert("work".into(), Level::Write);
        g.ceiling = Sensitivity::Sensitive;
        i.sensitivity = Sensitivity::Sensitive;
        assert!(!g.permits(&i, Level::Read, Utc::now()));
    }
}
