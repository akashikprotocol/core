export { createField } from "./field.js";
export { createMemoryAdapter } from "./adapters/memory.js";
export { AkashikError } from "./errors.js";
export type { AkashikErrorCode } from "./errors.js";
export { FIELD_PROTOCOL_LEVELS } from "./conformance.js";
export type { ProtocolLevel } from "./conformance.js";
export { EVENT_FORMAT_VERSION } from "./types.js";
// buildProjection composes with replay() for state-at-a-point (see
// docs/REPLAY.md). It was always intended to be public alongside the
// Projection type it already exported; this closes that gap. NEW in v0.3
// Story 9.
export { buildProjection } from "./projection.js";
export type {
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
} from "./types.js";
