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

/** Context shape for field.attune() — implemented in Story 3. */
export type AttuneContext = {
  agent: string;
  topic?: string;
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

/** The public Field interface — v0.2 Story 2. */
export type Field = {
  write(input: WriteInput): Promise<WriteResult>;
  read(query?: ReadQuery): Promise<FieldEntry[]>;
  attune(context: AttuneContext): Promise<FieldEntry[]>;
  register(input: RegisterInput): Promise<RegisterResult>;
  deregister(input: { id: string }): Promise<void>;
};
