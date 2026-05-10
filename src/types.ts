/** Options passed to createField(). */
export type FieldOptions = {
  /** Minimum length for the intent string, after trimming. Default: 10. */
  minIntentLength?: number;
};

/** Input shape for field.write(). */
export type WriteInput = {
  entry: Record<string, unknown>;
  intent: string;
  agent?: string;
};

/** Return shape from field.write(). */
export type WriteResult = {
  id: string;
  timestamp: number;
};

/** Status of a FieldEntry — v0.2. */
export type FieldEntryStatus = "committed" | "draft" | "retracted" | "superseded";

/** The canonical entry shape returned by field.read() and field.attune().
 *  Returned types are forward-declared here even though read/attune
 *  arrive in Stories 2/3 — keeps types stable for consumers. */
export type FieldEntry = {
  id: string;
  timestamp: number;
  epoch: number; // v0.2 — field-wide monotonic counter
  agent?: string;
  status: FieldEntryStatus; // v0.2 — defaults to "committed" for write()
  entry: Record<string, unknown>;
  intent: string;
};

/** Query shape for field.read() — implemented in Story 2. */
export type ReadQuery = Record<string, unknown>;

/** Options for field.read() — Story 5: caller for draft-visibility filtering. */
export type ReadOptions = {
  caller?: string;
};

/** Input to field.draft(). */
export type DraftInput = {
  entry: Record<string, unknown>;
  intent: string;
  agent?: string;
};

/** Input to field.commit(). */
export type CommitInput = {
  draft_id: string;
};

/** Input to field.discard(). */
export type DiscardInput = {
  draft_id: string;
  intent: string;
  agent?: string;
};

/** Result of field.commit(): identity preserved, status/epoch/timestamp updated. */
export type CommitResult = {
  id: string;
  epoch: number;
  timestamp: number;
};

/** Context shape for field.attune() — v0.2 Story 4 complete. */
export type AttuneContext = {
  agent: string;
  role?: string; // NEW in Story 4: optional explicit role for scoring
  topic?: string;
  max_units?: number; // NEW in Story 4: cap on returned entries; default 100
};

/** Input shape for field.register(). */
export type RegisterInput = {
  id: string;
  role: string;
  capabilities?: string[];
};

/** Return shape from field.register(). */
export type RegisterResult = {
  field_capabilities: string[];
  field_protocol_version: string;
  session_id?: string;
};

/** Internal session record. NOT exported from the package. */
export type Session = {
  id: string;
  role: string;
  capabilities: string[];
  registered_at: number; // Unix ms timestamp
};

/** Per-component breakdown of a relevance score. */
export type RelevanceReason = {
  components: {
    topic: number; // contribution from topic match (0 to 0.6)
    role: number; // contribution from role match (0 to 0.2)
    recency: number; // contribution from recency (0 to 0.15)
    intent: number; // contribution from intent quality (0 to 0.05)
  };
  summary: string; // human-readable summary of why this score
};

/** A FieldEntry returned by attune(), with relevance metadata. */
export type FieldEntryWithRelevance = FieldEntry & {
  relevance_score: number; // 0.0 to 1.0
  relevance_reason: RelevanceReason;
};

/** The public Field interface — v0.2 Story 5. */
export type Field = {
  write(input: WriteInput): Promise<WriteResult>;
  read(query?: ReadQuery, options?: ReadOptions): Promise<FieldEntry[]>;
  attune(context: AttuneContext): Promise<FieldEntryWithRelevance[]>;
  register(input: RegisterInput): Promise<RegisterResult>;
  deregister(input: { id: string }): Promise<void>;
  draft(input: DraftInput): Promise<{ draft_id: string }>;
  commit(input: CommitInput): Promise<CommitResult>;
  discard(input: DiscardInput): Promise<void>;
};
