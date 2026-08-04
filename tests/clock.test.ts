import { describe, expect, it } from "vitest";
import { createLamportClock } from "../src/clock.js";
import { createField } from "../src/index.js";
import { compareEventOrder } from "../src/ordering.js";

const INTENT = "a sufficiently long intent for this test scenario";

describe("createLamportClock", () => {
  it("a fresh clock starts at 0", () => {
    const clock = createLamportClock();
    expect(clock.current()).toBe(0);
  });

  it("tick() returns 1, then 2, then 3", () => {
    const clock = createLamportClock();
    expect(clock.tick()).toBe(1);
    expect(clock.tick()).toBe(2);
    expect(clock.tick()).toBe(3);
  });

  it("tick() advances current()", () => {
    const clock = createLamportClock();
    clock.tick();
    clock.tick();
    expect(clock.current()).toBe(2);
  });

  it("observe(5) advances the clock to 5", () => {
    const clock = createLamportClock();
    clock.observe(5);
    expect(clock.current()).toBe(5);
  });

  it("observe(3) on a clock at 5 does not regress it", () => {
    const clock = createLamportClock();
    clock.observe(5);
    clock.observe(3);
    expect(clock.current()).toBe(5);
  });

  it("observe(5) then tick() returns 6", () => {
    const clock = createLamportClock();
    clock.observe(5);
    expect(clock.tick()).toBe(6);
  });

  it("observe with an equal value does not advance beyond it", () => {
    const clock = createLamportClock();
    clock.observe(5);
    clock.observe(5);
    expect(clock.current()).toBe(5);
  });

  it("observe(0) on a fresh clock is a no-op", () => {
    const clock = createLamportClock();
    clock.observe(0);
    expect(clock.current()).toBe(0);
  });

  it("a clock created with an initial value starts there", () => {
    const clock = createLamportClock(41);
    expect(clock.current()).toBe(41);
    expect(clock.tick()).toBe(42);
  });

  it("interleaved tick and observe produce a monotonically non-decreasing sequence", () => {
    const clock = createLamportClock();
    const values: number[] = [];
    values.push(clock.tick());
    clock.observe(10);
    values.push(clock.tick());
    values.push(clock.tick());
    clock.observe(5); // stale, should not regress
    values.push(clock.tick());
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1] as number);
    }
  });

  it("current() never decreases across any sequence of operations", () => {
    const clock = createLamportClock();
    let last = clock.current();
    const ops = [
      () => clock.tick(),
      () => clock.observe(2),
      () => clock.tick(),
      () => clock.observe(1),
      () => clock.tick(),
      () => clock.observe(100),
      () => clock.observe(50),
    ];
    for (const op of ops) {
      op();
      const now = clock.current();
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
  });

  it("two independent clocks do not share state", () => {
    const a = createLamportClock();
    const b = createLamportClock();
    a.tick();
    a.tick();
    expect(a.current()).toBe(2);
    expect(b.current()).toBe(0);
  });
});

describe("single-process regression — lamport sequence unchanged", () => {
  it("ten sequential writes produce lamports 0 through 9", async () => {
    const field = createField();
    for (let i = 0; i < 10; i++) {
      await field.write({ entry: { n: i }, intent: INTENT });
    }
    const all = await field.read();
    expect(all.map((e) => e.epoch)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("no two events share a lamport value in a single-process field", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: INTENT, agent: "alice" });
    const { id } = await field.write({ entry: { topic: "b" }, intent: INTENT, agent: "bob" });
    await field.supersede({
      superseding_id: id,
      entry: { topic: "b", v: 2 },
      intent: INTENT,
      agent: "carol",
    });
    const events = await field.replay();
    const lamports = events.map((e) => e.lamport);
    expect(new Set(lamports).size).toBe(lamports.length);
  });

  it("compareEventOrder never reaches the agent tiebreaker in a single-process field", async () => {
    const field = createField();
    for (let i = 0; i < 8; i++) {
      await field.write({ entry: { n: i }, intent: INTENT, agent: i % 2 === 0 ? "a" : "b" });
    }
    const events = await field.replay();
    // If every event has a distinct lamport, compareEventOrder's first
    // branch (lamport difference) resolves every comparison, and the
    // agent/event_id tiebreakers are dead code for this ordering.
    for (let i = 0; i < events.length; i++) {
      for (let j = 0; j < events.length; j++) {
        if (i === j) continue;
        const a = events[i];
        const b = events[j];
        if (a === undefined || b === undefined) continue;
        expect(a.lamport === b.lamport).toBe(false);
        // The lamport comparison alone must agree with the full comparator.
        expect(Math.sign(a.lamport - b.lamport)).toBe(Math.sign(compareEventOrder(a, b)));
      }
    }
  });
});
