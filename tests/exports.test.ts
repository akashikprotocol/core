import { describe, expect, it } from "vitest";
import * as akashik from "../src/index.js";

describe("public exports", () => {
  it("exports exactly the documented surface — no more, no less", () => {
    const exportedKeys = Object.keys(akashik).sort();
    expect(exportedKeys).toEqual(["AkashikError", "createField"]);
  });

  it("createField is a function", () => {
    expect(typeof akashik.createField).toBe("function");
  });

  it("AkashikError is a class extending Error", () => {
    expect(akashik.AkashikError.prototype).toBeInstanceOf(Error);
  });

  it("AkashikError instances have a code property", () => {
    const err = new akashik.AkashikError("INTENT_REQUIRED", "test");
    expect(err.code).toBe("INTENT_REQUIRED");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(akashik.AkashikError);
  });
});
