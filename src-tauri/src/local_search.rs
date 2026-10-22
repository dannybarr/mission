use crate::model::Item;
use std::collections::BTreeSet;

// Deliberately small, auditable, offline concept vocabulary. No model or index is downloaded.
const CONCEPTS: &[(&str, &[&str])] = &[
    ("fitness", &["gym", "workout", "workouts", "exercise", "exercises", "fitness", "train", "training", "lifting", "lift", "weights", "weightlifting"]),
    ("routine", &["split", "routine", "routines", "schedule", "scheduled", "plan", "programme", "program", "regimen"]),
    ("monday", &["monday", "mondays", "mon"]),
    ("tuesday", &["tuesday", "tuesdays", "tue"]),
    ("wednesday", &["wednesday", "wednesdays", "wed"]),
    ("thursday", &["thursday", "thursdays", "thu"]),
    ("friday", &["friday", "fridays", "fri"]),
    ("saturday", &["saturday", "saturdays", "sat"]),
    ("sunday", &["sunday", "sundays", "sun"]),
];
const STOP: &[&str] = &["a", "an", "and", "are", "at", "can", "do", "for", "from", "i", "in", "is", "me", "my", "of", "on", "or", "the", "to", "what", "when", "where", "which", "with"];

fn tokens(text: &str) -> impl Iterator<Item = String> + '_ {
    text.split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase())
}
fn concept(term: &str) -> String {
    CONCEPTS.iter().find(|(_, forms)| forms.contains(&term))
        .map(|(name, _)| (*name).to_owned())
        .unwrap_or_else(|| term.to_owned())
}
fn concepts(text: &str) -> BTreeSet<String> {
    tokens(text).filter(|word| !STOP.contains(&word.as_str()))
        .map(|word| concept(&word)).collect()
}
pub(crate) fn score(item: &Item, query: &str) -> Option<usize> {
    let asked = concepts(query);
    if asked.is_empty() { return Some(1); }
    let title = concepts(&item.title);
    let body = concepts(&item.body);
    let tags: BTreeSet<String> = item.tags.iter().flat_map(|tag| concepts(tag)).collect();
    let mut score = 0;
    for word in asked {
        if title.contains(&word) { score += 4; }
        else if tags.contains(&word) { score += 3; }
        else if body.contains(&word) { score += 1; }
        else { return None; }
    }
    Some(score)
}
