import type { Device } from "./model";

// A card identifies itself by the vault on it. Drive letters are only current paths.
export function chooseDevice(available: Device[], current: string): string {
  if (available.some((device) => device.id === current)) return current;
  const vaults = available.filter((device) => device.hasVault);
  if (vaults.length === 1) return vaults[0].id;
  return available.length === 1 ? available[0].id : "";
}
