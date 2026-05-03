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

/** The canonical entry shape returned by field.read() and field.attune().
 *  Returned types are forward-declared here even though read/attune
 *  arrive in Stories 2/3 — keeps types stable for consumers. */
export type FieldEntry = {
  id: string;
  timestamp: number;
  entry: Record<string, unknown>;
  intent: string;
  agent?: string;
};

/** Query shape for field.read() — implemented in Story 2. */
export type ReadQuery = Record<string, unknown>;

/** Context shape for field.attune() — implemented in Story 3. */
export type AttuneContext = {
  agent: string;
  topic?: string;
};

/** The public Field interface — v0.1 complete. */
export type Field = {
  write(input: WriteInput): Promise<WriteResult>;
  read(query?: ReadQuery): Promise<FieldEntry[]>;
  attune(context: AttuneContext): Promise<FieldEntry[]>;
};
