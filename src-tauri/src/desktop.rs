use crate::{
    device,
    model::Item,
    policy::Grant,
    session::Lease,
    vault::{Snapshot, Vault},
    Error,
};
use std::{
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::State;
use zeroize::Zeroizing;

#[derive(Default, Clone)]
struct Session {
    vault: Arc<Mutex<Option<(u64, Vault)>>>,
    lease: Arc<Lease>,
    broker: Arc<Mutex<Option<Arc<crate::mcp::Broker>>>>,
}
// A failed presence check destroys the session. Never allow a stale handle after reconnect.
fn with_vault<T>(
    state: &Session,
    f: impl FnOnce(&mut Vault) -> crate::Result<T>,
) -> Result<T, String> {
    let epoch = state
        .lease
        .current(Instant::now())
        .map_err(|e| e.to_string())?;
    with_epoch_vault(state, epoch, f)
}
fn with_epoch_vault<T>(
    state: &Session,
    epoch: u64,
    f: impl FnOnce(&mut Vault) -> crate::Result<T>,
) -> Result<T, String> {
    let mut guard = state.vault.lock().map_err(|_| Error::Locked.to_string())?;
    if !guard.as_ref().is_some_and(|(id, _)| *id == epoch) {
        return Err(Error::Locked.to_string());
    }
    if guard.as_ref().is_none_or(|(_, v)| v.check().is_err())
        || !state.lease.valid(epoch, Instant::now())
    {
        state.lease.invalidate(epoch);
        *guard = None;
        return Err(Error::Locked.to_string());
    }
    let result = f(&mut guard.as_mut().ok_or_else(|| Error::Locked.to_string())?.1);
    if guard.as_ref().is_none_or(|(_, v)| v.check().is_err())
        || !state.lease.valid(epoch, Instant::now())
    {
        state.lease.invalidate(epoch);
        *guard = None;
        return Err(Error::Locked.to_string());
    }
    result.map_err(|e| e.to_string())
}
#[tauri::command]
async fn devices() -> Result<Vec<device::Device>, String> {
    tauri::async_runtime::spawn_blocking(device::devices)
        .await
        .map_err(|_| Error::Storage.to_string())
}
#[tauri::command]
async fn unlock(
    state: State<'_, Session>,
    device_id: String,
    passphrase: String,
    create: bool,
) -> Result<(), String> {
    let secret = Zeroizing::new(passphrase);
    let session = state.inner().clone();
    let epoch = session.lease.begin().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = session
            .vault
            .lock()
            .map_err(|_| Error::Locked.to_string())?;
        if !session.lease.pending(epoch) {
            return Err(Error::Locked.to_string());
        }
        *guard = None;
        let root = device::resolve(&device_id).map_err(|e| e.to_string())?;
        let vault = if create {
            Vault::create(&root, secret.as_bytes())
        } else {
            Vault::open(&root, secret.as_bytes())
        }
        .map_err(|e| e.to_string())?;
        // Device enumeration again before publishing a newly unlocked session.
        if device::resolve(&device_id).map_err(|e| e.to_string())? != root {
            return Err(Error::Locked.to_string());
        }
        vault.check().map_err(|e| e.to_string())?;
        session
            .lease
            .activate(epoch, Instant::now())
            .map_err(|e| e.to_string())?;
        *guard = Some((epoch, vault));
        Ok(())
    })
    .await
    .map_err(|_| Error::Locked.to_string())?
}
#[tauri::command]
fn lock(state: State<'_, Session>) -> Result<(), String> {
    let session = state.inner().clone();
    let revoked = session.lease.begin().map_err(|e| e.to_string())?;
    if let Ok(broker) = session.broker.lock() {
        if let Some(broker) = broker.as_ref() {
            broker.revoke();
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        if let Ok(mut guard) = session.vault.lock() {
            if guard.as_ref().is_some_and(|(epoch, _)| *epoch < revoked) {
                *guard = None;
            }
        }
    });
    Ok(())
}
#[tauri::command]
async fn snapshot(state: State<'_, Session>) -> Result<Snapshot, String> {
    run_command(state.inner().clone(), |v| v.snapshot()).await
}
#[tauri::command]
fn session_alive(state: State<'_, Session>) -> Result<(), String> {
    state
        .lease
        .current(Instant::now())
        .map(|_| ())
        .map_err(|e| e.to_string())
}
#[tauri::command]
async fn save_item(state: State<'_, Session>, item: Item) -> Result<(), String> {
    run_command(state.inner().clone(), move |v| v.save_item(item)).await
}
#[tauri::command]
async fn save_grant(state: State<'_, Session>, grant: Grant) -> Result<(), String> {
    run_command(state.inner().clone(), move |v| v.save_grant(grant)).await
}
#[tauri::command]
async fn revoke_all(state: State<'_, Session>) -> Result<(), String> {
    if let Ok(broker) = state.broker.lock() {
        if let Some(broker) = broker.as_ref() {
            broker.revoke();
        }
    }
    run_command(state.inner().clone(), |v| v.revoke_all()).await
}
#[tauri::command]
fn mcp_config(state: State<'_, Session>, agent: String) -> Result<serde_json::Value, String> {
    let broker = state.broker.lock().map_err(|_| Error::Locked.to_string())?;
    let broker = broker
        .as_ref()
        .ok_or_else(|| "Local agent bridge could not start".to_string())?;
    let credentials = broker.issue(agent).map_err(|e| e.to_string())?;
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../scripts/mission-mcp.mjs")
        .canonicalize()
        .map_err(|_| Error::Storage.to_string())?;
    Ok(
        serde_json::json!({"mcpServers":{"mission":{"command":"node","args":[script.to_string_lossy().trim_start_matches(r"\\?\")],"env":{"MISSION_PORT":credentials["port"].to_string(),"MISSION_TOKEN":credentials["token"]}}}}),
    )
}
#[tauri::command]
async fn stage_import(state: State<'_, Session>, items: Vec<Item>) -> Result<(), String> {
    run_command(state.inner().clone(), move |v| v.stage_import(items)).await
}
#[tauri::command]
async fn save_foundation(state:State<'_,Session>,items:Vec<Item>)->Result<(),String> {
    run_command(state.inner().clone(),move|v|v.save_foundation(items)).await
}
#[tauri::command]
async fn review_proposal(
    state: State<'_, Session>,
    id: uuid::Uuid,
    accept: bool,
) -> Result<(), String> {
    run_command(state.inner().clone(), move |v| {
        v.review_proposal(id, accept)
    })
    .await
}
#[tauri::command]
async fn item_history(state: State<'_, Session>, id: uuid::Uuid) -> Result<Vec<Item>, String> {
    run_command(state.inner().clone(), move |v| v.history(id)).await
}
#[tauri::command]
async fn restore_revision(
    state: State<'_, Session>,
    id: uuid::Uuid,
    version: u32,
    expected_version: u32,
) -> Result<(), String> {
    run_command(state.inner().clone(), move |v| {
        v.restore_revision(id, version, expected_version)
    })
    .await
}
async fn run_command<T: Send + 'static>(
    session: Session,
    f: impl FnOnce(&mut Vault) -> crate::Result<T> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(move || with_vault(&session, f))
        .await
        .map_err(|_| Error::Locked.to_string())?
}
pub fn run() {
    let session = Session::default();
    let bridge_state = session.clone();
    let broker = crate::mcp::Broker::start(
        session.lease.clone(),
        Arc::new(move |epoch, agent, request| {
            with_epoch_vault(&bridge_state, epoch, |vault| {
                Ok(crate::mcp::dispatch(vault, agent, request))
            })
            .unwrap_or_else(|_| {
                crate::mcp::rpc_error(
                    request.get("id").cloned().unwrap_or_default(),
                    -32001,
                    "Vault locked or unavailable",
                )
            })
        }),
    );
    if let Ok(broker) = broker {
        *session.broker.lock().expect("Bridge state") = Some(broker);
    }
    let watcher = session.clone();
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(200));
        if let Ok(mut guard) = watcher.vault.try_lock() {
            if let Some((epoch, vault)) = guard.as_ref() {
                let epoch = *epoch;
                if !watcher.lease.valid(epoch, Instant::now())
                    || vault.check().is_err()
                    || watcher.lease.renew(epoch, Instant::now()).is_err()
                {
                    watcher.lease.invalidate(epoch);
                    *guard = None;
                }
            }
        }
    });
    tauri::Builder::default()
        .manage(session)
        .invoke_handler(tauri::generate_handler![
            devices,
            unlock,
            lock,
            snapshot,
            session_alive,
            save_item,
            save_grant,
            revoke_all,
            mcp_config,
            stage_import,
            save_foundation,
            review_proposal,
            item_history,
            restore_revision
        ])
        .run(tauri::generate_context!())
        .expect("Mission could not start");
}
