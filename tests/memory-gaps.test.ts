import { describe, expect, it } from "vitest";
import { missingMemoryQuestions } from "../src/memory-gaps";
import { newItem } from "../src/model";

describe("memory suggestions", () => {
  it("asks about areas with no memory and stops asking once covered", () => {
    const before = missingMemoryQuestions([]);
    expect(before[0].domain).toBe("identity");
    const after = missingMemoryQuestions([newItem("About me", "Test", "identity")]);
    expect(after.some((question) => question.domain === "identity")).toBe(false);
    expect(after.some((question) => question.domain === "work")).toBe(true);
    expect(after.map((question) => question.domain)).not.toContain("sensitive");
  });
});
