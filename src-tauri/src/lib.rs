#[cfg(feature = "storage")]
pub mod agent_access;
pub mod crypto;
#[cfg(feature = "desktop")]
pub mod desktop;
#[cfg(feature = "storage")]
pub mod device;
#[cfg(feature = "storage")]
pub mod mcp;
pub mod model;
pub mod policy;
#[cfg(feature = "storage")]
pub mod review;
pub mod session;
#[cfg(feature = "storage")]
pub mod vault;
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("Vault unavailable or locked")]
    Locked,
    #[error("Access denied")]
    Denied,
    #[error("Invalid vault or passphrase")]
    Crypto,
    #[error("Invalid input")]
    Invalid,
    #[error("Storage operation failed")]
    Storage,
    #[error("Version conflict; reload before editing")]
    Conflict,
}
impl From<std::io::Error> for Error {
    fn from(_: std::io::Error) -> Self {
        Self::Storage
    }
}
#[cfg(feature = "storage")]
impl From<rusqlite::Error> for Error {
    fn from(_: rusqlite::Error) -> Self {
        Self::Storage
    }
}
impl From<serde_json::Error> for Error {
    fn from(_: serde_json::Error) -> Self {
        Self::Invalid
    }
}
pub type Result<T> = std::result::Result<T, Error>;
