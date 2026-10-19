import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  await page.goto("http://127.0.0.1:1420");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "artifacts/locked.png", fullPage: true });
  await page.getByRole("button", { name: "Explore Mission" }).click();
  await page.screenshot({ path: "artifacts/overview.png", fullPage: true });
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page.screenshot({ path: "artifacts/memory.png", fullPage: true });
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await page.screenshot({ path: "artifacts/agents.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Main menu", exact: true }).click();
  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await page.screenshot({ path: "artifacts/mobile.png", fullPage: true });
  await page.setViewportSize({width:1440,height:1050});
  await page.reload();
  await page.getByRole("button", { name: "Preview onboarding", exact: true }).click();
  await page.screenshot({ path: "artifacts/onboarding.png", fullPage: true });
} finally {
  await browser.close();
}
