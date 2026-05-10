import type { AttuneContext, FieldEntry, RelevanceReason, Session } from "./types.js";

/** Field state needed by the scoring algorithm. */
export type RelevanceContext = {
  /** All entries currently visible to the calling agent in attune,
   *  used to compute recency relative to the surfaced set. */
  visibleEntries: FieldEntry[];
  /** The session for the entry's writing agent, if any.
   *  Null if the writer didn't register. */
  writerSession: Session | null;
  /** The session for the calling agent, if any.
   *  Null if the caller didn't register. */
  callerSession: Session | null;
};

/** Compute a relevance score and reason for a single entry. */
export function computeRelevance(
  entry: FieldEntry,
  context: AttuneContext,
  state: RelevanceContext,
): { score: number; reason: RelevanceReason } {
  let topicScore = 0;
  let roleScore = 0;
  let recencyScore = 0;
  let intentScore = 0;

  // Topic match: heaviest signal because it's explicit caller intent.
  if (context.topic !== undefined && entry.entry.topic === context.topic) {
    topicScore = 0.6;
  }

  // Role match: use context.role if provided (explicit override),
  // otherwise fall back to caller's session role.
  // If either side's role is unknown, contribution is 0.
  const callerRole = context.role ?? state.callerSession?.role ?? null;
  const writerRole = state.writerSession?.role ?? null;

  if (callerRole !== null && writerRole !== null && callerRole === writerRole) {
    roleScore = 0.2;
  }

  // Recency: newer entries score higher.
  // Normalised against the epoch spread of the visible entry set.
  if (state.visibleEntries.length > 0) {
    const epochs = state.visibleEntries.map((e) => e.epoch);
    const newestEpoch = Math.max(...epochs);
    const oldestEpoch = Math.min(...epochs);
    const epochDistance = newestEpoch - entry.epoch;
    const totalSpread = Math.max(1, newestEpoch - oldestEpoch);
    const recencyFactor = 1 - epochDistance / totalSpread;
    recencyScore = 0.15 * recencyFactor;
  }

  // Intent quality: substantive intents (50+ chars) get a small boost.
  if (entry.intent.length >= 50) {
    intentScore = 0.05;
  }

  const totalScore = Math.min(topicScore + roleScore + recencyScore + intentScore, 1.0);

  return {
    score: totalScore,
    reason: {
      components: {
        topic: topicScore,
        role: roleScore,
        recency: recencyScore,
        intent: intentScore,
      },
      summary: buildSummary({ topicScore, roleScore, recencyScore, intentScore }),
    },
  };
}

/** Build a human-readable summary string from the components. */
function buildSummary(parts: {
  topicScore: number;
  roleScore: number;
  recencyScore: number;
  intentScore: number;
}): string {
  const fragments: string[] = [];
  if (parts.topicScore > 0) {
    fragments.push(`topic match (${parts.topicScore.toFixed(2)})`);
  }
  if (parts.roleScore > 0) {
    fragments.push(`role match (${parts.roleScore.toFixed(2)})`);
  }
  if (parts.recencyScore > 0) {
    fragments.push(`recent (${parts.recencyScore.toFixed(2)})`);
  }
  if (parts.intentScore > 0) {
    fragments.push(`intent substantive (${parts.intentScore.toFixed(2)})`);
  }
  return fragments.length > 0 ? fragments.join("; ") : "no relevance signals matched";
}
