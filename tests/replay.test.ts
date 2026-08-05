import { describe, expect, it } from "vitest";
import { createField } from "../src/index.js";
import { buildProjection } from "../src/projection.js";

const INTENT = "a sufficiently long intent for this test scenario";

describe("field.replay() — basic replay", () => {
  it("returns an empty array on an empty field", async () => {
    const field = createField();
    expect(await field.replay()).toEqual([]);
  });

  it("returns every event after several writes", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: INTENT });
    await field.write({ entry: { topic: "b" }, intent: INTENT });
    await field.write({ entry: { topic: "c" }, intent: INTENT });
    const events = await field.replay();
    expect(events).toHaveLength(3);
  });

  it("returns events in total order", async () => {
    const field = createField();
    await field.write({ entry: { n: 1 }, intent: INTENT });
    await field.write({ entry: { n: 2 }, intent: INTENT });
    await field.write({ entry: { n: 3 }, intent: INTENT });
    const events = await field.replay();
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2]);
  });

  it("returned events carry their assigned seq", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: INTENT });
    const events = await field.replay();
    expect(typeof events[0]?.seq).toBe("number");
    expect(events[0]?.seq).toBeGreaterThanOrEqual(0);
  });

  it("returned events carry v (event format version)", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: INTENT });
    const events = await field.replay();
    expect(events[0]?.v).toBe(1);
  });

  it("returns a copy — mutating the result does not affect the field", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: INTENT });
    const first = await field.replay();
    first.length = 0;
    const second = await field.replay();
    expect(second).toHaveLength(1);
  });
});

describe("field.replay() — event coverage", () => {
  it("a write produces one RECORD event", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: INTENT, agent: "alice" });
    const events = await field.replay();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("RECORD");
  });

  it("a register produces one REGISTER event", async () => {
    const field = createField();
    await field.register({ id: "alice", role: "researcher" });
    const events = await field.replay();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("REGISTER");
  });

  it("a retract produces one STATUS_CHANGE event", async () => {
    const field = createField();
    const { id } = await field.write({ entry: { topic: "a" }, intent: INTENT, agent: "alice" });
    await field.retract({ id, intent: INTENT, agent: "alice" });
    const events = await field.replay();
    expect(events).toHaveLength(2);
    expect(events[1]?.type).toBe("STATUS_CHANGE");
  });

  it("a supersede produces one STATUS_CHANGE and one RECORD, adjacent in the log", async () => {
    const field = createField();
    const { id } = await field.write({ entry: { topic: "a" }, intent: INTENT, agent: "alice" });
    await field.supersede({
      superseding_id: id,
      entry: { topic: "a", v: 2 },
      intent: INTENT,
      agent: "bob",
    });
    const events = await field.replay();
    expect(events).toHaveLength(3);
    expect(events[1]?.type).toBe("STATUS_CHANGE");
    expect(events[2]?.type).toBe("RECORD");
  });

  it("a commit of a draft produces a RECORD event", async () => {
    const field = createField();
    const { draft_id } = await field.draft({ entry: { topic: "a" }, intent: INTENT });
    await field.commit({ draft_id });
    const events = await field.replay();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("RECORD");
  });

  it("intent is present on every RECORD and STATUS_CHANGE event", async () => {
    const field = createField();
    const { id } = await field.write({ entry: { topic: "a" }, intent: INTENT, agent: "alice" });
    await field.retract({ id, intent: "withdrawing this for a documented reason", agent: "alice" });
    const events = await field.replay();
    for (const event of events) {
      if (event.type === "RECORD" || event.type === "STATUS_CHANGE") {
        expect(typeof event.intent).toBe("string");
        expect(event.intent.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("field.replay() — filtering", () => {
  it("replay({ agent }) returns only that agent's events", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: INTENT, agent: "alice" });
    await field.write({ entry: { topic: "b" }, intent: INTENT, agent: "bob" });
    const events = await field.replay({ agent: "alice" });
    expect(events).toHaveLength(1);
    expect(events[0]?.agent).toBe("alice");
  });

  it("replay({ topic }) returns only RECORD events on that topic", async () => {
    const field = createField();
    await field.write({ entry: { topic: "pricing" }, intent: INTENT });
    await field.write({ entry: { topic: "other" }, intent: INTENT });
    const events = await field.replay({ topic: "pricing" });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("RECORD");
  });

  it("replay({ topic }) excludes REGISTER events", async () => {
    const field = createField();
    await field.register({ id: "alice", role: "researcher" });
    await field.write({ entry: { topic: "pricing" }, intent: INTENT, agent: "alice" });
    const events = await field.replay({ topic: "pricing" });
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("RECORD");
  });

  it("replay({ sinceSeq }) returns only strictly later events", async () => {
    const field = createField();
    await field.write({ entry: { n: 1 }, intent: INTENT });
    await field.write({ entry: { n: 2 }, intent: INTENT });
    await field.write({ entry: { n: 3 }, intent: INTENT });
    const events = await field.replay({ sinceSeq: 0 });
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("replay({ untilSeq }) returns only events at or before that seq", async () => {
    const field = createField();
    await field.write({ entry: { n: 1 }, intent: INTENT });
    await field.write({ entry: { n: 2 }, intent: INTENT });
    await field.write({ entry: { n: 3 }, intent: INTENT });
    const events = await field.replay({ untilSeq: 1 });
    expect(events.map((e) => e.seq)).toEqual([0, 1]);
  });

  it("sinceSeq and untilSeq combine to bound a window", async () => {
    const field = createField();
    for (let i = 0; i < 5; i++) {
      await field.write({ entry: { n: i }, intent: INTENT });
    }
    const events = await field.replay({ sinceSeq: 0, untilSeq: 3 });
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it("filters combine with AND semantics", async () => {
    const field = createField();
    await field.write({ entry: { topic: "pricing" }, intent: INTENT, agent: "alice" });
    await field.write({ entry: { topic: "pricing" }, intent: INTENT, agent: "bob" });
    await field.write({ entry: { topic: "other" }, intent: INTENT, agent: "alice" });
    const events = await field.replay({ topic: "pricing", agent: "alice" });
    expect(events).toHaveLength(1);
    expect(events[0]?.agent).toBe("alice");
  });
});

describe("field.replay() — chain following", () => {
  it("on a never-superseded entry returns only its own events", async () => {
    const field = createField();
    const { id } = await field.write({ entry: { topic: "a" }, intent: INTENT, agent: "alice" });
    const events = await field.replay({ entry_id: id });
    expect(events).toHaveLength(1);
    expect(events[0]?.entry_id).toBe(id);
  });

  it("on a superseded entry includes its successor's events (forward walk)", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "a" },
      intent: INTENT,
      agent: "alice",
    });
    const { id: newId } = await field.supersede({
      superseding_id: originalId,
      entry: { topic: "a", v: 2 },
      intent: INTENT,
      agent: "bob",
    });
    const events = await field.replay({ entry_id: originalId });
    const ids = new Set(events.map((e) => e.entry_id));
    expect(ids.has(originalId)).toBe(true);
    expect(ids.has(newId)).toBe(true);
  });

  it("on a superseding entry includes its predecessor's events (backward walk)", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "a" },
      intent: INTENT,
      agent: "alice",
    });
    const { id: newId } = await field.supersede({
      superseding_id: originalId,
      entry: { topic: "a", v: 2 },
      intent: INTENT,
      agent: "bob",
    });
    const events = await field.replay({ entry_id: newId });
    const ids = new Set(events.map((e) => e.entry_id));
    expect(ids.has(originalId)).toBe(true);
    expect(ids.has(newId)).toBe(true);
  });

  it("a three-link chain returns all three entries' events from any starting point", async () => {
    const field = createField();
    const { id: id1 } = await field.write({
      entry: { topic: "a", v: 1 },
      intent: INTENT,
      agent: "alice",
    });
    const { id: id2 } = await field.supersede({
      superseding_id: id1,
      entry: { topic: "a", v: 2 },
      intent: INTENT,
      agent: "bob",
    });
    const { id: id3 } = await field.supersede({
      superseding_id: id1,
      entry: { topic: "a", v: 3 },
      intent: INTENT,
      agent: "carol",
    });

    for (const startId of [id1, id2, id3]) {
      const events = await field.replay({ entry_id: startId });
      const ids = new Set(events.map((e) => e.entry_id));
      expect(ids.has(id1)).toBe(true);
      expect(ids.has(id2)).toBe(true);
      expect(ids.has(id3)).toBe(true);
    }
  });

  it("replay({ entry_id, followChain: false }) returns only the literal entry's events", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "a" },
      intent: INTENT,
      agent: "alice",
    });
    const { id: newId } = await field.supersede({
      superseding_id: originalId,
      entry: { topic: "a", v: 2 },
      intent: INTENT,
      agent: "bob",
    });
    const events = await field.replay({ entry_id: originalId, followChain: false });
    expect(events.every((e) => e.entry_id === originalId)).toBe(true);
    expect(events.some((e) => e.entry_id === newId)).toBe(false);
  });

  it("chain following includes STATUS_CHANGE events for every entry in the chain", async () => {
    const field = createField();
    const { id: id1 } = await field.write({
      entry: { topic: "a" },
      intent: INTENT,
      agent: "alice",
    });
    const { id: id2 } = await field.supersede({
      superseding_id: id1,
      entry: { topic: "a", v: 2 },
      intent: INTENT,
      agent: "bob",
    });
    await field.retract({
      id: id2,
      intent: "retracting the current entry for this test",
      agent: "bob",
    });
    const events = await field.replay({ entry_id: id1 });
    const statusChanges = events.filter((e) => e.type === "STATUS_CHANGE");
    // one STATUS_CHANGE marking id1 superseded, one marking id2 retracted
    expect(statusChanges).toHaveLength(2);
  });

  it("chain resolution is unaffected by the presence of unrelated entries", async () => {
    const field = createField();
    await field.write({ entry: { topic: "unrelated" }, intent: INTENT, agent: "zed" });
    const { id: id1 } = await field.write({
      entry: { topic: "a" },
      intent: INTENT,
      agent: "alice",
    });
    await field.write({ entry: { topic: "also-unrelated" }, intent: INTENT, agent: "yara" });
    const { id: id2 } = await field.supersede({
      superseding_id: id1,
      entry: { topic: "a", v: 2 },
      intent: INTENT,
      agent: "bob",
    });
    const events = await field.replay({ entry_id: id1 });
    const ids = new Set(events.map((e) => e.entry_id));
    expect(ids).toEqual(new Set([id1, id2]));
  });
});

describe("field.replay() — reasoning chain reconstruction", () => {
  it("replaying a superseded chain yields the ordered sequence of intents", async () => {
    const field = createField();
    const { id: originalId } = await field.write({
      entry: { topic: "pricing", price: "$29" },
      intent: "initial pricing observation from the g2 listing",
      agent: "researcher",
    });
    await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", price: "$39" },
      intent: "correcting the price after a direct source check",
      agent: "fact-checker",
    });
    await field.supersede({
      superseding_id: originalId,
      entry: { topic: "pricing", price: "$49" },
      intent: "updating again after the vendor changed published pricing",
      agent: "strategist",
    });

    const events = await field.replay({ entry_id: originalId });
    const intents = events
      .filter((e) => e.type === "RECORD" || e.type === "STATUS_CHANGE")
      .map((e) => e.intent);

    // The second supersede's chain resolution targets the FIRST supersede's
    // new entry (chain-follow walks to the current latest), so the log reads
    // as a linear chain: original -> first correction -> second correction.
    expect(intents).toEqual([
      "initial pricing observation from the g2 listing",
      "correcting the price after a direct source check",
      "correcting the price after a direct source check",
      "updating again after the vendor changed published pricing",
      "updating again after the vendor changed published pricing",
    ]);
  });
});

describe("field.replay() — composability", () => {
  it("buildProjection(await field.replay()) reproduces the field's current visible state", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: INTENT, agent: "alice" });
    const { id } = await field.write({ entry: { topic: "b" }, intent: INTENT, agent: "bob" });
    await field.retract({ id, intent: "retracting entry b for this test scenario", agent: "bob" });

    const events = await field.replay();
    const rebuilt = buildProjection(events);
    const live = await field.read();

    expect(rebuilt.entries.size).toBe(live.length);
    for (const entry of live) {
      expect(rebuilt.entries.get(entry.id)).toEqual(entry);
    }
  });
});
