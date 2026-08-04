import { describe, expect, it } from "vitest";
import * as akashik from "../src/index.js";

describe("public exports — runtime", () => {
  it("exports exactly the documented surface — no more, no less", () => {
    const exportedKeys = Object.keys(akashik).sort();
    expect(exportedKeys).toEqual(["AkashikError", "EVENT_FORMAT_VERSION", "createField"]);
  });

  it("createField is a function", () => {
    expect(typeof akashik.createField).toBe("function");
  });

  it("EVENT_FORMAT_VERSION is 1", () => {
    expect(akashik.EVENT_FORMAT_VERSION).toBe(1);
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

  it("createField() returns a Field with all v0.2 methods", () => {
    const field = akashik.createField();
    const expectedMethods = [
      "write",
      "read",
      "attune",
      "register",
      "deregister",
      "draft",
      "commit",
      "discard",
      "retract",
      "supersede",
      "reckon",
    ];
    for (const method of expectedMethods) {
      expect(
        typeof (field as Record<string, unknown>)[method],
        `Field.${method} should be a function`,
      ).toBe("function");
    }
  });

  it("AkashikError accepts all 9 v0.2 error codes", () => {
    const codes = [
      "INTENT_REQUIRED",
      "INTENT_TOO_SHORT",
      "INVALID_ENTRY",
      "INVALID_QUERY",
      "AGENT_REQUIRED",
      "INVALID_ENVELOPE",
      "DRAFT_NOT_FOUND",
      "RETRACT_NOT_AUTHORIZED",
      "ENTRY_NOT_FOUND",
    ] as const;
    for (const code of codes) {
      const err = new akashik.AkashikError(code, "test");
      expect(err.code).toBe(code);
    }
  });
});

describe("public exports — type surface (compile-time check)", () => {
  it("imports every public type without error", () => {
    type SurfaceCheck = {
      akashikErrorCode: import("../src/index.js").AkashikErrorCode;
      attuneContext: import("../src/index.js").AttuneContext;
      commitInput: import("../src/index.js").CommitInput;
      commitResult: import("../src/index.js").CommitResult;
      conflict: import("../src/index.js").Conflict;
      deregisterEvent: import("../src/index.js").DeregisterEvent;
      discardInput: import("../src/index.js").DiscardInput;
      draftInput: import("../src/index.js").DraftInput;
      eventScope: import("../src/index.js").EventScope;
      field: import("../src/index.js").Field;
      fieldEntry: import("../src/index.js").FieldEntry;
      fieldEntryStatus: import("../src/index.js").FieldEntryStatus;
      fieldEntryWithRelevance: import("../src/index.js").FieldEntryWithRelevance;
      fieldEvent: import("../src/index.js").FieldEvent;
      fieldOptions: import("../src/index.js").FieldOptions;
      projection: import("../src/index.js").Projection;
      readOptions: import("../src/index.js").ReadOptions;
      readQuery: import("../src/index.js").ReadQuery;
      reckonResult: import("../src/index.js").ReckonResult;
      recordEvent: import("../src/index.js").RecordEvent;
      registerEvent: import("../src/index.js").RegisterEvent;
      registerInput: import("../src/index.js").RegisterInput;
      registerResult: import("../src/index.js").RegisterResult;
      relevanceReason: import("../src/index.js").RelevanceReason;
      retractInput: import("../src/index.js").RetractInput;
      statusChangeEvent: import("../src/index.js").StatusChangeEvent;
      storageAdapter: import("../src/index.js").StorageAdapter;
      supersedeInput: import("../src/index.js").SupersedeInput;
      supersedeResult: import("../src/index.js").SupersedeResult;
      writeInput: import("../src/index.js").WriteInput;
      writeResult: import("../src/index.js").WriteResult;
    };
    // If TypeScript resolves all these, the test passes by compilation.
    const _check: SurfaceCheck | undefined = undefined;
    expect(_check).toBeUndefined();
  });

  it("Field type has all 11 v0.2 methods declared", () => {
    type FieldMethods = keyof import("../src/index.js").Field;
    const expectedMethods: FieldMethods[] = [
      "write",
      "read",
      "attune",
      "register",
      "deregister",
      "draft",
      "commit",
      "discard",
      "retract",
      "supersede",
      "reckon",
    ];
    expect(expectedMethods).toHaveLength(11);
  });
});
