// This file exercises every exported type. If any type is dropped from
// the public surface, this file fails to compile and `npm run typecheck` errors.

import type {
  AkashikErrorCode,
  AttuneContext,
  CommitInput,
  CommitResult,
  Conflict,
  DiscardInput,
  DraftInput,
  Field,
  FieldEntry,
  FieldEntryStatus,
  FieldEntryWithRelevance,
  FieldOptions,
  ReadOptions,
  ReadQuery,
  ReckonResult,
  RegisterInput,
  RegisterResult,
  RelevanceReason,
  RetractInput,
  SupersedeInput,
  SupersedeResult,
  WriteInput,
  WriteResult,
} from "../src/index.js";

import { describe, expect, it } from "vitest";
import { createField } from "../src/index.js";

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
});
