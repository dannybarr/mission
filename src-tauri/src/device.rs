use crate::{Error, Result};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};
use sysinfo::Disks;
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub label: String,
    pub path: String,
    pub has_vault: bool,
}
pub fn devices() -> Vec<Device> {
    Disks::new_with_refreshed_list()
        .list()
        .iter()
        .filter(|d| d.is_removable())
        .map(|d| {
            let path = d.mount_point().to_string_lossy().to_string();
            Device {
                id: path.clone(),
                label: d.name().to_string_lossy().to_string(),
                has_vault: d.mount_point().join("mission/manifest.json").is_file(),
                path,
            }
        })
        .collect()
}
pub fn resolve(id: &str) -> Result<PathBuf> {
    let device = devices()
        .into_iter()
        .find(|d| d.id == id)
        .ok_or(Error::Denied)?;
    let root = fs::canonicalize(device.path)?;
    reject_links(&root)?;
    Ok(root)
}
pub fn reject_links(path: &Path) -> Result<()> {
    let meta = fs::symlink_metadata(path)?;
    if meta.file_type().is_symlink() {
        return Err(Error::Denied);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err(Error::Denied);
        }
    }
    Ok(())
}
pub fn check_child(root: &Path, path: &Path) -> Result<()> {
    reject_links(root)?;
    reject_links(path)?;
    if !fs::canonicalize(path)?.starts_with(fs::canonicalize(root)?) {
        return Err(Error::Denied);
    }
    Ok(())
}
