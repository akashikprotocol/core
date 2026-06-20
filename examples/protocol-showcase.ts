/**
 * examples/protocol-showcase.ts
 *
 * Full Akashik Protocol v0.2 showcase.
 * Demonstrates every capability shipped through Stories 0–7:
 *
 *   ✦ REGISTER / DEREGISTER — agent lifecycle with roles
 *   ✦ RECORD (write) — mandatory intent on every write
 *   ✦ read() — declarative query; write-order, unscored
 *   ✦ ATTUNE — relevance-scored, sorted, capped with max_units
 *   ✦ DRAFT / COMMIT / DISCARD — draft lifecycle
 *   ✦ RETRACT / SUPERSEDE — committed-entry lifecycle
 *   ✦ RECKON — conflict-aware attune
 *   ✦ role parameter — explicit role for scoring without a session
 *   ✦ Message envelope — silently wraps every operation
 *
 * Run: npx tsx examples/protocol-showcase.ts
 *      npm run example:showcase
 */

/// <reference types="node" />

import chalk from "chalk";
import { createField } from "../src/index.js";

// ── display helpers ───────────────────────────────────────────────────────────

function header(title: string) {
  console.log(`\n${chalk.bold.cyan("━".repeat(62))}`);
  console.log(chalk.bold.cyan(`  ${title}`));
  console.log(chalk.bold.cyan("━".repeat(62)));
}

function subheader(text: string) {
  console.log(`\n${chalk.bold.white(`  ${text}`)}`);
}

function badge(label: string, value: string | number, color: chalk.Chalk) {
  return chalk.dim("[") + color(`${label}:`) + chalk.white(String(value)) + chalk.dim("]");
}

function scorebar(score: number): string {
  const filled = Math.round(score * 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);
  const color = score >= 0.7 ? chalk.green : score >= 0.4 ? chalk.yellow : chalk.red;
  return color(bar) + chalk.dim(` ${(score * 100).toFixed(0)}%`);
}

function printWrite(agent: string, entry: Record<string, unknown>, intent: string) {
  console.log(
    `    ${chalk.bold.green("RECORD")}  ${chalk.bold(agent)}  ${chalk.dim("→")}  ${chalk.italic.gray(intent)}`,
  );
  console.log(`           ${chalk.dim(JSON.stringify(entry))}`);
}

function printEntry(e: {
  epoch: number;
  agent?: string;
  intent: string;
  entry: Record<string, unknown>;
  relevance_score?: number;
  relevance_reason?: {
    components: { topic: number; role: number; recency: number; intent: number };
    summary: string;
  };
}) {
  const agentTag = badge("agent", e.agent ?? "anon", chalk.magenta);
  const epochTag = badge("epoch", e.epoch, chalk.blue);

  if (e.relevance_score !== undefined && e.relevance_reason !== undefined) {
    const scoreTag = badge("score", `${(e.relevance_score * 100).toFixed(0)}%`, chalk.yellow);
    const { topic, role, recency, intent: intentComp } = e.relevance_reason.components;
    const breakdown = chalk.dim(
      `topic:${(topic * 100).toFixed(0)} role:${(role * 100).toFixed(0)} recency:${(recency * 100).toFixed(0)} intent:${(intentComp * 100).toFixed(0)}`,
    );
    console.log(`    ${scorebar(e.relevance_score)}  ${agentTag} ${epochTag} ${scoreTag}`);
    console.log(`    ${chalk.dim("│")}  ${chalk.italic(e.intent)}`);
    console.log(`    ${chalk.dim("│")}  ${breakdown}`);
    console.log(`    ${chalk.dim("╰")}  ${chalk.dim(JSON.stringify(e.entry))}`);
  } else {
    console.log(`    ${agentTag} ${epochTag}  ${chalk.italic(e.intent)}`);
    console.log(`    ${chalk.dim("╰")}  ${chalk.dim(JSON.stringify(e.entry))}`);
  }
  console.log();
}

// ── scenario ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.bold.magenta("\n  ◈ Akashik Protocol v0.2 — Full Showcase\n"));

  const field = createField();

  // ── 1. REGISTER ─────────────────────────────────────────────────────────────

  header("1 · REGISTER — agent lifecycle");

  const agents = [
    { id: "market-analyst", role: "researcher" },
    { id: "fact-checker", role: "researcher" },
    { id: "content-writer", role: "writer" },
    { id: "strategist", role: "strategist" },
  ];

  for (const { id, role } of agents) {
    const result = await field.register({ id, role });
    console.log(
      `    ${chalk.bold.green("REGISTER")}  ${chalk.bold(id)}  ${chalk.dim("role:")}${chalk.cyan(role)}  ${chalk.dim("session:")}${chalk.gray(result.session_id ?? "—")}  ${chalk.dim("proto:")}${chalk.gray(result.field_protocol_version)}`,
    );
  }

  // ── 2. RECORD (write) ────────────────────────────────────────────────────────

  header("2 · RECORD — writes with mandatory intent");

  const writes = [
    {
      agent: "market-analyst",
      entry: { topic: "saas-pricing", model: "per-seat", price: "$29/seat/mo", source: "g2.com" },
      intent: "documenting competitor per-seat pricing model found on G2 for strategy review",
    },
    {
      agent: "market-analyst",
      entry: { topic: "saas-pricing", model: "usage-based", price: "$0.008/req", source: "stripe" },
      intent: "documenting usage-based pricing alternative observed in Stripe's public API pricing",
    },
    {
      agent: "fact-checker",
      entry: {
        topic: "saas-pricing",
        note: "G2 data may be 6+ months stale — verify before citing",
      },
      intent: "flagging recency risk on G2 source so analyst and writer can account for staleness",
    },
    {
      agent: "fact-checker",
      entry: { topic: "market-size", tam: "$4.2B", source: "IDC 2024", confidence: "high" },
      intent: "recording verified TAM estimate from IDC 2024 report for strategy use",
    },
    {
      agent: "strategist",
      entry: {
        topic: "positioning",
        recommendation: "usage-based",
        rationale: "lower friction for PLG",
      },
      intent:
        "recording pricing strategy recommendation to align content and go-to-market decisions",
    },
    {
      agent: "strategist",
      entry: {
        topic: "saas-pricing",
        risk: "usage-based may confuse SMB buyers unfamiliar with metered billing",
      },
      intent: "surfacing adoption risk for usage-based model so content can address it proactively",
    },
  ] as const;

  for (const w of writes) {
    printWrite(w.agent, w.entry as Record<string, unknown>, w.intent);
    await field.write({
      entry: w.entry as Record<string, unknown>,
      intent: w.intent,
      agent: w.agent,
    });
  }

  // ── 3. read() ────────────────────────────────────────────────────────────────

  header("3 · read() — declarative query, write order");

  subheader("field.read({ topic: 'saas-pricing' })  →  all entries on the topic");
  const pricingEntries = await field.read({ topic: "saas-pricing" });
  for (const e of pricingEntries) printEntry(e);

  // ── 4. ATTUNE — relevance scoring ────────────────────────────────────────────

  header("4 · ATTUNE — relevance scoring + sorting");

  subheader(
    "field.attune({ agent: 'content-writer', topic: 'saas-pricing' })\n" +
      "  content-writer sees entries from other agents, sorted by relevance",
  );

  const writerView = await field.attune({
    agent: "content-writer",
    topic: "saas-pricing",
  });
  for (const e of writerView) printEntry(e);

  // ── 5. DRAFT LIFECYCLE ────────────────────────────────────────────────────

  header("5 · DRAFT LIFECYCLE — draft → commit, draft → discard");

  // content-writer drafts a narrative entry — not yet committed.
  subheader("content-writer drafts a pricing narrative (invisible to others)");

  const { draft_id: narrativeDraftId } = await field.draft({
    entry: {
      topic: "saas-pricing",
      narrative: "usage-based pricing aligns with developer-first PLG motion",
      status: "wip",
    },
    intent: "drafting pricing narrative before committing to the shared field",
    agent: "content-writer",
  });
  console.log(
    `    ${chalk.bold.yellow("DRAFT")}  ${chalk.bold("content-writer")}  ${chalk.dim("draft_id:")}${chalk.gray(narrativeDraftId)}`,
  );

  // strategist attunes — draft is NOT in the results.
  subheader("strategist attunes to saas-pricing → content-writer's draft is NOT visible");
  const strategistCheck = await field.attune({ agent: "strategist", topic: "saas-pricing" });
  const draftLeak = strategistCheck.find((e) => e.status === "draft");
  console.log(
    `    ${chalk.dim("draft visible to strategist:")} ${
      draftLeak ? chalk.bold.red("YES — leak!") : chalk.bold.green("NO — private ✓")
    }\n`,
  );

  // content-writer reads their own draft via caller option.
  subheader("content-writer reads their own draft via read(query, { caller })");
  const ownDrafts = await field.read({ topic: "saas-pricing" }, { caller: "content-writer" });
  const myDraft = ownDrafts.find((e) => e.status === "draft");
  if (myDraft) {
    console.log(
      `    ${chalk.bold.yellow("DRAFT")} (self-visible)  ${badge("epoch", myDraft.epoch, chalk.blue)}  ${chalk.italic.gray(myDraft.intent)}`,
    );
    console.log(`    ${chalk.dim("╰")}  ${chalk.dim(JSON.stringify(myDraft.entry))}\n`);
  }

  // content-writer commits — entry is now public.
  subheader("content-writer commits → entry promoted to committed");
  const commitResult = await field.commit({ draft_id: narrativeDraftId });
  console.log(
    `    ${chalk.bold.green("COMMIT")}  ${chalk.bold("content-writer")}  ${chalk.dim("id:")}${chalk.gray(commitResult.id)}  ${chalk.dim("epoch:")}${chalk.cyan(String(commitResult.epoch))}`,
  );
  const afterCommit = await field.read({ topic: "saas-pricing" });
  const promoted = afterCommit.find((e) => e.id === commitResult.id);
  console.log(
    `    ${chalk.dim("status after commit:")} ${chalk.bold.green(promoted?.status ?? "?")} ✓\n`,
  );

  // market-analyst drafts a follow-up, then discards it.
  subheader("market-analyst drafts a follow-up, then discards it");
  const { draft_id: followUpId } = await field.draft({
    entry: { topic: "saas-pricing", note: "draft follow-up — not ready" },
    intent: "exploring a follow-up note, may discard",
    agent: "market-analyst",
  });
  console.log(
    `    ${chalk.bold.yellow("DRAFT")}  ${chalk.bold("market-analyst")}  ${chalk.dim("draft_id:")}${chalk.gray(followUpId)}`,
  );
  await field.discard({ draft_id: followUpId, intent: "decided this note adds no new signal" });
  console.log(
    `    ${chalk.bold.red("DISCARD")}  ${chalk.bold("market-analyst")}  ${chalk.dim("reason: decided this note adds no new signal")}\n`,
  );

  // ── 6. RETRACT + SUPERSEDE ────────────────────────────────────────────────

  header("6 · RETRACT + SUPERSEDE — committed-entry lifecycle");

  // market-analyst retracts the per-seat pricing entry (stale data).
  subheader("market-analyst retracts the per-seat pricing entry");
  const perSeatEntry = await field.read({ topic: "saas-pricing", model: "per-seat" });
  const perSeatId = perSeatEntry[0]?.id ?? "";
  await field.retract({
    id: perSeatId,
    intent: "G2 per-seat data is now confirmed stale — withdrawing before writer uses it",
    agent: "market-analyst",
  });
  console.log(
    `    ${chalk.bold.red("RETRACT")}  ${chalk.bold("market-analyst")}  ${chalk.dim("id:")}${chalk.gray(perSeatId)}`,
  );

  // Verify: retracted entry no longer appears in content-writer's attune.
  const afterRetract = await field.attune({ agent: "content-writer", topic: "saas-pricing" });
  const leaked = afterRetract.find((e) => e.id === perSeatId);
  console.log(
    `    ${chalk.dim("retracted entry visible to content-writer:")} ${
      leaked ? chalk.bold.red("YES — leak!") : chalk.bold.green("NO — hidden ✓")
    }\n`,
  );

  // fact-checker supersedes the usage-based pricing entry with corrected figures.
  subheader("fact-checker supersedes the usage-based pricing entry");
  const usageBasedEntry = await field.read({ topic: "saas-pricing", model: "usage-based" });
  const usageBasedId = usageBasedEntry[0]?.id ?? "";
  const { id: supersederId } = await field.supersede({
    superseding_id: usageBasedId,
    entry: {
      topic: "saas-pricing",
      model: "usage-based",
      price: "$0.006/req",
      source: "stripe-verified",
    },
    intent:
      "corrected usage-based unit price after verifying Stripe's published rate card directly",
    agent: "fact-checker",
  });
  console.log(
    `    ${chalk.bold.yellow("SUPERSEDE")}  ${chalk.bold("fact-checker")}  ${chalk.dim("predecessor:")}${chalk.gray(usageBasedId)}`,
  );
  console.log(`    ${chalk.dim("new entry:")}  ${chalk.gray(supersederId)}\n`);

  // Verify: only the superseding entry appears; predecessor is gone.
  const afterSupersede = await field.attune({ agent: "content-writer", topic: "saas-pricing" });
  console.log(
    `    ${chalk.dim("entries visible after retract + supersede:")} ${chalk.bold.cyan(String(afterSupersede.length))} (was ${String(writerView.length)})`,
  );
  console.log(
    `    ${chalk.dim("prices visible:")} ${chalk.white(
      afterSupersede
        .map((e) => String(e.entry.price ?? e.entry.model ?? ""))
        .filter(Boolean)
        .join(", "),
    )}\n`,
  );

  // Supersession chain: strategist further supersedes the usage-based entry
  // by targeting the original id — chain resolves to the latest automatically.
  subheader("strategist extends the chain by superseding the original id again");
  const { id: chainLatestId } = await field.supersede({
    superseding_id: usageBasedId,
    entry: {
      topic: "saas-pricing",
      model: "usage-based",
      price: "$0.005/req",
      source: "internal-benchmark",
    },
    intent: "internal benchmark confirms even lower unit price than Stripe public rate card",
    agent: "strategist",
  });
  console.log(
    `    ${chalk.bold.yellow("SUPERSEDE")}  ${chalk.bold("strategist")}  ${chalk.dim("chain latest:")}${chalk.gray(chainLatestId)}\n`,
  );
  const chainView = await field.attune({ agent: "content-writer", topic: "saas-pricing" });
  const chainEntry = chainView.find((e) => e.id === chainLatestId);
  console.log(
    `    ${chalk.dim("chain latest price in attune:")} ${chalk.bold.green(String(chainEntry?.entry.price ?? ""))} ✓\n`,
  );

  // ── 7. role parameter ────────────────────────────────────────────────────────

  header("7 · role parameter — score without registration");

  subheader(
    "field.attune({ agent: 'guest-analyst', role: 'researcher', topic: 'saas-pricing' })\n" +
      "  guest-analyst is not registered but passes role explicitly\n" +
      "  → entries written by researcher-role agents get role boost",
  );

  const guestView = await field.attune({
    agent: "guest-analyst",
    role: "researcher",
    topic: "saas-pricing",
  });
  for (const e of guestView) printEntry(e);

  // ── 8. max_units ─────────────────────────────────────────────────────────────

  header("8 · max_units — cap on returned entries");

  subheader(
    "field.attune({ agent: 'content-writer', topic: 'saas-pricing', max_units: 2 })\n" +
      "  only the 2 most relevant entries are returned",
  );

  const capped = await field.attune({
    agent: "content-writer",
    topic: "saas-pricing",
    max_units: 2,
  });
  console.log(
    `    ${chalk.dim("total matching:")} ${chalk.white(String(writerView.length))}  →  ${chalk.dim("returned:")} ${chalk.bold.yellow(String(capped.length))}  ${chalk.dim("(lowest-relevance dropped)")}\n`,
  );
  for (const e of capped) printEntry(e);

  // ── 9. RECKON ────────────────────────────────────────────────────────────

  header("9 · RECKON — conflict-aware attune");

  // After all the writes, retracts, and supersessions in sections 2-6, let the
  // content-writer reckon on saas-pricing to see what's agreed, what conflicts.
  subheader(
    "field.reckon({ agent: 'content-writer', topic: 'saas-pricing' })\n" +
      "  same entries as attune, plus a conflict list across visible entries",
  );

  const reckonResult = await field.reckon({ agent: "content-writer", topic: "saas-pricing" });

  console.log(
    `    ${chalk.dim("visible entries:")} ${chalk.bold.cyan(String(reckonResult.entries.length))}   ` +
      `${chalk.dim("conflicts detected:")} ${reckonResult.conflicts.length > 0 ? chalk.bold.red(String(reckonResult.conflicts.length)) : chalk.bold.green("0")}\n`,
  );

  for (const e of reckonResult.entries) printEntry(e);

  if (reckonResult.conflicts.length > 0) {
    subheader(`${reckonResult.conflicts.length} conflict(s) detected:`);
    for (const c of reckonResult.conflicts) {
      const aTag = badge("agent", c.a.agent ?? "anon", chalk.magenta);
      const bTag = badge("agent", c.b.agent ?? "anon", chalk.magenta);
      const keysTag = chalk.bold.red(c.keys.join(", "));
      console.log(`    ${chalk.bold.red("✖ CONFLICT")}  keys: ${keysTag}`);
      console.log(`    ${chalk.dim("├")}  ${aTag}  ${chalk.dim(JSON.stringify(c.a.entry))}`);
      console.log(`    ${chalk.dim("└")}  ${bTag}  ${chalk.dim(JSON.stringify(c.b.entry))}\n`);
    }
  } else {
    console.log(
      `    ${chalk.bold.green("✓ No conflicts")}  all visible entries agree on shared keys\n`,
    );
  }

  // ── 10. Cross-role view ───────────────────────────────────────────────

  header("10 · Cross-role view — strategist reads the full field");

  subheader("field.attune({ agent: 'strategist' })  →  all entries except strategist's own");

  const strategistView = await field.attune({ agent: "strategist" });
  for (const e of strategistView) printEntry(e);

  // ── 11. DEREGISTER ──────────────────────────────────────────────────────────

  header("11 · DEREGISTER — session teardown");

  for (const { id } of agents) {
    await field.deregister({ id });
    console.log(`    ${chalk.bold.red("DEREGISTER")}  ${chalk.bold(id)}`);
  }

  // ── summary ──────────────────────────────────────────────────────────────────

  console.log(`\n${chalk.bold.cyan("━".repeat(62))}`);
  console.log(
    chalk.bold.green("\n  ✓ Showcase complete.\n") +
      chalk.dim("    Every operation crossed the message envelope.\n") +
      chalk.dim(
        "    Draft lifecycle, retract/supersede, reckon (conflict detection), relevance scoring, role matching, and max_units all active.\n",
      ),
  );
}

main().catch((err) => {
  console.error(chalk.bold.red("\n  ✖ Error:"), err);
  process.exit(1);
});
