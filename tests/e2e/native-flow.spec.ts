import { expect, test } from "@playwright/test";
import { newItem } from "../../src/model";

test("returning vault unlocks after a changed drive letter, then resets into onboarding", async ({ page }) => {
  const existing = newItem("Existing pilot memory", "Synthetic test content", "identity");
  await page.addInitScript((memory) => {
    const mock = window as any;
    mock.isTauri = true;
    mock.__mockDevices = [{ id: "E:\\", label: "Pilot USB", path: "E:\\", hasVault: true }];
    mock.__mockSession = false;
    mock.__mockItems = [memory];
    mock.__mockConnected = [];
    mock.__TAURI_INTERNALS__ = {
      invoke: async (command: string, args: any) => {
        if (command === "devices") return mock.__mockDevices;
        if (command === "unlock") {
          if (!mock.__mockDevices.some((device: any) => device.id === args.deviceId)) throw "Device missing";
          mock.__mockSession = true;
          if (args.create) mock.__mockItems = [];
          return;
        }
        if (command === "snapshot") return { items: mock.__mockItems, grants: [], connectedAgents: mock.__mockConnected, proposals: [], audit: [] };
        if (command === "set_agent_connected") {
          mock.__mockConnected = args.connected ? [args.agent] : [];
          return;
        }
        if (command === "session_alive") {
          if (!mock.__mockSession) throw "Locked";
          return;
        }
        if (command === "reset_vault") {
          if (args.passphrase !== "pilot passphrase") throw "Passphrase not accepted. Nothing was deleted.";
          mock.__mockItems = [];
          mock.__mockDevices = mock.__mockDevices.map((device: any) => ({ ...device, hasVault: false }));
          mock.__mockSession = false;
          return;
        }
        if (command === "lock") { mock.__mockSession = false; return; }
        throw `Unexpected command ${command}`;
      },
    };
  }, existing);

  await page.goto("/");
  await expect(page.getByText("Welcome back. Your memory is on this device.", { exact: false })).toBeVisible();
  await page.getByLabel("Passphrase").fill("pilot passphrase");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Existing pilot memory" })).toBeVisible();
  await page.locator(".memory-row").first().click();
  await expect(page.getByRole("button", { name: "Back to all memory" })).toBeVisible();
  await page.getByRole("button", { name: "Back to all memory" }).click();
  await expect(page.getByText("Choose a memory to read its story")).toBeVisible();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await page.getByRole("checkbox", { name: /Connected/ }).check();
  await expect(page.locator(".agent-row").first().locator(".agent-avatar.connected")).toBeVisible();

  await page.evaluate(() => {
    (window as any).__mockDevices = [];
    (window as any).__mockSession = false;
  });
  await expect(page.getByRole("heading", { name: "Plug in your Mission." })).toBeVisible();
  await page.evaluate(() => {
    (window as any).__mockDevices = [{ id: "F:\\", label: "Pilot USB", path: "F:\\", hasVault: true }];
  });
  await expect(page.getByLabel("Device")).toHaveValue("F:\\");
  await expect(page.getByRole("button", { name: "Unlock vault" })).toBeVisible();
  await page.getByLabel("Passphrase").fill("pilot passphrase");
  await page.getByRole("button", { name: "Unlock vault" }).click();
  await page.getByRole("button", { name: "Security", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Wipe this Mission and start again" })).toBeVisible();
  await page.getByRole("switch").check();
  const wipe = page.getByRole("button", { name: "Wipe Mission vault" });
  await expect(wipe).toBeDisabled();
  await page.getByLabel("Current vault passphrase").fill("wrong passphrase");
  await page.getByLabel("Type RESET to confirm").fill("RESET");
  await wipe.click();
  await expect(page.getByRole("alert")).toContainText("Nothing was deleted");
  await expect(page.getByRole("heading", { name: "Wipe this Mission and start again" })).toBeVisible();
  await page.getByLabel("Current vault passphrase").fill("pilot passphrase");
  await wipe.click();
  await expect(page.getByRole("button", { name: "Create vault" })).toBeVisible();
  await page.getByLabel("Passphrase").fill("a new long passphrase");
  await page.getByRole("button", { name: "Create vault" }).click();
  await expect(page.getByRole("heading", { name: "Let’s start with you." })).toBeVisible();
});
