// This file exercises every exported type. If any type is dropped from
// the public surface, this file fails to compile and `npm run typecheck` errors.

import type {
  AkashikErrorCode,
  AttuneContext,
  Field,
  FieldEntry,
  FieldOptions,
  ReadQuery,
  WriteInput,
  WriteResult,
} from "../src/index.js";

import { describe, expect, it } from "vitest";
import { createField } from "../src/index.js";

describe("type exports", () => {
  it("every public type is reachable and well-formed", () => {
    // Variables typed against each public type.
    // If a type is dropped, this file won't compile.
    const _options: FieldOptions = { minIntentLength: 10 };
    const _writeInput: WriteInput = { entry: {}, intent: "0123456789" };
    const _writeResult: WriteResult = { id: "x", timestamp: 0 };
    const _readQuery: ReadQuery = { topic: "x" };
    const _attuneContext: AttuneContext = { agent: "a", topic: "x" };
    const _fieldEntry: FieldEntry = {
      id: "x",
      timestamp: 0,
      entry: {},
      intent: "0123456789",
    };
    const _errorCode: AkashikErrorCode = "INTENT_REQUIRED";
    const _field: Field = createField();

    // Touch each variable so the linter doesn't strip them.
    expect(_options).toBeDefined();
    expect(_writeInput).toBeDefined();
    expect(_writeResult).toBeDefined();
    expect(_readQuery).toBeDefined();
    expect(_attuneContext).toBeDefined();
    expect(_fieldEntry).toBeDefined();
    expect(_errorCode).toBeDefined();
    expect(_field).toBeDefined();
  });
});
