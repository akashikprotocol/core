import type { FieldEvent, RecordEvent } from "./events.js";

/**
 * Filters a replay. All fields are optional and combine with AND semantics,
 * except entry_id with followChain, which expands the result set (see below).
 */
export type ReplayQuery = {
  /** Restrict to events concerning this entry id. */
  entry_id?: string;
  /** Restrict to events on this topic. */
  topic?: string;
  /** Restrict to events from this agent. */
  agent?: string;
  /** Only events with seq strictly greater than this. */
  sinceSeq?: number;
  /** Only events with seq less than or equal to this. */
  untilSeq?: number;
  /**
   * When entry_id is given, also include events for entries in the same
   * supersession chain, walking both backward (predecessors) and forward
   * (successors). Defaults to true — chain reconstruction is the point of
   * REPLAY. Set false to see only the literal entry's own events.
   */
  followChain?: boolean;
};

/**
 * Given a full event set and a starting entry id, return the set of entry ids
 * in that entry's supersession chain, walking both directions transitively.
 *
 * Backward: if entry X's RECORD carries `supersedes: W`, then W is in the chain.
 * Forward: if some RECORD carries `supersedes: X`, that record's entry is in
 * the chain.
 *
 * Pure. Terminates on cycles via the visited set (cycles should be impossible
 * but defensive handling costs nothing).
 */
export function resolveChain(events: FieldEvent[], entryId: string): Set<string> {
  const chain = new Set<string>([entryId]);

  // Index for forward walking: supersededId -> the record that supersedes it.
  const supersededBy = new Map<string, RecordEvent>();
  // Index for backward walking: entryId -> what it supersedes.
  const supersedes = new Map<string, string>();

  for (const event of events) {
    if (event.type !== "RECORD") continue;
    if (event.supersedes !== undefined) {
      supersededBy.set(event.supersedes, event);
      supersedes.set(event.entry_id, event.supersedes);
    }
  }

  // Walk backward from entryId through predecessors.
  let cursor: string | undefined = entryId;
  while (cursor !== undefined) {
    const predecessor: string | undefined = supersedes.get(cursor);
    if (predecessor === undefined || chain.has(predecessor)) break;
    chain.add(predecessor);
    cursor = predecessor;
  }

  // Walk forward from entryId through successors.
  cursor = entryId;
  while (cursor !== undefined) {
    const successor: RecordEvent | undefined = supersededBy.get(cursor);
    if (successor === undefined || chain.has(successor.entry_id)) break;
    chain.add(successor.entry_id);
    cursor = successor.entry_id;
  }

  return chain;
}

/**
 * Apply a ReplayQuery to an already-ordered event list.
 * Pure. Assumes events arrive in total order and preserves that order.
 */
export function filterReplay(events: FieldEvent[], query: ReplayQuery = {}): FieldEvent[] {
  let result = events;

  if (query.sinceSeq !== undefined) {
    const since = query.sinceSeq;
    result = result.filter((e) => e.seq > since);
  }

  if (query.untilSeq !== undefined) {
    const until = query.untilSeq;
    result = result.filter((e) => e.seq <= until);
  }

  if (query.agent !== undefined) {
    const agent = query.agent;
    result = result.filter((e) => e.agent === agent);
  }

  if (query.topic !== undefined) {
    const topic = query.topic;
    result = result.filter((e) => {
      if (e.type !== "RECORD") return false; // topic filter EXCLUDES non-RECORD here
      return e.entry.topic === topic;
    });
  }

  if (query.entry_id !== undefined) {
    const follow = query.followChain ?? true;
    const ids = follow
      ? resolveChain(events, query.entry_id) // chain resolved over the FULL set
      : new Set([query.entry_id]);
    result = result.filter((e) => ids.has(e.entry_id));
  }

  return result;
}
