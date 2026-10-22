import { invoke, isTauri } from "@tauri-apps/api/core";
import type { Device, Grant, MemoryItem, Snapshot } from "./model";
export const native = isTauri();
export async function devices(): Promise<Device[]> {
  return native ? invoke("devices") : [];
}
export async function unlock(
  deviceId: string,
  passphrase: string,
  create: boolean,
): Promise<void> {
  if (!native) throw new Error("Open the desktop app to use a real vault.");
  await invoke("unlock", { deviceId, passphrase, create });
}
export async function snapshot(): Promise<Snapshot> {
  return invoke("snapshot");
}
export async function checkSession(): Promise<void> {
  await invoke("session_alive");
}
export async function saveItem(item: MemoryItem): Promise<void> {
  return invoke("save_item", { item });
}
export async function saveGrant(grant: Grant): Promise<void> {
  return invoke("save_grant", { grant });
}
export async function setAgentConnected(agent: string, connected: boolean): Promise<void> {
  return invoke("set_agent_connected", { agent, connected });
}
export async function revokeAll(): Promise<void> {
  await invoke("revoke_all");
}
export async function mcpConfig(agent: string): Promise<unknown> {
  return invoke("mcp_config", { agent });
}
export async function setRequestyKey(key: string): Promise<void> {
  return invoke("set_requesty_key", { key });
}
export async function requestyStatus(): Promise<boolean> {
  return invoke("requesty_status");
}
export async function requestyModels(): Promise<string[]> {
  return invoke("requesty_models");
}
export async function requestyAsk(
  model: string,
  question: string,
  ids: string[],
): Promise<string> {
  return invoke("requesty_ask", { model, question, ids });
}
export async function lock(): Promise<void> {
  if (native) await invoke("lock");
}
export async function resetVault(deviceId: string, passphrase: string): Promise<void> {
  if (!native) throw new Error("Open the desktop app to reset a real vault.");
  await invoke("reset_vault", { deviceId, passphrase });
}
export async function stageImport(items: MemoryItem[]): Promise<void> {
  await invoke("stage_import", { items });
}
export async function saveFoundation(items: MemoryItem[]): Promise<void> {
  await invoke("save_foundation", { items });
}
export async function reviewProposal(
  id: string,
  accept: boolean,
): Promise<void> {
  await invoke("review_proposal", { id, accept });
}
export async function itemHistory(id: string): Promise<MemoryItem[]> {
  return invoke("item_history", { id });
}
export async function restoreRevision(
  id: string,
  version: number,
  expectedVersion: number,
): Promise<void> {
  await invoke("restore_revision", { id, version, expectedVersion });
}
