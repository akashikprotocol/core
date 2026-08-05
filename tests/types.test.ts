// This file exercises every exported type. If any type is dropped from
// the public surface, this file fails to compile and `npm run typecheck` errors.

import type {
  AkashikErrorCode,
  AttuneContext,
  CommitInput,
  CommitResult,
  Confidence,
  Conflict,
  DeregisterEvent,
  DiscardInput,
  DraftInput,
  EventScope,
  Field,
  FieldEntry,
  FieldEntryStatus,
  FieldEntryWithRelevance,
  FieldEvent,
  FieldOptions,
  Projection,
  ProtocolLevel,
  ReadOptions,
  ReadQuery,
  ReckonResult,
  RecordEvent,
  RegisterEvent,
  RegisterInput,
  RegisterResult,
  RelevanceReason,
  ReplayQuery,
  RetractInput,
  StatusChangeEvent,
  StorageAdapter,
  SupersedeInput,
  SupersedeResult,
  WriteInput,
  WriteResult,
} from "../src/index.js";

import { describe, expect, it } from "vitest";
import {
  EVENT_FORMAT_VERSION,
  FIELD_PROTOCOL_LEVELS,
  buildProjection,
  createField,
} from "../src/index.js";

describe("type exports", () => {
  it("every public type is reachable and well-formed", () => {
    const _options: FieldOptions = { minIntentLength: 10 };
    const _writeInput: WriteInput = { entry: {}, intent: "0123456789" };
    const _writeResult: WriteResult = { id: "x", timestamp: 0 };
    const _readQuery: ReadQuery = { topic: "x" };
    const _readOptions: ReadOptions = { caller: "agent-1" };
    const _attuneContext: AttuneContext = { agent: "a", topic: "x" };
    const _fieldEntryStatus: FieldEntryStatus = "committed";
    const _fieldEntry: FieldEntry = {
      id: "x",
      timestamp: 0,
      epoch: 0,
      status: "committed",
      entry: {},
      intent: "0123456789",
    };
    const _errorCode: AkashikErrorCode = "INTENT_REQUIRED";
    const _field: Field = createField();

    expect(_options).toBeDefined();
    expect(_writeInput).toBeDefined();
    expect(_writeResult).toBeDefined();
    expect(_readQuery).toBeDefined();
    expect(_readOptions).toBeDefined();
    expect(_attuneContext).toBeDefined();
    expect(_fieldEntryStatus).toBeDefined();
    expect(_fieldEntry).toBeDefined();
    expect(_errorCode).toBeDefined();
    expect(_field).toBeDefined();
  });

  it("v0.2 story types are reachable and well-formed", () => {
    const _draftInput: DraftInput = { entry: {}, intent: "0123456789", agent: "a" };
    const _commitInput: CommitInput = { draft_id: "x" };
    const _commitResult: CommitResult = { id: "x", epoch: 0, timestamp: 0 };
    const _discardInput: DiscardInput = { draft_id: "x", intent: "0123456789" };
    const _retractInput: RetractInput = { id: "x", intent: "0123456789", agent: "a" };
    const _supersedeInput: SupersedeInput = {
      superseding_id: "x",
      entry: {},
      intent: "0123456789",
      agent: "a",
    };
    const _supersedeResult: SupersedeResult = { id: "x", epoch: 0, timestamp: 0 };
    const _registerInput: RegisterInput = { id: "a", role: "researcher" };
    const _registerResult: RegisterResult = {
      field_capabilities: [],
      field_protocol_version: "0.2",
    };
    const _relevanceReason: RelevanceReason = {
      components: { topic: 0.6, role: 0, recency: 0.15, intent: 0.05 },
      summary: "test",
    };
    const _fieldEntryWithRelevance: FieldEntryWithRelevance = {
      id: "x",
      timestamp: 0,
      epoch: 0,
      status: "committed",
      entry: {},
      intent: "0123456789",
      relevance_score: 0.8,
      relevance_reason: _relevanceReason,
    };
    const _conflict: Conflict = {
      a: _fieldEntryWithRelevance,
      b: _fieldEntryWithRelevance,
      keys: ["price"],
    };
    const _reckonResult: ReckonResult = {
      entries: [_fieldEntryWithRelevance],
      conflicts: [_conflict],
    };

    expect(_draftInput).toBeDefined();
    expect(_commitInput).toBeDefined();
    expect(_commitResult).toBeDefined();
    expect(_discardInput).toBeDefined();
    expect(_retractInput).toBeDefined();
    expect(_supersedeInput).toBeDefined();
    expect(_supersedeResult).toBeDefined();
    expect(_registerInput).toBeDefined();
    expect(_registerResult).toBeDefined();
    expect(_relevanceReason).toBeDefined();
    expect(_fieldEntryWithRelevance).toBeDefined();
    expect(_conflict).toBeDefined();
    expect(_reckonResult).toBeDefined();
  });

  it("FieldEntryStatus union covers all four states", () => {
    const statuses: FieldEntryStatus[] = ["committed", "draft", "retracted", "superseded"];
    expect(statuses).toHaveLength(4);
  });

  it("AttuneContext accepts optional v0.2 fields", () => {
    const full: AttuneContext = { agent: "a", role: "researcher", topic: "x", max_units: 10 };
    const minimal: AttuneContext = { agent: "a" };
    expect(full).toBeDefined();
    expect(minimal).toBeDefined();
  });

  it("AttuneContext accepts since_epoch", () => {
    const polling: AttuneContext = { agent: "a", topic: "x", since_epoch: 3 };
    expect(polling).toBeDefined();
  });
});

describe("v0.3 story types are reachable and well-formed", () => {
  it("Confidence is reachable and optional on write-shaped inputs", () => {
    const _scoreOnly: Confidence = { score: 0.5 };
    const _withReason: Confidence = { score: 0.9, reason: "cross-checked" };
    expect(_scoreOnly).toBeDefined();
    expect(_withReason).toBeDefined();
  });

  it("FieldEntry accepts optional confidence", () => {
    const _entry: FieldEntry = {
      id: "x",
      timestamp: 0,
      epoch: 0,
      status: "committed",
      entry: {},
      intent: "0123456789",
      confidence: { score: 0.7 },
    };
    expect(_entry).toBeDefined();
  });

  it("every FieldEvent member type is reachable and well-formed", () => {
    const _recordEvent: RecordEvent = {
      type: "RECORD",
      v: EVENT_FORMAT_VERSION,
      event_id: "e1",
      lamport: 0,
      agent: null,
      wall_time: 0,
      seq: 0,
      entry_id: "entry-1",
      entry: { topic: "x" },
      intent: "0123456789",
    };
    const _statusChangeEvent: StatusChangeEvent = {
      type: "STATUS_CHANGE",
      v: EVENT_FORMAT_VERSION,
      event_id: "e2",
      lamport: 1,
      agent: "a",
      wall_time: 0,
      seq: 1,
      entry_id: "entry-1",
      new_status: "retracted",
      intent: "0123456789",
    };
    const _registerEvent: RegisterEvent = {
      type: "REGISTER",
      v: EVENT_FORMAT_VERSION,
      event_id: "e3",
      lamport: 2,
      agent: "a",
      wall_time: 0,
      seq: 2,
      entry_id: "a",
      role: "researcher",
      capabilities: [],
    };
    const _deregisterEvent: DeregisterEvent = {
      type: "DEREGISTER",
      v: EVENT_FORMAT_VERSION,
      event_id: "e4",
      lamport: 3,
      agent: "a",
      wall_time: 0,
      seq: 3,
      entry_id: "a",
    };
    const _fieldEvent: FieldEvent = _recordEvent;

    expect(_recordEvent).toBeDefined();
    expect(_statusChangeEvent).toBeDefined();
    expect(_registerEvent).toBeDefined();
    expect(_deregisterEvent).toBeDefined();
    expect(_fieldEvent).toBeDefined();
  });

  it("Projection, EventScope, and StorageAdapter are reachable", () => {
    const _projection: Projection = {
      entries: new Map(),
      sessions: new Map(),
      upToSeq: -1,
      maxLamport: 0,
    };
    const _scope: EventScope = { topic: "x" };
    const _hasAdapterShape = (adapter: StorageAdapter) => typeof adapter.append === "function";

    expect(_projection).toBeDefined();
    expect(_scope).toBeDefined();
    expect(typeof _hasAdapterShape).toBe("function");
  });

  it("ReplayQuery accepts every filter combination", () => {
    const _full: ReplayQuery = {
      entry_id: "x",
      topic: "y",
      agent: "a",
      sinceSeq: 0,
      untilSeq: 10,
      followChain: false,
    };
    const _minimal: ReplayQuery = {};
    expect(_full).toBeDefined();
    expect(_minimal).toBeDefined();
  });

  it("FIELD_PROTOCOL_LEVELS and ProtocolLevel agree", () => {
    const levels: readonly ProtocolLevel[] = FIELD_PROTOCOL_LEVELS;
    expect(levels).toEqual(["L0", "L1"]);
  });

  it("buildProjection is reachable from the public entry point", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: "checking buildProjection reachability" });
    const events = await field.replay();
    const projection: Projection = buildProjection(events);
    expect(projection.entries.size).toBe(1);
  });

  it("Field.replay is declared", async () => {
    const field: Field = createField();
    expect(typeof field.replay).toBe("function");
  });
});
