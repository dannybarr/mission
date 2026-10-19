use crate::{Error, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
pub const DOMAINS: &[&str] = &[
    "identity",
    "work",
    "projects",
    "health",
    "fitness",
    "routines",
    "people",
    "home",
    "finance",
    "learning",
    "preferences",
    "goals",
    "sensitive",
];
pub const TYPES: &[&str] = &[
    "fact",
    "preference",
    "goal",
    "commitment",
    "routine",
    "event",
    "person",
    "place",
    "note",
    "document-ref",
    "health-observation",
    "metric",
];
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Sensitivity {
    Public,
    Personal,
    Private,
    Sensitive,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Source {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reference: Option<String>,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub id: Uuid,
    pub relation: String,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(deny_unknown_fields)]
pub struct Provenance {
    pub actor: String,
    pub at: DateTime<Utc>,
}
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Item {
    pub id: Uuid,
    pub domain: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub title: String,
    pub body: String,
    pub fields: serde_json::Value,
    pub tags: Vec<String>,
    pub links: Vec<Link>,
    pub sensitivity: Sensitivity,
    pub confidence: f64,
    pub source: Source,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub valid_from: Option<DateTime<Utc>>,
    pub valid_until: Option<DateTime<Utc>>,
    pub version: u32,
    pub provenance: Provenance,
}
impl Item {
    pub fn validate(&self) -> Result<()> {
        if !DOMAINS.contains(&self.domain.as_str())
            || self.domain == "sensitive"
            || self.sensitivity == Sensitivity::Sensitive
            || !TYPES.contains(&self.kind.as_str())
            || self.title.trim().is_empty()
            || self.title.len() > 640
            || self.body.len() > 128000
            || !self.confidence.is_finite()
            || !(0.0..=1.0).contains(&self.confidence)
            || self.version == 0
            || self.tags.len() > 30
            || self.tags.iter().any(|t| t.is_empty() || t.len() > 256)
            || self.links.len() > 100
            || self
                .links
                .iter()
                .any(|l| l.relation.is_empty() || l.relation.len() > 256)
            || self.source.kind.is_empty()
            || self.source.kind.len() > 256
            || self
                .source
                .reference
                .as_ref()
                .is_some_and(|s| s.len() > 2048)
            || !self.fields.is_object()
            || serde_json::to_vec(&self.fields)?.len() > 32000
        {
            return Err(Error::Invalid);
        }
        if let (Some(from), Some(until)) = (self.valid_from, self.valid_until) {
            if from > until {
                return Err(Error::Invalid);
            }
        }
        let date = |key: &str| {
            self.fields
                .get(key)
                .and_then(|v| v.as_str())
                .is_some_and(|s| DateTime::parse_from_rfc3339(s).is_ok())
        };
        match self.kind.as_str() {
            "commitment" => {
                if !date("dueAt")
                    || !self
                        .fields
                        .get("status")
                        .and_then(|v| v.as_str())
                        .is_some_and(|s| ["open", "done", "cancelled"].contains(&s))
                {
                    return Err(Error::Invalid);
                }
            }
            "routine" => {
                if !self
                    .fields
                    .get("cadenceDays")
                    .and_then(|v| v.as_u64())
                    .is_some_and(|v| (1..=365).contains(&v))
                    || (!self
                        .fields
                        .get("lastCompletedAt")
                        .is_some_and(|v| v.is_null())
                        && !date("lastCompletedAt"))
                {
                    return Err(Error::Invalid);
                }
            }
            "metric" => {
                if !date("observedAt")
                    || !self.fields.get("value").is_some_and(|v| v.is_number())
                    || !self
                        .fields
                        .get("unit")
                        .and_then(|v| v.as_str())
                        .is_some_and(|v| !v.is_empty())
                {
                    return Err(Error::Invalid);
                }
            }
            _ => {}
        }
        Ok(())
    }
}
