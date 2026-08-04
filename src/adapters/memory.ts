import type { EventScope, StorageAdapter } from "../adapter.js";
import type { FieldEvent } from "../events.js";
import type { Projection } from "../projection.js";

/**
 * In-memory storage adapter. Stores events in an array, assigns sequential
 * seq values, never persists beyond process memory. The reference adapter and
 * the default backing for createField().
 */
export function createMemoryAdapter(): StorageAdapter {
  const log: FieldEvent[] = [];
  let nextSeq = 0;

  return {
    async append(events: FieldEvent[]): Promise<{ seqs: number[] }> {
      const seqs: number[] = [];
      for (const event of events) {
        const seq = nextSeq++;
        // Stamp with the assigned seq. Preserve every other field, including v.
        log.push({ ...event, seq });
        seqs.push(seq);
      }
      return { seqs };
    },

    async readEvents(options?: {
      scope?: EventScope;
      sinceSeq?: number;
    }): Promise<FieldEvent[]> {
      let result: FieldEvent[] = log;

      if (options?.sinceSeq !== undefined) {
        const since = options.sinceSeq;
        result = result.filter((e) => e.seq > since);
      }

      if (options?.scope?.topic !== undefined) {
        const topic = options.scope.topic;
        result = result.filter((e) => {
          if (e.type !== "RECORD") return true; // non-RECORD events are never topic-filtered
          const t = e.entry.topic;
          return t === topic;
        });
      }

      if (options?.scope?.agent !== undefined) {
        const agent = options.scope.agent;
        // Unlike topic, agent filtering applies to every event type — every
        // event carries `agent`, so there is no "pass through" case here.
        result = result.filter((e) => e.agent === agent);
      }

      return [...result]; // copy; never hand out the internal array
    },

    async loadProjection(_scope?: EventScope): Promise<Projection | null> {
      // No snapshotting. Returning null tells the field to rebuild from events.
      // Legal per the interface contract; snapshots are an optimisation only.
      return null;
    },

    async saveProjection(_projection: Projection, _upToSeq: number): Promise<void> {
      // No-op. The log is cheap to replay in memory.
    },

    // init / close omitted — MemoryAdapter needs neither.
  };
}
