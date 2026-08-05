import { describe, expect, it } from "vitest";
import { createMemoryAdapter } from "../src/adapters/memory.js";
import { createField } from "../src/index.js";

const INTENT = "a sufficiently long intent for this test scenario";

// Epoch numbering starts at 0 and since_epoch must be non-negative, so there
// is no numeric watermark value that means "everything from the start" — a
// real poller's first call omits since_epoch entirely, exactly as the DoD's
// own manual smoke test does ("attune with no watermark, note the highest
// epoch"). Below, `watermark` starts `undefined` and `since_epoch: watermark`
// is passed through as-is: an explicit `undefined` behaves identically to an
// omitted key for both validation and the filter.

describe("since_epoch — basic filtering", () => {
  it("attune without since_epoch returns all visible entries (unchanged behaviour)", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "bob" });
    const result = await field.attune({ agent: "writer", topic: "x" });
    expect(result).toHaveLength(2);
  });

  it("since_epoch above the highest epoch returns an empty array", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    const result = await field.attune({ agent: "writer", topic: "x", since_epoch: 999 });
    expect(result).toEqual([]);
  });

  it("since_epoch at the highest epoch returns an empty array (strictly greater)", async () => {
    const field = createField();
    const { id: _id } = await field.write({
      entry: { topic: "x" },
      intent: INTENT,
      agent: "alice",
    });
    const all = await field.read();
    const highest = all[0]?.epoch as number;
    const result = await field.attune({ agent: "writer", topic: "x", since_epoch: highest });
    expect(result).toEqual([]);
  });

  it("since_epoch mid-range returns only later entries", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "alice" });
    const { id: midId } = await field.write({
      entry: { topic: "x", n: 2 },
      intent: INTENT,
      agent: "bob",
    });
    await field.write({ entry: { topic: "x", n: 3 }, intent: INTENT, agent: "carol" });

    const all = await field.read();
    const midEpoch = all.find((e) => e.id === midId)?.epoch as number;
    const result = await field.attune({ agent: "writer", topic: "x", since_epoch: midEpoch });
    expect(result).toHaveLength(1);
    expect((result[0]?.entry as { n: number }).n).toBe(3);
  });

  it("since_epoch at the lowest epoch present excludes exactly that entry", async () => {
    // Epoch numbering starts at 0, so passing the lowest epoch present
    // excludes that one entry (strictly-greater), not "everything" — there
    // is no valid since_epoch value below 0 to request the full set with a
    // watermark; omitting since_epoch is how a caller gets everything.
    const field = createField();
    const { id: firstId } = await field.write({
      entry: { topic: "x", n: 1 },
      intent: INTENT,
      agent: "alice",
    });
    await field.write({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "bob" });

    const all = await field.read();
    const firstEpoch = all.find((e) => e.id === firstId)?.epoch as number;
    const result = await field.attune({ agent: "writer", topic: "x", since_epoch: firstEpoch });
    expect(result).toHaveLength(1);
    expect((result[0]?.entry as { n: number }).n).toBe(2);
  });

  it("filtering is strictly greater than, never greater-or-equal", async () => {
    const field = createField();
    // Two writes so the second one's epoch-1 is still non-negative (epoch
    // numbering starts at 0, so the very first entry has no valid "one
    // below" value to probe with).
    await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    const { id } = await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "bob" });
    const all = await field.read();
    const epoch = all.find((e) => e.id === id)?.epoch as number;

    const atEpoch = await field.attune({ agent: "writer", topic: "x", since_epoch: epoch });
    const belowEpoch = await field.attune({ agent: "writer", topic: "x", since_epoch: epoch - 1 });
    expect(atEpoch).toHaveLength(0);
    expect(belowEpoch).toHaveLength(1);
  });
});

describe("since_epoch — watermark pattern", () => {
  it("poll, write, poll again — the second poll returns only the new entry", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "alice" });

    let watermark: number | undefined;
    const firstPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(firstPoll).toHaveLength(1);
    for (const e of firstPoll) watermark = Math.max(watermark ?? -1, e.epoch);

    await field.write({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "bob" });

    const secondPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(secondPoll).toHaveLength(1);
    expect((secondPoll[0]?.entry as { n: number }).n).toBe(2);
  });

  it("poll, write nothing, poll again — the second poll is empty", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });

    let watermark: number | undefined;
    const firstPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(firstPoll).toHaveLength(1);
    for (const e of firstPoll) watermark = Math.max(watermark ?? -1, e.epoch);

    const secondPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(secondPoll).toEqual([]);
  });

  it("watermark derived from results correctly excludes already-seen entries across three rounds", async () => {
    const field = createField();
    let watermark: number | undefined;
    const seen: number[] = [];

    for (let round = 1; round <= 3; round++) {
      await field.write({ entry: { topic: "x", round }, intent: INTENT, agent: `agent-${round}` });
      const poll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
      expect(poll).toHaveLength(1);
      expect((poll[0]?.entry as { round: number }).round).toBe(round);
      seen.push(round);
      for (const e of poll) watermark = Math.max(watermark ?? -1, e.epoch);
    }

    expect(seen).toEqual([1, 2, 3]);
  });

  it("an empty result leaves the caller's watermark usable for the next poll", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "alice" });

    let watermark: number | undefined;
    const firstPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(firstPoll).toHaveLength(1);
    for (const e of firstPoll) watermark = Math.max(watermark ?? -1, e.epoch);

    const emptyPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(emptyPoll).toEqual([]);
    // watermark unchanged after an empty poll — no entries to advance it with.

    await field.write({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "bob" });
    const nextPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(nextPoll).toHaveLength(1);
    expect((nextPoll[0]?.entry as { n: number }).n).toBe(2);
  });

  it("a supersession appears in the next poll as a new entry", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "x", price: 29 },
      intent: INTENT,
      agent: "alice",
    });

    let watermark: number | undefined;
    const firstPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(firstPoll).toHaveLength(1);
    for (const e of firstPoll) watermark = Math.max(watermark ?? -1, e.epoch);

    await field.supersede({
      superseding_id: id,
      entry: { topic: "x", price: 39 },
      intent: INTENT,
      agent: "bob",
    });

    const secondPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(secondPoll).toHaveLength(1);
    expect((secondPoll[0]?.entry as { price: number }).price).toBe(39);
  });

  it("a retraction does NOT appear in the next poll (documented limitation)", async () => {
    const field = createField();
    const { id } = await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });

    let watermark: number | undefined;
    const firstPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(firstPoll).toHaveLength(1);
    for (const e of firstPoll) watermark = Math.max(watermark ?? -1, e.epoch);

    await field.retract({
      id,
      intent: "withdrawing this observation for the test",
      agent: "alice",
    });

    const secondPoll = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(secondPoll).toEqual([]);
  });
});

describe("since_epoch — interaction with other filters", () => {
  it("combines with topic", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    const all = await field.read();
    const firstEpoch = all[0]?.epoch as number;

    await field.write({ entry: { topic: "y" }, intent: INTENT, agent: "bob" });
    await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "carol" });

    const result = await field.attune({ agent: "writer", topic: "x", since_epoch: firstEpoch });
    expect(result).toHaveLength(1);
    expect((result[0]?.entry as { topic: string }).topic).toBe("x");
  });

  it("combines with the self-exclusion visibility rule", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "alice" });
    const all = await field.read();
    const firstEpoch = all[0]?.epoch as number;
    await field.write({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "alice" });

    // alice polls her own topic; her own entries are always excluded.
    const result = await field.attune({ agent: "alice", topic: "x", since_epoch: firstEpoch });
    expect(result).toEqual([]);
  });

  it("combines with max_units", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x", n: 0 }, intent: INTENT, agent: "zero" });
    const all = await field.read();
    const watermark = all[0]?.epoch as number;

    for (let i = 1; i <= 5; i++) {
      await field.write({ entry: { topic: "x", n: i }, intent: INTENT, agent: `agent-${i}` });
    }

    const result = await field.attune({
      agent: "writer",
      topic: "x",
      since_epoch: watermark,
      max_units: 2,
    });
    expect(result).toHaveLength(2);
  });

  it("excludes retracted entries as usual", async () => {
    const field = createField();
    const { id } = await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    await field.retract({
      id,
      intent: "withdrawing this observation for the test",
      agent: "alice",
    });
    const result = await field.attune({ agent: "writer", topic: "x", since_epoch: 0 });
    expect(result).toEqual([]);
  });

  it("excludes superseded predecessors as usual", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "x", price: 29 },
      intent: INTENT,
      agent: "alice",
    });
    await field.supersede({
      superseding_id: id,
      entry: { topic: "x", price: 39 },
      intent: INTENT,
      agent: "bob",
    });
    const result = await field.attune({ agent: "writer", topic: "x", since_epoch: 0 });
    expect(result).toHaveLength(1);
    expect((result[0]?.entry as { price: number }).price).toBe(39);
  });

  it("caller's own drafts respect since_epoch", async () => {
    const field = createField();
    await field.draft({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "alice" });
    const drafts1 = await field.read(undefined, { caller: "alice" });
    const firstDraftEpoch = drafts1[0]?.epoch as number;

    await field.draft({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "alice" });

    const result = await field.attune({ agent: "alice", topic: "x", since_epoch: firstDraftEpoch });
    const draftsInResult = result.filter((e) => e.status === "draft");
    expect(draftsInResult).toHaveLength(1);
    expect((draftsInResult[0]?.entry as { n: number }).n).toBe(2);
  });
});

describe("since_epoch — reckon", () => {
  it("reckon({ since_epoch }) filters entries identically to attune", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "alice" });
    const all = await field.read();
    const watermark = all[0]?.epoch as number;
    await field.write({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "bob" });

    const attuned = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    const reckoned = await field.reckon({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(reckoned.entries.map((e) => e.id)).toEqual(attuned.map((e) => e.id));
  });

  it("reckon({ since_epoch }) detects conflicts only among surviving entries", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: 49 },
      intent: "researcher's pricing observation from g2",
      agent: "researcher",
    });
    const all = await field.read();
    const watermark = all[0]?.epoch as number;

    await field.write({
      entry: { topic: "pricing", price: 39 },
      intent: "fact-checker's correction after verifying the source",
      agent: "fact-checker",
    });
    await field.write({
      entry: { topic: "pricing", price: 59 },
      intent: "strategist's independent estimate for comparison",
      agent: "strategist",
    });

    const result = await field.reckon({
      agent: "writer",
      topic: "pricing",
      since_epoch: watermark,
    });
    expect(result.entries).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(
      result.conflicts[0]?.a.agent === "fact-checker" ||
        result.conflicts[0]?.b.agent === "fact-checker",
    ).toBe(true);
  });

  it("a conflict between a filtered-out entry and a surviving one is not surfaced", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: 49 },
      intent: "researcher's pricing observation from g2",
      agent: "researcher",
    });
    const all = await field.read();
    const watermark = all[0]?.epoch as number;

    // fact-checker's later entry conflicts with researcher's (filtered-out) entry.
    await field.write({
      entry: { topic: "pricing", price: 39 },
      intent: "fact-checker's correction after verifying the source",
      agent: "fact-checker",
    });

    const noWatermark = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(noWatermark.conflicts).toHaveLength(1);

    const withWatermark = await field.reckon({
      agent: "writer",
      topic: "pricing",
      since_epoch: watermark,
    });
    expect(withWatermark.entries).toHaveLength(1);
    expect(withWatermark.conflicts).toHaveLength(0);
  });
});

describe("since_epoch — validation", () => {
  it("negative since_epoch throws INVALID_QUERY", async () => {
    const field = createField();
    await expect(field.attune({ agent: "writer", since_epoch: -1 })).rejects.toMatchObject({
      code: "INVALID_QUERY",
    });
  });

  it("non-integer since_epoch throws INVALID_QUERY", async () => {
    const field = createField();
    await expect(field.attune({ agent: "writer", since_epoch: 1.5 })).rejects.toMatchObject({
      code: "INVALID_QUERY",
    });
  });

  it("NaN throws INVALID_QUERY", async () => {
    const field = createField();
    await expect(field.attune({ agent: "writer", since_epoch: Number.NaN })).rejects.toMatchObject({
      code: "INVALID_QUERY",
    });
  });

  it("Infinity throws INVALID_QUERY", async () => {
    const field = createField();
    await expect(
      field.attune({ agent: "writer", since_epoch: Number.POSITIVE_INFINITY }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("string since_epoch throws INVALID_QUERY", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally wrong type
      field.attune({ agent: "writer", since_epoch: "5" }),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });
});

describe("since_epoch — multi-process", () => {
  it("two fields sharing one adapter: field B polls and sees field A's writes after its watermark", async () => {
    const adapter = createMemoryAdapter();
    const fieldA = createField({ adapter });
    const fieldB = createField({ adapter });

    await fieldA.write({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "alice" });

    let watermark: number | undefined;
    const firstPoll = await fieldB.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(firstPoll).toHaveLength(1);
    for (const e of firstPoll) watermark = Math.max(watermark ?? -1, e.epoch);

    await fieldA.write({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "alice" });

    const secondPoll = await fieldB.attune({ agent: "writer", topic: "x", since_epoch: watermark });
    expect(secondPoll).toHaveLength(1);
    expect((secondPoll[0]?.entry as { n: number }).n).toBe(2);
  });
});
