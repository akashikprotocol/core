import type { FieldEvent } from "./events.js";
import { compareEventOrder } from "./ordering.js";
import type { FieldEntry } from "./types.js";

/**
 * Derived current state of a field, built by applying events in total order.
 *
 * NEVER written to directly. Only ever updated via applyEvent. This invariant
 * is what guarantees the projection can always be rebuilt from the log and can
 * never disagree with it.
 */
export type Projection = {
  /** Current entries by entry id, with resolved status. */
  entries: Map<string, FieldEntry>;
  /** Active sessions by agent id. */
  sessions: Map<string, { role: string; capabilities: string[] }>;
  /** Highest event seq applied. -1 when empty. */
  upToSeq: number;
  /** Highest lamport value seen. Used to advance the field's clock on load. */
  maxLamport: number;
};

export function emptyProjection(): Projection {
  return { entries: new Map(), sessions: new Map(), upToSeq: -1, maxLamport: 0 };
}

/**
 * Apply one event to a projection, mutating in place and returning it.
 * The ONLY function permitted to change projection state.
 *
 * Events must arrive in total order. buildProjection guarantees this; direct
 * callers must sort first.
 */
export function applyEvent(projection: Projection, event: FieldEvent): Projection {
  switch (event.type) {
    case "RECORD": {
      // Supersede's new half: mark the predecessor superseded first, if present.
      if (event.supersedes !== undefined) {
        const predecessor = projection.entries.get(event.supersedes);
        if (predecessor) {
          projection.entries.set(event.supersedes, { ...predecessor, status: "superseded" });
        }
      }

      // Establish the entry as committed.
      const fieldEntry: FieldEntry = {
        id: event.entry_id,
        timestamp: event.wall_time,
        epoch: event.lamport,
        ...(event.agent !== null && { agent: event.agent }),
        status: "committed",
        entry: event.entry,
        intent: event.intent,
        ...(event.confidence !== undefined && { confidence: event.confidence }),
      };
      projection.entries.set(event.entry_id, fieldEntry);
      break;
    }
    case "STATUS_CHANGE": {
      // Missing entry: no-op (mirrors v0.2's idempotent retract).
      const target = projection.entries.get(event.entry_id);
      if (target) {
        projection.entries.set(event.entry_id, { ...target, status: event.new_status });
      }
      break;
    }
    case "REGISTER": {
      projection.sessions.set(event.entry_id, {
        role: event.role,
        capabilities: event.capabilities,
      });
      break;
    }
    case "DEREGISTER": {
      projection.sessions.delete(event.entry_id);
      break;
    }
  }

  projection.upToSeq = Math.max(projection.upToSeq, event.seq);
  projection.maxLamport = Math.max(projection.maxLamport, event.lamport);
  return projection;
}

/**
 * Build a projection from scratch. Sorts into total order before applying,
 * so callers may pass events in any order.
 */
export function buildProjection(events: FieldEvent[]): Projection {
  const sorted = [...events].sort(compareEventOrder);
  const projection = emptyProjection();
  for (const event of sorted) applyEvent(projection, event);
  return projection;
}

/**
 * JSON-safe form of a Projection. Map does not survive JSON.stringify — its
 * enumerable own properties are none, so it would serialize as `{}`. Adapters
 * that persist snapshots (Story 7) round-trip through this shape instead.
 */
export type SerializedProjection = {
  entries: [string, FieldEntry][];
  sessions: [string, { role: string; capabilities: string[] }][];
  upToSeq: number;
  maxLamport: number;
};

/** Convert a Projection to its JSON-safe form. Pure; does not mutate. */
export function serializeProjection(p: Projection): SerializedProjection {
  return {
    entries: [...p.entries.entries()],
    sessions: [...p.sessions.entries()],
    upToSeq: p.upToSeq,
    maxLamport: p.maxLamport,
  };
}

/**
 * Reconstruct a Projection from its JSON-safe form. Pure. `raw` is `unknown`
 * because it typically arrives from a JSON column or JSON.parse, neither of
 * which the type system can vouch for — the adapter that wrote it is the
 * only thing guaranteeing the shape matches.
 */
export function deserializeProjection(raw: unknown): Projection {
  const s = raw as SerializedProjection;
  return {
    entries: new Map(s.entries),
    sessions: new Map(s.sessions),
    upToSeq: s.upToSeq,
    maxLamport: s.maxLamport,
  };
}
