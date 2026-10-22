use crate::{
    model::Item,
    policy::{Grant, Level},
    vault::Vault,
    Error, Result,
};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use uuid::Uuid;
use zeroize::Zeroizing;

impl Vault {
    fn agent_grant(&self, agent: &str) -> Result<Grant> {
        let raw: Option<String> = self
            .connection
            .query_row("SELECT json FROM grants WHERE agent=?1", [agent], |r| {
                r.get(0)
            })
            .optional()?;
        let grant: Grant = serde_json::from_str(&Zeroizing::new(raw.ok_or(Error::Denied)?))?;
        grant.validate()?;
        if grant.agent != agent {
            return Err(Error::Denied);
        }
        Ok(grant)
    }
    pub fn agent_search(
        &mut self,
        agent: &str,
        query: &str,
        offset: usize,
    ) -> Result<serde_json::Value> {
        self.check()?;
        if query.len() > 512 || offset > 10000 {
            return Err(Error::Invalid);
        }
        let grant = self.agent_grant(agent)?;
        let now = Utc::now();
        let mut stmt = self
            .connection
            .prepare("SELECT json FROM items ORDER BY id")?;
        let mut ranked = Vec::new();
        for row in stmt.query_map([], |r| r.get::<_, String>(0))? {
            let item: Item = serde_json::from_str(&Zeroizing::new(row?))?;
            // Permission is checked before matching. Hidden text never enters a search score.
            if grant.permits(&item, Level::Read, now) {
                if let Some(score) = crate::local_search::score(&item, query) {
                    ranked.push((score, item.id, item.title, item.domain, item.kind));
                }
            }
        }
        ranked.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
        let more = ranked.len() > offset.saturating_add(20);
        let results: Vec<_> = ranked.into_iter().skip(offset).take(20).map(|(_, id, title, domain, kind)| {
            // Search intentionally returns metadata only. Content requires a separately audited get.
            serde_json::json!({"id":id,"title":title,"domain":domain,"type":kind})
        }).collect();
        drop(stmt);
        self.connection.execute(
            "INSERT INTO audit(at,actor,action) VALUES (?1,?2,'Searched permitted memory')",
            params![now.to_rfc3339(), agent],
        )?;
        self.check()?;
        Ok(
            serde_json::json!({"items":results,"nextOffset":if more { Some(offset+20) } else { None }}),
        )
    }
    pub fn agent_get(&mut self, agent: &str, id: Uuid) -> Result<Item> {
        self.check()?;
        let grant = self.agent_grant(agent)?;
        let raw: Option<String> = self
            .connection
            .query_row(
                "SELECT json FROM items WHERE id=?1",
                [id.to_string()],
                |r| r.get(0),
            )
            .optional()?;
        let mut item: Item = serde_json::from_str(&Zeroizing::new(raw.ok_or(Error::Denied)?))?;
        if !grant.permits(&item, Level::Read, Utc::now()) {
            return Err(Error::Denied);
        }
        item.links.clear();
        self.connection.execute(
            "INSERT INTO audit(at,actor,action,item_id) VALUES (?1,?2,'Read memory',?3)",
            params![Utc::now().to_rfc3339(), agent, id.to_string()],
        )?;
        self.check()?;
        Ok(item)
    }
}
