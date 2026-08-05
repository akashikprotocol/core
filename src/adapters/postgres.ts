// A real runtime import, deliberately. This module is reachable only through
// src/postgres.ts, the separate subpath entry point — never through
// src/index.ts. A consumer who imports "@akashikprotocol/core/postgres" is
// expected to have installed the optional peer dependency `pg` themselves.
import { Pool } from "pg";
import type { PoolClient } from "pg";
import type { EventScope, StorageAdapter } from "../adapter.js";
import type { FieldEvent } from "../events.js";
import { type Projection, deserializeProjection, serializeProjection } from "../projection.js";

export type PostgresAdapterOptions = {
  /** An existing pg Pool. Either this or connectionString is required. */
  pool?: Pool;
  /** Connection string. A Pool is created and owned by the adapter. */
  connectionString?: string;
  /** Namespaces this field within the database. Defaults to "default". */
  fieldId?: string;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS akashik_events (
  seq        BIGSERIAL PRIMARY KEY,
  field_id   TEXT   NOT NULL,
  v          INTEGER NOT NULL,
  event_id   TEXT   NOT NULL,
  type       TEXT   NOT NULL,
  lamport    BIGINT NOT NULL,
  agent      TEXT,
  wall_time  BIGINT NOT NULL,
  payload    JSONB  NOT NULL
);

CREATE INDEX IF NOT EXISTS akashik_events_field_seq
  ON akashik_events (field_id, seq);

-- RecordEvent's payload stores the whole entry under an "entry" key
-- (matching MemoryAdapter's own event.entry.topic access), so topic is
-- nested two levels deep: payload->'entry'->>'topic', not payload->>'topic'.
CREATE INDEX IF NOT EXISTS akashik_events_field_topic
  ON akashik_events (field_id, (payload->'entry'->>'topic'))
  WHERE type = 'RECORD';

CREATE UNIQUE INDEX IF NOT EXISTS akashik_events_event_id
  ON akashik_events (field_id, event_id);

CREATE TABLE IF NOT EXISTS akashik_projections (
  field_id   TEXT PRIMARY KEY,
  up_to_seq  BIGINT NOT NULL,
  snapshot   JSONB  NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

/** Row shape as returned by SELECT ... FROM akashik_events. */
type EventRow = {
  seq: string; // BIGINT — pg returns as string; see rowToEvent.
  v: number;
  event_id: string;
  type: string;
  lamport: string; // BIGINT — pg returns as string; see rowToEvent.
  agent: string | null;
  wall_time: string; // BIGINT — pg returns as string; see rowToEvent.
  payload: Record<string, unknown>;
};

/**
 * Reconstruct a FieldEvent from a row. BIGINT columns (seq, lamport,
 * wall_time) come back from `pg` as strings, not numbers — node-pg's
 * default type parser avoids silent precision loss for values beyond
 * Number.MAX_SAFE_INTEGER, which BIGINT can hold but `number` cannot. v0.3
 * does not support fields with more than 2^53 events; Number() is exact
 * below that boundary.
 *
 * `payload` never carries a `seq` key (append() strips it before storing —
 * see the destructure there), so spreading it first and setting the real,
 * column-sourced seq after cannot be shadowed either way. Kept in this order
 * regardless, so the authoritative column value always wins on principle.
 */
function rowToEvent(row: EventRow): FieldEvent {
  return {
    ...row.payload,
    type: row.type,
    v: row.v,
    event_id: row.event_id,
    lamport: Number(row.lamport),
    agent: row.agent,
    wall_time: Number(row.wall_time),
    seq: Number(row.seq),
  } as FieldEvent;
}

export function createPostgresAdapter(options: PostgresAdapterOptions): StorageAdapter {
  const fieldId = options.fieldId ?? "default";
  const ownsPool = options.pool === undefined;
  const pool = options.pool ?? createPoolFrom(options.connectionString);

  return {
    // PostgresAdapter is durable — state survives process restart.
    capabilities: ["durable"],

    async init(): Promise<void> {
      await pool.query(SCHEMA_SQL);
    },

    async append(events: FieldEvent[]): Promise<{ seqs: number[] }> {
      if (events.length === 0) return { seqs: [] };

      const client: PoolClient = await pool.connect();
      try {
        await client.query("BEGIN");

        // Serialize seq assignment for this field. BIGSERIAL assigns values
        // at INSERT time, not COMMIT time, so two concurrent transactions
        // can commit out of the order their seqs were assigned — a reader
        // polling with sinceSeq could observe the higher seq first, advance
        // its watermark past it, and then the lower seq becomes permanently
        // unreachable (sinceSeq only ever looks forward). The advisory lock
        // is held for the transaction's duration and released automatically
        // on COMMIT or ROLLBACK, so appends to THIS field serialize while
        // appends to other fields do not contend. Do not remove this as an
        // "optimization" — the cost is append throughput on a single field;
        // the benefit is that sinceSeq never silently drops an event.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [fieldId]);

        const seqs: number[] = [];
        for (const event of events) {
          // seq is excluded from the stored payload deliberately: it is
          // always -1 (the "not yet appended" sentinel) on a fresh event,
          // and the column is the only authoritative source once appended.
          const { type, v, event_id, lamport, agent, wall_time, seq: _seq, ...payload } = event;
          const result = await client.query<{ seq: string }>(
            `INSERT INTO akashik_events
               (field_id, v, event_id, type, lamport, agent, wall_time, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING seq`,
            [fieldId, v, event_id, type, lamport, agent, wall_time, JSON.stringify(payload)],
          );
          const row = result.rows[0];
          if (!row) {
            throw new Error("INSERT ... RETURNING seq returned no row");
          }
          seqs.push(Number(row.seq));
        }

        await client.query("COMMIT");
        return { seqs };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async readEvents(opts?: { scope?: EventScope; sinceSeq?: number }): Promise<FieldEvent[]> {
      const conditions = ["field_id = $1"];
      const params: unknown[] = [fieldId];

      if (opts?.sinceSeq !== undefined) {
        params.push(opts.sinceSeq);
        conditions.push(`seq > $${params.length}`);
      }

      if (opts?.scope?.agent !== undefined) {
        params.push(opts.scope.agent);
        conditions.push(`agent = $${params.length}`);
      }

      if (opts?.scope?.topic !== undefined) {
        params.push(opts.scope.topic);
        // Mirror MemoryAdapter: non-RECORD events pass through a topic scope,
        // because the field needs REGISTER events to resolve roles. The two
        // adapters must never diverge here — identical behaviour under one
        // interface is the entire point of this story. Note the JSONB path:
        // a RECORD's topic lives at payload.entry.topic (RecordEvent stores
        // the whole entry object under "entry"), not payload.topic directly.
        conditions.push(`(type <> 'RECORD' OR payload->'entry'->>'topic' = $${params.length})`);
      }

      const result = await pool.query<EventRow>(
        `SELECT seq, v, event_id, type, lamport, agent, wall_time, payload
           FROM akashik_events
          WHERE ${conditions.join(" AND ")}
          ORDER BY seq ASC`,
        params,
      );

      return result.rows.map(rowToEvent);
    },

    async loadProjection(_scope?: EventScope): Promise<Projection | null> {
      const result = await pool.query<{ snapshot: unknown; up_to_seq: string }>(
        "SELECT snapshot, up_to_seq FROM akashik_projections WHERE field_id = $1",
        [fieldId],
      );
      const row = result.rows[0];
      if (!row) return null;
      return deserializeProjection(row.snapshot);
    },

    async saveProjection(projection: Projection, upToSeq: number): Promise<void> {
      // The WHERE guard makes snapshot writes monotonic: without it, a
      // writer holding a stale projection could overwrite a newer snapshot
      // with older state (e.g. two processes racing to snapshot at
      // different points). ON CONFLICT still fires on a losing write — it
      // just updates nothing, which is correct: the log remains
      // authoritative regardless of whether the snapshot advanced.
      await pool.query(
        `INSERT INTO akashik_projections (field_id, up_to_seq, snapshot, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (field_id) DO UPDATE
           SET up_to_seq = EXCLUDED.up_to_seq,
               snapshot   = EXCLUDED.snapshot,
               updated_at = now()
         WHERE akashik_projections.up_to_seq <= EXCLUDED.up_to_seq`,
        [fieldId, upToSeq, JSON.stringify(serializeProjection(projection))],
      );
    },

    async close(): Promise<void> {
      // Only end a pool this adapter created. An injected pool belongs to
      // the caller, who may still be using it for other fields.
      if (ownsPool) await pool.end();
    },
  };
}

function createPoolFrom(connectionString: string | undefined): Pool {
  if (connectionString === undefined) {
    throw new Error(
      "createPostgresAdapter() requires either options.pool or options.connectionString",
    );
  }
  return new Pool({ connectionString });
}
