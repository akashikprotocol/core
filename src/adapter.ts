import type { FieldEvent } from "./events.js";
import type { Projection } from "./projection.js";

/** Restricts reads to a subset of the log. */
export type EventScope = {
  topic?: string;
  agent?: string; // NEW in Story 2
};

/**
 * The storage contract. Every backend implements this. The Field is written
 * once against this interface.
 *
 * Ordering guarantee: append assigns monotonically increasing seq values;
 * readEvents returns events in ascending seq order.
 */
export interface StorageAdapter {
  /**
   * Append events atomically — all land or none do. Returns assigned seq
   * values in the same order as the input events.
   */
  append(events: FieldEvent[]): Promise<{ seqs: number[] }>;

  /**
   * Read events, optionally scoped and bounded.
   * - scope: restrict to a topic (efficiency for serverless).
   * - sinceSeq: only events with seq strictly greater than this.
   */
  readEvents(options?: { scope?: EventScope; sinceSeq?: number }): Promise<FieldEvent[]>;

  /**
   * Load a projection snapshot, optionally scoped. Returns null when no
   * snapshot exists — the caller rebuilds from events. Always returning null
   * is a legal implementation; snapshots are an optimisation only.
   */
  loadProjection(scope?: EventScope): Promise<Projection | null>;

  /**
   * Save a snapshot reflecting events up to upToSeq. May be a no-op.
   * The log remains authoritative regardless.
   */
  saveProjection(projection: Projection, upToSeq: number): Promise<void>;

  /** Optional one-time setup (create tables, open file). */
  init?(): Promise<void>;

  /** Optional graceful teardown (close connections, flush). */
  close?(): Promise<void>;
}
