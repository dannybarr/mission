import { describe, expect, it } from "vitest";
import { unlockError } from "../src/unlock-error";

describe("unlockError", () => {
  it("distinguishes an incorrect passphrase from a storage failure", () => {
    expect(unlockError("Passphrase did not unlock this Mission card")).toContain("passphrase");
    expect(unlockError("Storage operation failed")).toContain("read the USB");
  });

  it("does not echo arbitrary native error contents", () => {
    expect(unlockError("secret diagnostic details")).not.toContain("secret");
  });
});
