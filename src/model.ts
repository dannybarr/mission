import { z } from "zod";

export const domains = [
  ["identity", "Identity & values", "The things that make you, you."],
  ["work", "Work & career", "How you work and what comes next."],
  ["projects", "Projects", "What you are making happen."],
  ["health", "Health & body", "Your observations and care."],
  ["fitness", "Fitness & habits", "The practices you return to."],
  ["routines", "Routines & schedule", "The rhythm of your days."],
  ["people", "Relationships & people", "The people in your life."],
  ["home", "Home & places", "Where life happens."],
  ["finance", "Finance", "Context and goals, never credentials."],
  ["learning", "Learning & interests", "What keeps you curious."],
  ["preferences", "Preferences", "The details that make things fit."],
  ["goals", "Goals & commitments", "What matters next."],
  ["sensitive", "Sensitive", "Reserved for a separate unlock."],
] as const;
export const itemTypes = [
  "fact",
  "preference",
  "goal",
  "commitment",
  "routine",
  "event",
  "person",
  "place",
  "note",
  "document-ref",
  "health-observation",
  "metric",
] as const;
export const sensitivities = [
  "public",
  "personal",
  "private",
  "sensitive",
] as const;
export const levels = ["none", "summary", "read", "suggest", "write"] as const;
export type Level = (typeof levels)[number];
const iso = z.string().datetime({ offset: true });
export const itemSchema = z
  .object({
    id: z.string().uuid(),
    domain: z.enum(domains.map((d) => d[0]) as [string, ...string[]]),
    type: z.enum(itemTypes),
    title: z.string().trim().min(1).max(160),
    body: z.string().max(32000),
    fields: z.record(z.string(), z.unknown()),
    tags: z.array(z.string().min(1).max(64)).max(30),
    links: z
      .array(
        z.object({
          id: z.string().uuid(),
          relation: z.string().min(1).max(64),
        }),
      )
      .max(100),
    sensitivity: z.enum(sensitivities),
    confidence: z.number().min(0).max(1),
    source: z.object({
      kind: z.string().min(1).max(64),
      reference: z.string().max(512).optional(),
    }),
    createdAt: iso,
    updatedAt: iso,
    validFrom: iso.nullable(),
    validUntil: iso.nullable(),
    version: z.number().int().positive(),
    provenance: z.object({ actor: z.string(), at: iso }),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (
      item.validFrom &&
      item.validUntil &&
      Date.parse(item.validFrom) > Date.parse(item.validUntil)
    )
      ctx.addIssue({
        code: "custom",
        message: "End must follow start",
        path: ["validUntil"],
      });
    if (
      item.type === "commitment" &&
      !z
        .object({ dueAt: iso, status: z.enum(["open", "done", "cancelled"]) })
        .safeParse(item.fields).success
    )
      ctx.addIssue({
        code: "custom",
        message: "Commitments need dueAt and status",
        path: ["fields"],
      });
    if (
      item.type === "routine" &&
      !z
        .object({
          cadenceDays: z.number().int().min(1).max(365),
          lastCompletedAt: iso.nullable(),
        })
        .safeParse(item.fields).success
    )
      ctx.addIssue({
        code: "custom",
        message: "Routines need cadenceDays and lastCompletedAt",
        path: ["fields"],
      });
    if (
      item.type === "metric" &&
      !z
        .object({ value: z.number(), unit: z.string().min(1), observedAt: iso })
        .safeParse(item.fields).success
    )
      ctx.addIssue({
        code: "custom",
        message: "Metrics need value, unit and observedAt",
        path: ["fields"],
      });
  });
export type MemoryItem = z.infer<typeof itemSchema>;
export type Grant = {
  agent: string;
  domains: Record<string, Level>;
  ceiling: (typeof sensitivities)[number];
  excludedIds: string[];
  excludedTags: string[];
  expiresAt: string | null;
};
export type Proposal = {
  id: string;
  agent: string;
  item: MemoryItem;
  reason: string;
};
export type Audit = {
  at: string;
  actor: string;
  action: string;
  itemId: string | null;
};
export type Snapshot = {
  items: MemoryItem[];
  grants: Grant[];
  proposals: Proposal[];
  audit: Audit[];
};
export type Device = {
  id: string;
  label: string;
  path: string;
  hasVault: boolean;
};
export const agents = [
  "Claude Desktop",
  "Codex",
  "Cursor",
  "Gemini CLI",
  "GitHub Copilot (VS Code)",
  "Instinct",
  "Grok Bot",
  "ChatGPT",
  "Manus",
  "Muse",
  "Gemini",
  "Perplexity",
  "Microsoft Copilot",
  "DeepSeek",
  "Ollama",
  "Custom agent",
];
export function emptyGrant(agent: string): Grant {
  return {
    agent,
    domains: {},
    ceiling: "personal",
    excludedIds: [],
    excludedTags: [],
    expiresAt: null,
  };
}
// UI preview only. Rust is the authority for real access decisions.
export function projectItem(
  item: MemoryItem,
  grant: Grant,
  now = Date.now(),
): MemoryItem | null {
  if (
    item.domain === "sensitive" ||
    item.sensitivity === "sensitive" ||
    (grant.expiresAt !== null &&
      (!Number.isFinite(Date.parse(grant.expiresAt)) ||
        Date.parse(grant.expiresAt) <= now))
  )
    return null;
  if (
    grant.excludedIds.includes(item.id) ||
    item.tags.some((t) => grant.excludedTags.includes(t))
  )
    return null;
  if (
    sensitivities.indexOf(item.sensitivity) >
    sensitivities.indexOf(grant.ceiling)
  )
    return null;
  const level = grant.domains[item.domain] ?? "none";
  // Summary is not a truncated full item: until independently scoped summaries exist, deny.
  if (level === "none" || level === "summary") return null;
  return { ...item, links: [] };
}
export function newItem(
  title: string,
  body: string,
  domain = "identity",
  type: MemoryItem["type"] = "note",
): MemoryItem {
  const at = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    domain,
    type,
    title,
    body,
    fields: {},
    tags: [],
    links: [],
    sensitivity: "personal",
    confidence: 1,
    source: { kind: "manual" },
    createdAt: at,
    updatedAt: at,
    validFrom: null,
    validUntil: null,
    version: 1,
    provenance: { actor: "owner", at },
  };
}
