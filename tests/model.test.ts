import { describe, it, expect } from "vitest";
import {
  emptyGrant,
  itemSchema,
  newItem,
  projectItem,
  type Grant,
} from "../src/model";
describe("Memory contract", () => {
  it("accepts a complete note", () =>
    expect(itemSchema.safeParse(newItem("Focus", "Mornings")).success).toBe(
      true,
    ));
  it.each([
    ["confidence", 2],
    ["title", ""],
    ["domain", "unknown"],
    ["version", 0],
    ["type", "shell-command"],
  ])("rejects invalid %s", (key, value) =>
    expect(
      itemSchema.safeParse({ ...newItem("Title", "body"), [key]: value })
        .success,
    ).toBe(false),
  );
  it("requires structured commitment fields", () => {
    const item = newItem("Appointment", "", "health", "commitment");
    expect(itemSchema.safeParse(item).success).toBe(false);
    item.fields = { dueAt: new Date().toISOString(), status: "open" };
    expect(itemSchema.safeParse(item).success).toBe(true);
  });
  it("rejects extra execution-shaped properties", () =>
    expect(
      itemSchema.safeParse({ ...newItem("Title", "body"), command: "execute" })
        .success,
    ).toBe(false));
  it("compares validity instants across timezones", () =>
    expect(
      itemSchema.safeParse({
        ...newItem("Title", "body"),
        validFrom: "2026-01-01T12:00:00+03:00",
        validUntil: "2026-01-01T10:00:00Z",
      }).success,
    ).toBe(true));
});
describe("Permission preview, fail closed", () => {
  const item = newItem("Private work context", "Do not send elsewhere", "work");
  const grant: Grant = {
    ...emptyGrant("Claude Desktop"),
    domains: { work: "read" },
  };
  it("denies by default", () =>
    expect(projectItem(item, emptyGrant("Claude Desktop"))).toBeNull());
  it("permits explicit read", () =>
    expect(projectItem(item, grant)?.id).toBe(item.id));
  it("never serves a full item through summary access", () =>
    expect(
      projectItem(item, { ...grant, domains: { work: "summary" } }),
    ).toBeNull());
  it("denies excluded tags and IDs", () => {
    expect(
      projectItem(
        { ...item, tags: ["therapy"] },
        { ...grant, excludedTags: ["therapy"] },
      ),
    ).toBeNull();
    expect(projectItem(item, { ...grant, excludedIds: [item.id] })).toBeNull();
  });
  it("enforces sensitivity", () =>
    expect(projectItem({ ...item, sensitivity: "private" }, grant)).toBeNull());
  it("denies Sensitive even with a broad grant", () =>
    expect(
      projectItem(
        { ...item, sensitivity: "sensitive" },
        { ...grant, ceiling: "sensitive" },
      ),
    ).toBeNull());
  it("expires at the exact deadline", () =>
    expect(
      projectItem(
        item,
        { ...grant, expiresAt: "2026-01-01T00:00:00Z" },
        Date.parse("2026-01-01T00:00:00Z"),
      ),
    ).toBeNull());
  it("denies malformed expiration", () =>
    expect(projectItem(item, { ...grant, expiresAt: "invalid" })).toBeNull());
  it("does not leak related item identities", () =>
    expect(
      projectItem(
        { ...item, links: [{ id: crypto.randomUUID(), relation: "person" }] },
        grant,
      )?.links,
    ).toEqual([]));
});
