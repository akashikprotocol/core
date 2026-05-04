/**
 * examples/coding-agents.ts
 *
 * Three coding agents collaborate on a feature implementation using a shared Field.
 *
 * Roles:
 *   - planner    Breaks down the feature, records decisions and constraints.
 *   - implementer Writes code, flags blockers, reports progress.
 *   - reviewer   Inspects the implementation, raises concerns, approves or blocks.
 *
 * Each agent writes with explicit intent. Attunement lets each agent surface
 * only what's relevant to its next action — without polling or direct messaging.
 *
 * Run: npx tsx examples/coding-agents.ts
 */

/// <reference types="node" />

import { createField } from "../src/index.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function printEntry(entry: {
  epoch: number;
  status: string;
  agent?: string;
  intent: string;
  entry: Record<string, unknown>;
}) {
  const agent = entry.agent ?? "anonymous";
  const payload = JSON.stringify(entry.entry);
  console.log(`  [epoch:${entry.epoch}] [${agent}] ${entry.intent}`);
  console.log(`    ${payload}`);
}

function section(title: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log("─".repeat(60));
}

// ── simulation ────────────────────────────────────────────────────────────────

async function main() {
  const field = createField();

  // ── Phase 1: Planner breaks down the feature ────────────────────────────────

  section("Phase 1 — Planner: feature breakdown");

  await field.write({
    entry: {
      topic: "feature",
      feature: "auth-refresh-token",
      scope: ["POST /auth/refresh", "token rotation", "revocation store"],
      constraints: ["must not extend session on revoked token", "RT lifespan: 30 days"],
    },
    intent: "defining scope and constraints for the refresh-token feature",
    agent: "planner",
  });

  await field.write({
    entry: {
      topic: "decision",
      decision: "use Redis for revocation store",
      rationale: "sub-millisecond lookup, TTL-native, already in infra",
      alternatives_rejected: ["Postgres flag column (too slow)", "in-memory (not distributed)"],
    },
    intent: "recording architecture decision so implementer and reviewer share context",
    agent: "planner",
  });

  await field.write({
    entry: {
      topic: "risk",
      risk: "clock skew between nodes may cause premature token rejection",
      mitigation: "allow 30-second leeway in expiry check",
    },
    intent: "flagging clock-skew risk before implementation starts",
    agent: "planner",
  });

  // ── Phase 2: Implementer attunes, then writes ───────────────────────────────

  section("Phase 2 — Implementer: reads context, starts work");

  // Implementer attunes to see what the planner left before touching code.
  const plannerContext = await field.attune({
    agent: "implementer",
    topic: "feature",
  });

  console.log("\n  implementer.attune({ topic: 'feature' }) — what the planner left:");
  for (const e of plannerContext) printEntry(e);

  // Implementer reads all decisions and risks too.
  const allContext = await field.read({ topic: "decision" });
  const risks = await field.read({ topic: "risk" });

  console.log("\n  field.read({ topic: 'decision' }):");
  for (const e of allContext) printEntry(e);

  console.log("\n  field.read({ topic: 'risk' }):");
  for (const e of risks) printEntry(e);

  // Implementer starts work and logs progress.
  await field.write({
    entry: {
      topic: "progress",
      phase: "in-progress",
      completed: ["POST /auth/refresh endpoint skeleton", "Redis revocation store client"],
      next: ["token rotation logic", "expiry-leeway patch"],
    },
    intent: "reporting implementation progress so reviewer can track state",
    agent: "implementer",
  });

  await field.write({
    entry: {
      topic: "blocker",
      blocker: "Redis client library typings are outdated — TS errors on TTL set",
      workaround: "cast to `any` temporarily, open issue #482",
    },
    intent: "logging a blocker so planner can reprioritise if needed",
    agent: "implementer",
  });

  await field.write({
    entry: {
      topic: "progress",
      phase: "complete",
      pr: "github.com/org/repo/pull/201",
      notes: "30-second leeway applied per planner risk note",
    },
    intent: "signalling implementation complete and ready for review",
    agent: "implementer",
  });

  // ── Phase 3: Reviewer attunes, inspects, responds ──────────────────────────

  section("Phase 3 — Reviewer: attunes, inspects, raises concerns");

  // Reviewer sees everything written by planner and implementer.
  const reviewerView = await field.attune({ agent: "reviewer" });

  console.log("\n  reviewer.attune() — full field minus reviewer's own entries:");
  for (const e of reviewerView) printEntry(e);

  // Reviewer raises a concern about the workaround.
  await field.write({
    entry: {
      topic: "review-concern",
      severity: "medium",
      ref: "blocker logged by implementer (epoch 4)",
      concern: "casting Redis TTL arg to `any` will silently break on library upgrade",
      suggested_fix: "patch @types/ioredis or use a typed wrapper — do not merge with cast",
    },
    intent: "blocking merge until the Redis typing workaround is resolved properly",
    agent: "reviewer",
  });

  await field.write({
    entry: {
      topic: "review-approval",
      status: "approved-with-conditions",
      conditions: ["resolve Redis typing concern before merge"],
      lgtm: ["endpoint logic", "token rotation", "revocation check", "leeway handling"],
    },
    intent: "approving the PR conditionally — implementation is correct, one hygiene fix needed",
    agent: "reviewer",
  });

  // ── Phase 4: Implementer attunes to reviewer feedback ──────────────────────

  section("Phase 4 — Implementer: reads reviewer feedback, resolves");

  const feedback = await field.attune({
    agent: "implementer",
    topic: "review-concern",
  });

  console.log("\n  implementer.attune({ topic: 'review-concern' }):");
  for (const e of feedback) printEntry(e);

  await field.write({
    entry: {
      topic: "resolution",
      resolves: "review-concern (epoch 7)",
      action: "switched to typed wrapper `ioredis-typed-ttl`, removed cast, tests green",
      pr_updated: true,
    },
    intent: "confirming the reviewer's concern is resolved and PR is updated",
    agent: "implementer",
  });

  // ── Final state: full field in write order ──────────────────────────────────

  section("Final field state — all entries in write order");

  const all = await field.read();
  for (const e of all) printEntry(e);

  console.log(`\n  Total entries: ${all.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
