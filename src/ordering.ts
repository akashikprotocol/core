import type { FieldEvent } from "./events.js";

/**
 * Total order over events: (lamport, agent, event_id).
 *
 * - lamport ascending gives causal order.
 * - agent id lexicographic breaks lamport ties. null sorts before any string.
 * - event_id (ULID) breaks remaining ties. ULIDs are unique, so no two
 *   distinct events can tie on all three — this is a TOTAL order.
 *
 * In a single process lamport increments by 1 per event, so this reduces
 * exactly to v0.2's monotonic counter order. Multi-process concurrency is
 * where the secondary keys matter.
 *
 * wall_time is NEVER consulted. Wall clocks drift between machines.
 */
export function compareEventOrder(a: FieldEvent, b: FieldEvent): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;

  const byAgent = compareAgent(a.agent, b.agent);
  if (byAgent !== 0) return byAgent;

  if (a.event_id < b.event_id) return -1;
  if (a.event_id > b.event_id) return 1;
  return 0;
}

function compareAgent(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}
