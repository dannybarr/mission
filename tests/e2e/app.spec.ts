import { test, expect } from "@playwright/test";
test("file import waits for review and can be kept or dismissed", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Mission" }).click();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await page.getByLabel("Import memory file").setInputFiles({
    name: "A personal note.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Fictional imported context for the review test."),
  });
  await expect(
    page.getByRole("heading", { name: "A second look, before it stays." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Keep this memory" }).click();
  await expect(page.getByText("Nothing waiting for your say.")).toBeVisible();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A personal note", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await page.getByLabel("Import memory file").setInputFiles({
    name: "Discard this.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("Do not keep this fictional note."),
  });
  await page.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await expect(page.getByText("Discard this")).toHaveCount(0);
});
test("locked screen contains no personal sample data and preview is explicit", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Plug in your Mission." }),
  ).toBeVisible();
  await expect(page.getByText("Make room for focused work")).toHaveCount(0);
  await expect(
    page.getByText("This browser cannot open a USB vault."),
  ).toBeVisible();
});
test("capture, inspect provenance, lock, and return without retaining changes", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Mission" }).click();
  await page.getByRole("button", { name: "Quick capture" }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Only in this sample session");
  await page.getByLabel("In your words").fill("A fictional detail for testing");
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Only in this sample session" }),
    })
    .click();
  await expect(
    page.getByText("A fictional detail for testing", { exact: true }).last(),
  ).toBeVisible();
  await page.getByRole("button", { name: "View as agent" }).click();
  await expect(
    page.getByText("No access to this item", { exact: false }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Close preview", exact: true })
    .click();
  await expect(page.getByText("Only in this sample session")).toHaveCount(0);
  await page.getByRole("button", { name: "Explore Mission" }).click();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await expect(page.getByText("Only in this sample session")).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie,
    })),
  ).toEqual({ local: 0, session: 0, cookies: "" });
});
test("summary grant withholds full content and revocation resets access", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Mission" }).click();
  await page.getByRole("button", { name: "Quick capture" }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Make room for focused work");
  await page.getByLabel("In your words").fill("Synthetic test context");
  await page.getByRole("button", { name: "Save memory" }).click();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await page.getByLabel("Work & career access").selectOption("summary");
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await page
    .getByRole("button")
    .filter({
      has: page.getByRole("heading", { name: "Make room for focused work" }),
    })
    .click();
  await page.getByRole("button", { name: "View as agent" }).click();
  await expect(page.locator("pre")).toContainText("No access");
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await page.getByRole("button", { name: "Revoke all access" }).click();
  await expect(page.getByLabel("Work & career access")).toHaveValue("none");
  await expect(page.getByLabel("Sensitive access")).toBeDisabled();
});
test("empty onboarding reviews answers before saving and agents stay denied", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Preview onboarding", exact: true })
    .click();
  await page
    .getByLabel("How should an assistant understand you?", { exact: false })
    .fill("Call me Pilot. This is synthetic test content.");
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your memory. Your final say." }),
  ).toBeVisible();
  await expect(
    page.getByText("Call me Pilot. This is synthetic test content.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview 1 memories" }).click();
  await expect(
    page.getByRole("heading", { name: "Think with your memory" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await expect(page.getByLabel("Identity & values access")).toHaveValue("none");
  await expect(
    page.getByRole("button", { name: "Generate MCP configuration" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Memory", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "How should an assistant understand you?",
    }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Explore Mission", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Build your first memories" }),
  ).toBeVisible();
  await expect(
    page.getByText("Call me Pilot. This is synthetic test content.", {
      exact: true,
    }),
  ).toHaveCount(0);
});
test("hosted AI is explicit and unavailable in browser preview", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore Mission", exact: true })
    .click();
  await page.getByRole("button", { name: "AI", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Think with your memory" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Open the desktop app and unlock a USB vault to connect your key.",
    ),
  ).toBeVisible();
  await expect(page.getByLabel("Requesty API key")).toHaveCount(0);
});
test("reload returns to locked and no network calls leave localhost", async ({
  page,
}) => {
  const remote: string[] = [];
  page.on("request", (r) => {
    if (!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      remote.push(r.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Mission" }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Plug in your Mission." }),
  ).toBeVisible();
  expect(remote).toEqual([]);
});
test("mobile layout stays within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore Mission" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Main menu", exact: true }).click();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
