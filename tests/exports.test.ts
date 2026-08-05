import { describe, expect, it } from "vitest";
import * as akashik from "../src/index.js";

describe("public exports — runtime", () => {
  it("exports exactly the documented surface — no more, no less", () => {
    const exportedKeys = Object.keys(akashik).sort();
    expect(exportedKeys).toEqual([
      "AkashikError",
      "EVENT_FORMAT_VERSION",
      "FIELD_PROTOCOL_LEVELS",
      "buildProjection",
      "createField",
      "createMemoryAdapter",
    ]);
  });

  it("createField is a function", () => {
    expect(typeof akashik.createField).toBe("function");
  });

  it("createMemoryAdapter is a function", () => {
    expect(typeof akashik.createMemoryAdapter).toBe("function");
  });

  it("buildProjection is a function", () => {
    expect(typeof akashik.buildProjection).toBe("function");
  });

  it("EVENT_FORMAT_VERSION is 1", () => {
    expect(akashik.EVENT_FORMAT_VERSION).toBe(1);
  });

  it("FIELD_PROTOCOL_LEVELS is ['L0', 'L1']", () => {
    expect(akashik.FIELD_PROTOCOL_LEVELS).toEqual(["L0", "L1"]);
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

  it("createField() returns a Field with all v0.3 methods", () => {
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
      "replay",
    ];
    for (const method of expectedMethods) {
      expect(
        typeof (field as Record<string, unknown>)[method],
        `Field.${method} should be a function`,
      ).toBe("function");
    }
  });

  it("AkashikError accepts all 11 v0.3 error codes", () => {
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
      "INVALID_CONFIDENCE",
      "STORAGE_ERROR",
    ] as const;
    for (const code of codes) {
      const err = new akashik.AkashikError(code, "test");
      expect(err.code).toBe(code);
    }
  });

  it("buildProjection composes with replay() for state at a point", async () => {
    const field = akashik.createField();
    await field.write({ entry: { topic: "x" }, intent: "checking buildProjection composes" });
    const events = await field.replay();
    const projection = akashik.buildProjection(events);
    expect(projection.entries.size).toBe(1);
  });
});

describe("public exports — subpaths", () => {
  it("@akashikprotocol/core/postgres exposes createPostgresAdapter", async () => {
    const postgresModule = await import("../src/postgres.js");
    expect(typeof postgresModule.createPostgresAdapter).toBe("function");
  });

  it("@akashikprotocol/core/file exposes createFileAdapter", async () => {
    const fileModule = await import("../src/file.js");
    expect(typeof fileModule.createFileAdapter).toBe("function");
  });

  it("createPostgresAdapter is not reachable from the root entry point", () => {
    expect("createPostgresAdapter" in akashik).toBe(false);
  });

  it("createFileAdapter is not reachable from the root entry point", () => {
    expect("createFileAdapter" in akashik).toBe(false);
  });
});

describe("public exports — type surface (compile-time check)", () => {
  it("imports every public type without error", () => {
    type SurfaceCheck = {
      akashikErrorCode: import("../src/index.js").AkashikErrorCode;
      attuneContext: import("../src/index.js").AttuneContext;
      commitInput: import("../src/index.js").CommitInput;
      commitResult: import("../src/index.js").CommitResult;
      confidence: import("../src/index.js").Confidence;
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
      protocolLevel: import("../src/index.js").ProtocolLevel;
      readOptions: import("../src/index.js").ReadOptions;
      readQuery: import("../src/index.js").ReadQuery;
      reckonResult: import("../src/index.js").ReckonResult;
      recordEvent: import("../src/index.js").RecordEvent;
      registerEvent: import("../src/index.js").RegisterEvent;
      registerInput: import("../src/index.js").RegisterInput;
      registerResult: import("../src/index.js").RegisterResult;
      relevanceReason: import("../src/index.js").RelevanceReason;
      replayQuery: import("../src/index.js").ReplayQuery;
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

  it("Field type has all 12 v0.3 methods declared", () => {
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
      "replay",
    ];
    expect(expectedMethods).toHaveLength(12);
  });

  it("PostgresAdapterOptions is reachable from the postgres subpath", () => {
    type Check = import("../src/postgres.js").PostgresAdapterOptions;
    const _check: Check | undefined = undefined;
    expect(_check).toBeUndefined();
  });

  it("FileAdapterOptions is reachable from the file subpath", () => {
    type Check = import("../src/file.js").FileAdapterOptions;
    const _check: Check | undefined = undefined;
    expect(_check).toBeUndefined();
  });
});
