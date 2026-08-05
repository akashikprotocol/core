import { describe, expect, it } from "vitest";
import { createMemoryAdapter } from "../src/adapters/memory.js";
import { recordEvent } from "../src/events.js";
import { createField } from "../src/index.js";

const INTENT = "a sufficiently long intent for this test scenario";

/** Simulates two processes: two Field instances sharing one adapter. */
function twoFields() {
  const adapter = createMemoryAdapter();
  return { adapter, fieldA: createField({ adapter }), fieldB: createField({ adapter }) };
}

describe("multi-process — two Fields sharing one adapter", () => {
  it("both fields see each other's writes after any read", async () => {
    const { fieldA, fieldB } = twoFields();
    await fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    await fieldB.write({ entry: { topic: "x" }, intent: INTENT, agent: "bob" });

    const seenByA = await fieldA.read();
    const seenByB = await fieldB.read();
    expect(seenByA).toHaveLength(2);
    expect(seenByB).toHaveLength(2);
  });

  it("a write by B after reading A's events has a strictly higher lamport than A's", async () => {
    const { fieldA, fieldB } = twoFields();
    const { id } = await fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    await fieldB.read(); // B observes A's event first
    const { id: idB } = await fieldB.write({ entry: { topic: "y" }, intent: INTENT, agent: "bob" });

    const events = await fieldA.replay();
    const aLamport = events.find((e) => e.entry_id === id)?.lamport as number;
    const bLamport = events.find((e) => e.entry_id === idB)?.lamport as number;
    expect(bLamport).toBeGreaterThan(aLamport);
  });

  it("field B's clock advances past field A's events when B reads", async () => {
    const { fieldA, fieldB } = twoFields();
    // A writes five times, advancing far past B's untouched clock.
    for (let i = 0; i < 5; i++) {
      await fieldA.write({ entry: { n: i }, intent: INTENT, agent: "alice" });
    }
    await fieldB.read(); // B's clock must observe(4) here
    const { id: idB } = await fieldB.write({ entry: { topic: "y" }, intent: INTENT, agent: "bob" });

    const events = await fieldB.replay();
    const bEvent = events.find((e) => e.entry_id === idB);
    expect(bEvent?.lamport).toBeGreaterThan(4);
  });

  it("concurrent writes (both write before either reads) can produce equal lamport values", async () => {
    const { fieldA, fieldB } = twoFields();
    await Promise.all([
      fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" }),
      fieldB.write({ entry: { topic: "x" }, intent: INTENT, agent: "bob" }),
    ]);
    const events = await fieldA.replay();
    expect(events).toHaveLength(2);
    expect(events[0]?.lamport).toBe(events[1]?.lamport);
  });

  it("after concurrent writes, BOTH fields' own reads see both entries (not just the initiating field)", async () => {
    // Regression: a field must not advance past a gap left by a concurrently
    // appended event it hasn't read yet. If field B appends its own event at
    // a higher seq than field A's not-yet-observed event, and B jumps its
    // catch-up marker straight to its own seq, A's event is permanently
    // skipped on every later read from B — not just delayed.
    const { fieldA, fieldB } = twoFields();
    await Promise.all([
      fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" }),
      fieldB.write({ entry: { topic: "x" }, intent: INTENT, agent: "bob" }),
    ]);

    const seenByA = await fieldA.read();
    const seenByB = await fieldB.read();
    expect(seenByA).toHaveLength(2);
    expect(seenByB).toHaveLength(2);

    // Not just eventually — a second read from B must not still be missing it.
    const seenByBAgain = await fieldB.read();
    expect(seenByBAgain).toHaveLength(2);
  });

  it("concurrent events with equal lamport are ordered by agent id, identically from both fields", async () => {
    const { adapter, fieldA, fieldB } = twoFields();
    // Force a tie: two RECORD events at the same lamport, appended in an
    // order that does NOT match agent-lexicographic order, so the assertion
    // proves the tiebreaker (not append order) decides.
    const late = recordEvent({
      lamport: 0,
      agent: "zeta",
      entry_id: "entry-zeta",
      entry: { topic: "x" },
      intent: INTENT,
    });
    const early = recordEvent({
      lamport: 0,
      agent: "alpha",
      entry_id: "entry-alpha",
      entry: { topic: "x" },
      intent: INTENT,
    });
    // Append zeta first, alpha second — the reverse of alphabetical order.
    await adapter.append([late, early]);

    const eventsFromA = await fieldA.replay();
    const eventsFromB = await fieldB.replay();
    expect(eventsFromA.map((e) => e.agent)).toEqual(["alpha", "zeta"]);
    expect(eventsFromA.map((e) => e.agent)).toEqual(eventsFromB.map((e) => e.agent));
  });

  it("both fields compute the same total order over the same event set", async () => {
    const { fieldA, fieldB } = twoFields();
    await fieldA.write({ entry: { n: 1 }, intent: INTENT, agent: "alice" });
    await fieldB.write({ entry: { n: 2 }, intent: INTENT, agent: "bob" });
    await fieldA.write({ entry: { n: 3 }, intent: INTENT, agent: "alice" });
    await fieldB.write({ entry: { n: 4 }, intent: INTENT, agent: "bob" });

    const eventsFromA = await fieldA.replay();
    const eventsFromB = await fieldB.replay();
    expect(eventsFromA.map((e) => e.event_id)).toEqual(eventsFromB.map((e) => e.event_id));
  });

  it("causal chain across fields: lamports strictly increase A, B, A", async () => {
    const { fieldA, fieldB } = twoFields();
    const { id: idA1 } = await fieldA.write({ entry: { n: 1 }, intent: INTENT, agent: "alice" });
    await fieldB.read();
    const { id: idB1 } = await fieldB.write({ entry: { n: 2 }, intent: INTENT, agent: "bob" });
    await fieldA.read();
    const { id: idA2 } = await fieldA.write({ entry: { n: 3 }, intent: INTENT, agent: "alice" });

    const events = await fieldA.replay();
    const lamportOf = (id: string) => events.find((e) => e.entry_id === id)?.lamport as number;
    expect(lamportOf(idA1)).toBeLessThan(lamportOf(idB1));
    expect(lamportOf(idB1)).toBeLessThan(lamportOf(idA2));
  });

  it("a supersession performed by B on an entry written by A resolves correctly in both fields", async () => {
    const { fieldA, fieldB } = twoFields();
    const { id } = await fieldA.write({
      entry: { topic: "pricing", price: "$29" },
      intent: INTENT,
      agent: "alice",
    });
    await fieldB.read();
    await fieldB.supersede({
      superseding_id: id,
      entry: { topic: "pricing", price: "$39" },
      intent: INTENT,
      agent: "bob",
    });

    const resultA = await fieldA.attune({ agent: "viewer", topic: "pricing" });
    const resultB = await fieldB.attune({ agent: "viewer", topic: "pricing" });
    expect(resultA).toHaveLength(1);
    expect(resultB).toHaveLength(1);
    expect(resultA[0]?.entry.price).toBe("$39");
    expect(resultB[0]?.entry.price).toBe("$39");
  });

  it("replay() from A and from B return identically-ordered event lists", async () => {
    const { fieldA, fieldB } = twoFields();
    const { id } = await fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    await fieldB.read();
    await fieldB.supersede({
      superseding_id: id,
      entry: { topic: "x", v: 2 },
      intent: INTENT,
      agent: "bob",
    });

    const eventsFromA = await fieldA.replay();
    const eventsFromB = await fieldB.replay();
    expect(
      eventsFromA.map((e) => ({ type: e.type, entry_id: e.entry_id, lamport: e.lamport })),
    ).toEqual(eventsFromB.map((e) => ({ type: e.type, entry_id: e.entry_id, lamport: e.lamport })));
  });

  it("both fields' projections converge to the same visible state after both catch up", async () => {
    const { fieldA, fieldB } = twoFields();
    await fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    const { id } = await fieldB.write({ entry: { topic: "y" }, intent: INTENT, agent: "bob" });
    // A retracts B's entry cross-field; agent must match the original author.
    await fieldA.retract({ id, intent: "retracting bob's entry from field a", agent: "bob" });

    const allA = await fieldA.read();
    const allB = await fieldB.read();
    expect(allA.map((e) => e.id).sort()).toEqual(allB.map((e) => e.id).sort());
    for (const entryA of allA) {
      const entryB = allB.find((e) => e.id === entryA.id);
      expect(entryB?.status).toBe(entryA.status);
    }
  });

  it("interleaved writes from both fields produce a deterministic total order", async () => {
    const { fieldA, fieldB } = twoFields();
    for (let i = 0; i < 3; i++) {
      await fieldA.write({ entry: { agent: "a", n: i }, intent: INTENT, agent: "alice" });
      await fieldB.write({ entry: { agent: "b", n: i }, intent: INTENT, agent: "bob" });
    }
    const eventsFromA = await fieldA.replay();
    const eventsFromB = await fieldB.replay();
    expect(eventsFromA).toHaveLength(6);
    expect(eventsFromA.map((e) => e.event_id)).toEqual(eventsFromB.map((e) => e.event_id));
    // strictly increasing lamports since every write observes the prior one
    const lamports = eventsFromA.map((e) => e.lamport);
    for (let i = 1; i < lamports.length; i++) {
      expect(lamports[i]).toBeGreaterThan(lamports[i - 1] as number);
    }
  });

  it("three fields sharing one adapter converge", async () => {
    const adapter = createMemoryAdapter();
    const fieldA = createField({ adapter });
    const fieldB = createField({ adapter });
    const fieldC = createField({ adapter });

    await fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    await fieldB.write({ entry: { topic: "x" }, intent: INTENT, agent: "bob" });
    await fieldC.write({ entry: { topic: "x" }, intent: INTENT, agent: "carol" });

    const allA = await fieldA.read();
    const allB = await fieldB.read();
    const allC = await fieldC.read();
    expect(allA).toHaveLength(3);
    expect(allB).toHaveLength(3);
    expect(allC).toHaveLength(3);
    expect(allA.map((e) => e.id).sort()).toEqual(allC.map((e) => e.id).sort());
  });

  it("an entry written by A and retracted by B is invisible in both fields", async () => {
    const { fieldA, fieldB } = twoFields();
    const { id } = await fieldA.write({
      entry: { topic: "pricing" },
      intent: INTENT,
      agent: "alice",
    });
    await fieldB.read();
    await fieldB.retract({ id, intent: "withdrawing alice's entry on her behalf", agent: "alice" });

    const resultA = await fieldA.attune({ agent: "viewer", topic: "pricing" });
    const resultB = await fieldB.attune({ agent: "viewer", topic: "pricing" });
    expect(resultA).toHaveLength(0);
    expect(resultB).toHaveLength(0);
  });

  it("reckon called on A surfaces a conflict between A's and B's entries", async () => {
    const { fieldA, fieldB } = twoFields();
    await fieldA.write({
      entry: { topic: "pricing", price: "$49" },
      intent: "researcher's pricing observation from g2",
      agent: "researcher",
    });
    await fieldB.write({
      entry: { topic: "pricing", price: "$39" },
      intent: "fact-checker correction after verifying with the source",
      agent: "fact-checker",
    });

    const result = await fieldA.reckon({ agent: "writer", topic: "pricing" });
    expect(result.entries).toHaveLength(2);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.keys).toContain("price");
  });
});
