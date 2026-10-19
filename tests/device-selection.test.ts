import { describe, expect, it } from "vitest";
import { chooseDevice } from "../src/device-selection";
import type { Device } from "../src/model";

const drive = (id: string, hasVault: boolean): Device => ({
  id, label: id, path: id, hasVault,
});

describe("card selection after disconnect", () => {
  it("drops a removed drive and picks its vault when it returns with a new letter", () => {
    expect(chooseDevice([], "E:\\")).toBe("");
    expect(chooseDevice([drive("F:\\", true)], "E:\\")).toBe("F:\\");
  });

  it("prefers the only existing vault when other USB drives are present", () => {
    expect(chooseDevice([drive("E:\\", false), drive("F:\\", true)], ""))
      .toBe("F:\\");
  });

  it("never guesses between two vaults", () => {
    expect(chooseDevice([drive("E:\\", true), drive("F:\\", true)], ""))
      .toBe("");
  });
});
