import { describe, expect, it } from "vitest";
import { recordEvent } from "../src/events.js";
import { compareEventOrder } from "../src/ordering.js";

/** Build a minimal RecordEvent with overridable lamport/agent/event_id, for ordering tests. */
function makeEvent(overrides: {
  lamport: number;
  agent?: string | null;
  event_id?: string;
  wall_time?: number;
}) {
  const event = recordEvent({
    lamport: overrides.lamport,
    agent: overrides.agent ?? null,
    entry_id: "entry-1",
    entry: { topic: "x" },
    intent: "some intent here",
  });
  return {
    ...event,
    ...(overrides.event_id !== undefined && { event_id: overrides.event_id }),
    ...(overrides.wall_time !== undefined && { wall_time: overrides.wall_time }),
  };
}

describe("compareEventOrder", () => {
  it("sorts lamport ascending as the dominant key", () => {
    const a = makeEvent({ lamport: 5 });
    const b = makeEvent({ lamport: 1 });
    expect(compareEventOrder(a, b)).toBeGreaterThan(0);
    expect(compareEventOrder(b, a)).toBeLessThan(0);
  });

  it("falls through to agent id when lamport is equal", () => {
    const a = makeEvent({ lamport: 1, agent: "zeta", event_id: "same" });
    const b = makeEvent({ lamport: 1, agent: "alpha", event_id: "same" });
    expect(compareEventOrder(a, b)).toBeGreaterThan(0);
    expect(compareEventOrder(b, a)).toBeLessThan(0);
  });

  it("sorts a null agent before any string agent", () => {
    const a = makeEvent({ lamport: 1, agent: null, event_id: "same" });
    const b = makeEvent({ lamport: 1, agent: "alpha", event_id: "same" });
    expect(compareEventOrder(a, b)).toBeLessThan(0);
    expect(compareEventOrder(b, a)).toBeGreaterThan(0);
  });

  it("falls through to event_id when lamport and agent are equal", () => {
    const a = makeEvent({ lamport: 1, agent: "researcher", event_id: "b-event" });
    const b = makeEvent({ lamport: 1, agent: "researcher", event_id: "a-event" });
    expect(compareEventOrder(a, b)).toBeGreaterThan(0);
    expect(compareEventOrder(b, a)).toBeLessThan(0);
  });

  it("orders event_id lexicographically", () => {
    const a = makeEvent({ lamport: 1, agent: "x", event_id: "01AAAA" });
    const b = makeEvent({ lamport: 1, agent: "x", event_id: "01BBBB" });
    expect(compareEventOrder(a, b)).toBeLessThan(0);
  });

  it("returns 0 when comparing an event to itself", () => {
    const a = makeEvent({ lamport: 3, agent: "researcher" });
    expect(compareEventOrder(a, a)).toBe(0);
  });

  it("sorts a single-process lamport sequence identically to insertion order", () => {
    const events = [
      makeEvent({ lamport: 1, agent: "a" }),
      makeEvent({ lamport: 2, agent: "a" }),
      makeEvent({ lamport: 3, agent: "a" }),
    ];
    const sorted = [...events].sort(compareEventOrder);
    expect(sorted).toEqual(events);
  });

  it("sorts a shuffled set into a stable deterministic order", () => {
    const events = [
      makeEvent({ lamport: 3, agent: "a", event_id: "e3" }),
      makeEvent({ lamport: 1, agent: "a", event_id: "e1" }),
      makeEvent({ lamport: 2, agent: "a", event_id: "e2" }),
    ];
    const sorted = [...events].sort(compareEventOrder);
    expect(sorted.map((e) => e.lamport)).toEqual([1, 2, 3]);
  });

  it("does not reorder two events differing only in wall_time", () => {
    const a = makeEvent({ lamport: 1, agent: "x", event_id: "same", wall_time: 5000 });
    const b = makeEvent({ lamport: 1, agent: "x", event_id: "same", wall_time: 1 });
    expect(compareEventOrder(a, b)).toBe(0);
  });

  it("is a total order: no two distinct events compare equal", () => {
    const a = makeEvent({ lamport: 1, agent: "x", event_id: "e1" });
    const b = makeEvent({ lamport: 1, agent: "x", event_id: "e2" });
    expect(compareEventOrder(a, b)).not.toBe(0);
  });

  it("produces a stable order across repeated sorts of the same input", () => {
    const events = [
      makeEvent({ lamport: 2, agent: "b", event_id: "e2" }),
      makeEvent({ lamport: 1, agent: "a", event_id: "e1" }),
      makeEvent({ lamport: 1, agent: "a", event_id: "e0" }),
    ];
    const sortedOnce = [...events].sort(compareEventOrder);
    const sortedTwice = [...sortedOnce].sort(compareEventOrder);
    expect(sortedTwice).toEqual(sortedOnce);
  });

  it("sorts reverse-ordered input correctly", () => {
    const events = [
      makeEvent({ lamport: 3, agent: "a", event_id: "e3" }),
      makeEvent({ lamport: 2, agent: "a", event_id: "e2" }),
      makeEvent({ lamport: 1, agent: "a", event_id: "e1" }),
    ];
    const sorted = [...events].sort(compareEventOrder);
    expect(sorted.map((e) => e.lamport)).toEqual([1, 2, 3]);
  });
});
