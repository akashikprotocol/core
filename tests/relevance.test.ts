import { describe, expect, it } from "vitest";
import { computeRelevance } from "../src/relevance.js";
import type { AttuneContext, FieldEntry, Session } from "../src/types.js";

const makeEntry = (overrides: Partial<FieldEntry> = {}): FieldEntry => ({
  id: "01HK000000000000000000000A",
  timestamp: 1000,
  epoch: 0,
  agent: "writer",
  status: "committed",
  entry: { topic: "pricing" },
  intent: "writing entry for relevance test",
  ...overrides,
});

const makeSession = (id: string, role: string): Session => ({
  id,
  role,
  capabilities: [],
  registered_at: 1000,
});

describe("computeRelevance — topic match component", () => {
  it("contributes 0.6 when topic matches exactly", () => {
    const entry = makeEntry({ entry: { topic: "pricing" } });
    const ctx: AttuneContext = { agent: "caller", topic: "pricing" };
    const { reason } = computeRelevance(entry, ctx, {
      visibleEntries: [entry],
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.topic).toBe(0.6);
  });

  it("contributes 0 when topic differs", () => {
    const entry = makeEntry({ entry: { topic: "pricing" } });
    const ctx: AttuneContext = { agent: "caller", topic: "research" };
    const { reason } = computeRelevance(entry, ctx, {
      visibleEntries: [entry],
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.topic).toBe(0);
  });

  it("contributes 0 when no topic in context", () => {
    const entry = makeEntry({ entry: { topic: "pricing" } });
    const ctx: AttuneContext = { agent: "caller" };
    const { reason } = computeRelevance(entry, ctx, {
      visibleEntries: [entry],
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.topic).toBe(0);
  });

  it("uses strict equality — string matches string", () => {
    const entry = makeEntry({ entry: { topic: "5" } });
    const ctx: AttuneContext = { agent: "caller", topic: "5" };
    const { reason } = computeRelevance(entry, ctx, {
      visibleEntries: [entry],
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.topic).toBe(0.6);
  });

  it("uses strict equality — number does not match string", () => {
    const entry = makeEntry({ entry: { topic: 5 } });
    const ctx: AttuneContext = { agent: "caller", topic: "5" };
    const { reason } = computeRelevance(entry, ctx, {
      visibleEntries: [entry],
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.topic).toBe(0);
  });
});

describe("computeRelevance — role match component", () => {
  it("contributes 0.2 when both sessions have the same role", () => {
    const entry = makeEntry({ agent: "researcher-1" });
    const writerSession = makeSession("researcher-1", "researcher");
    const callerSession = makeSession("researcher-2", "researcher");
    const { reason } = computeRelevance(
      entry,
      { agent: "researcher-2" },
      {
        visibleEntries: [entry],
        writerSession,
        callerSession,
      },
    );
    expect(reason.components.role).toBe(0.2);
  });

  it("contributes 0 when roles differ", () => {
    const entry = makeEntry({ agent: "researcher-1" });
    const writerSession = makeSession("researcher-1", "researcher");
    const callerSession = makeSession("writer-1", "writer");
    const { reason } = computeRelevance(
      entry,
      { agent: "writer-1" },
      {
        visibleEntries: [entry],
        writerSession,
        callerSession,
      },
    );
    expect(reason.components.role).toBe(0);
  });

  it("contributes 0 when writer has no session", () => {
    const entry = makeEntry({ agent: "researcher-1" });
    const callerSession = makeSession("caller", "researcher");
    const { reason } = computeRelevance(
      entry,
      { agent: "caller" },
      {
        visibleEntries: [entry],
        writerSession: null,
        callerSession,
      },
    );
    expect(reason.components.role).toBe(0);
  });

  it("contributes 0 when caller has no session", () => {
    const entry = makeEntry({ agent: "researcher-1" });
    const writerSession = makeSession("researcher-1", "researcher");
    const { reason } = computeRelevance(
      entry,
      { agent: "caller" },
      {
        visibleEntries: [entry],
        writerSession,
        callerSession: null,
      },
    );
    expect(reason.components.role).toBe(0);
  });
});

describe("computeRelevance — recency component", () => {
  it("contributes 0.15 to the newest entry", () => {
    const entries = [makeEntry({ epoch: 0 }), makeEntry({ epoch: 5 }), makeEntry({ epoch: 10 })];
    const newest = entries[2] ?? makeEntry({ epoch: 10 });
    const ctx: AttuneContext = { agent: "caller" };
    const { reason } = computeRelevance(newest, ctx, {
      visibleEntries: entries,
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.recency).toBeCloseTo(0.15, 5);
  });

  it("contributes 0 to the oldest entry in a multi-entry set", () => {
    const entries = [makeEntry({ epoch: 0 }), makeEntry({ epoch: 5 }), makeEntry({ epoch: 10 })];
    const oldest = entries[0] ?? makeEntry({ epoch: 0 });
    const ctx: AttuneContext = { agent: "caller" };
    const { reason } = computeRelevance(oldest, ctx, {
      visibleEntries: entries,
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.recency).toBeCloseTo(0, 5);
  });

  it("contributes 0.15 when there is only one entry (single entry = newest)", () => {
    const entry = makeEntry({ epoch: 47 });
    const ctx: AttuneContext = { agent: "caller" };
    const { reason } = computeRelevance(entry, ctx, {
      visibleEntries: [entry],
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.recency).toBeCloseTo(0.15, 5);
  });

  it("normalises by epoch spread, not absolute epoch values", () => {
    const entriesLow = [makeEntry({ epoch: 0 }), makeEntry({ epoch: 5 })];
    const entriesHigh = [makeEntry({ epoch: 1000 }), makeEntry({ epoch: 1005 })];
    const ctx: AttuneContext = { agent: "caller" };

    const newestLow = entriesLow[1] ?? makeEntry({ epoch: 5 });
    const newestHigh = entriesHigh[1] ?? makeEntry({ epoch: 1005 });

    const { reason: r1 } = computeRelevance(newestLow, ctx, {
      visibleEntries: entriesLow,
      writerSession: null,
      callerSession: null,
    });
    const { reason: r2 } = computeRelevance(newestHigh, ctx, {
      visibleEntries: entriesHigh,
      writerSession: null,
      callerSession: null,
    });
    expect(r1.components.recency).toBeCloseTo(r2.components.recency, 5);
  });
});

describe("computeRelevance — intent quality component", () => {
  it("contributes 0.05 when intent length >= 50", () => {
    const entry = makeEntry({ intent: "a".repeat(50) });
    const ctx: AttuneContext = { agent: "caller" };
    const { reason } = computeRelevance(entry, ctx, {
      visibleEntries: [entry],
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.intent).toBe(0.05);
  });

  it("contributes 0 when intent length < 50", () => {
    const entry = makeEntry({ intent: "a".repeat(49) });
    const ctx: AttuneContext = { agent: "caller" };
    const { reason } = computeRelevance(entry, ctx, {
      visibleEntries: [entry],
      writerSession: null,
      callerSession: null,
    });
    expect(reason.components.intent).toBe(0);
  });

  it("boundary: exactly 50 characters scores 0.05", () => {
    const entry = makeEntry({ intent: "a".repeat(50) });
    const { reason } = computeRelevance(
      entry,
      { agent: "caller" },
      {
        visibleEntries: [entry],
        writerSession: null,
        callerSession: null,
      },
    );
    expect(reason.components.intent).toBe(0.05);
  });
});

describe("computeRelevance — composition", () => {
  it("score equals sum of components (within float tolerance)", () => {
    const entry = makeEntry({ entry: { topic: "x" }, epoch: 5, intent: "a".repeat(50) });
    const writerSession = makeSession("writer", "researcher");
    const callerSession = makeSession("caller", "researcher");
    const { score, reason } = computeRelevance(
      entry,
      { agent: "caller", topic: "x" },
      {
        visibleEntries: [entry],
        writerSession,
        callerSession,
      },
    );
    const expected =
      reason.components.topic +
      reason.components.role +
      reason.components.recency +
      reason.components.intent;
    expect(score).toBeCloseTo(expected, 5);
  });

  it("score is clamped to 1.0", () => {
    const entry = makeEntry({ entry: { topic: "x" }, epoch: 0, intent: "a".repeat(50) });
    const writerSession = makeSession("writer", "r");
    const callerSession = makeSession("caller", "r");
    const { score } = computeRelevance(
      entry,
      { agent: "caller", topic: "x" },
      {
        visibleEntries: [entry],
        writerSession,
        callerSession,
      },
    );
    expect(score).toBeLessThanOrEqual(1.0);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("summary describes each contributing component", () => {
    const entry = makeEntry({ entry: { topic: "x" }, intent: "a".repeat(50) });
    const { reason } = computeRelevance(
      entry,
      { agent: "caller", topic: "x" },
      {
        visibleEntries: [entry],
        writerSession: null,
        callerSession: null,
      },
    );
    expect(reason.summary).toContain("topic match");
    expect(reason.summary).toContain("intent substantive");
  });

  it("summary handles the zero-relevance case gracefully", () => {
    // oldest entry in a 2-entry set, no topic match, no sessions, short intent → score=0
    const oldest = makeEntry({ epoch: 0, intent: "short" });
    const newest = makeEntry({ epoch: 10, intent: "short" });
    const { reason } = computeRelevance(
      oldest,
      { agent: "caller", topic: "other" },
      {
        visibleEntries: [oldest, newest],
        writerSession: null,
        callerSession: null,
      },
    );
    expect(reason.summary).toBe("no relevance signals matched");
  });

  it("summary includes role match fragment when role contributes", () => {
    const entry = makeEntry({ agent: "w" });
    const writerSession = makeSession("w", "researcher");
    const callerSession = makeSession("c", "researcher");
    const { reason } = computeRelevance(
      entry,
      { agent: "c" },
      {
        visibleEntries: [entry],
        writerSession,
        callerSession,
      },
    );
    expect(reason.summary).toContain("role match");
  });
});
