import type { FieldEntry } from "./types.js";

export type Conflict = {
  a: FieldEntry;
  b: FieldEntry;
  keys: string[]; // shared keys whose values disagree, sorted alphabetically
};

/**
 * Detect conflicts among a set of entries.
 *
 * Two entries conflict when:
 *   1. They share the same `entry.topic` value (strict equality)
 *   2. They share at least one OTHER key in `entry`
 *   3. Values at that shared key differ AND both are primitive
 *      (string, number, boolean, null)
 *
 * Object-valued shared keys do NOT produce conflicts in v0.2 (deferred to v0.4).
 *
 * Returns each pair once (A vs B, not B vs A) with the list of disagreeing keys
 * sorted alphabetically. Pairs are sorted by the timestamp of the second-written
 * entry in each pair, ascending (most recent conflicts appear last).
 */
export function findConflicts(entries: FieldEntry[]): Conflict[] {
  const conflicts: Conflict[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i] as FieldEntry;
      const b = entries[j] as FieldEntry;

      // Same id: impossible to conflict with self.
      if (a.id === b.id) continue;

      // Topic must be defined and equal on both sides.
      if (a.entry.topic === undefined) continue;
      if (a.entry.topic !== b.entry.topic) continue;

      // Find shared keys other than topic where values are primitives and differ.
      const conflictingKeys: string[] = [];
      for (const key of Object.keys(a.entry)) {
        if (key === "topic") continue;
        if (!(key in b.entry)) continue;

        const aValue = a.entry[key];
        const bValue = b.entry[key];

        // Both values must be primitive.
        if (!isPrimitive(aValue) || !isPrimitive(bValue)) continue;

        // Values must differ.
        if (aValue === bValue) continue;

        conflictingKeys.push(key);
      }

      if (conflictingKeys.length > 0) {
        conflicts.push({ a, b, keys: conflictingKeys.sort() });
      }
    }
  }

  // Sort by the timestamp of the second-written entry in each pair, ascending.
  conflicts.sort((c1, c2) => {
    const c1Second = Math.max(c1.a.timestamp, c1.b.timestamp);
    const c2Second = Math.max(c2.a.timestamp, c2.b.timestamp);
    return c1Second - c2Second;
  });

  return conflicts;
}

function isPrimitive(value: unknown): boolean {
  if (value === null) return true;
  const t = typeof value;
  return t === "string" || t === "number" || t === "boolean";
}
