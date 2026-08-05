import { describe, expect, it } from "vitest";
import {
  EVENT_FORMAT_VERSION,
  deregisterEvent,
  recordEvent,
  registerEvent,
  statusChangeEvent,
} from "../src/events.js";

describe("event constructors", () => {
  it("recordEvent produces type RECORD", () => {
    const event = recordEvent({
      lamport: 0,
      agent: "researcher",
      entry_id: "entry-1",
      entry: { topic: "x" },
      intent: "recording an observation",
    });
    expect(event.type).toBe("RECORD");
  });

  it("statusChangeEvent produces type STATUS_CHANGE", () => {
    const event = statusChangeEvent({
      lamport: 0,
      agent: "researcher",
      entry_id: "entry-1",
      new_status: "retracted",
      intent: "withdrawing this observation",
    });
    expect(event.type).toBe("STATUS_CHANGE");
  });

  it("registerEvent produces type REGISTER", () => {
    const event = registerEvent({
      lamport: 0,
      agent: "researcher",
      entry_id: "researcher",
      role: "researcher",
      capabilities: [],
    });
    expect(event.type).toBe("REGISTER");
  });

  it("deregisterEvent produces type DEREGISTER", () => {
    const event = deregisterEvent({
      lamport: 0,
      agent: "researcher",
      entry_id: "researcher",
    });
    expect(event.type).toBe("DEREGISTER");
  });

  it("every constructor stamps v === EVENT_FORMAT_VERSION, which is 1", () => {
    expect(EVENT_FORMAT_VERSION).toBe(1);

    const record = recordEvent({
      lamport: 0,
      agent: null,
      entry_id: "e",
      entry: {},
      intent: "some intent here",
    });
    const statusChange = statusChangeEvent({
      lamport: 0,
      agent: null,
      entry_id: "e",
      new_status: "retracted",
      intent: "some intent here",
    });
    const register = registerEvent({
      lamport: 0,
      agent: null,
      entry_id: "e",
      role: "r",
      capabilities: [],
    });
    const deregister = deregisterEvent({ lamport: 0, agent: null, entry_id: "e" });

    expect(record.v).toBe(EVENT_FORMAT_VERSION);
    expect(statusChange.v).toBe(EVENT_FORMAT_VERSION);
    expect(register.v).toBe(EVENT_FORMAT_VERSION);
    expect(deregister.v).toBe(EVENT_FORMAT_VERSION);
  });

  it("caller input cannot override v, event_id, seq, or wall_time", () => {
    const event = recordEvent({
      // biome-ignore lint/suspicious/noExplicitAny: deliberately smuggling disallowed fields past the type system
      ...({ v: 999, event_id: "fake", seq: 42, wall_time: 1 } as any),
      lamport: 0,
      agent: null,
      entry_id: "e",
      entry: {},
      intent: "some intent here",
    });

    expect(event.v).toBe(EVENT_FORMAT_VERSION);
    expect(event.event_id).not.toBe("fake");
    expect(event.seq).toBe(-1);
    expect(event.wall_time).not.toBe(1);
  });

  it("produces a unique event_id across rapid calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const event = recordEvent({
        lamport: i,
        agent: null,
        entry_id: "e",
        entry: {},
        intent: "some intent here",
      });
      ids.add(event.event_id);
    }
    expect(ids.size).toBe(50);
  });

  it("stamps seq as -1 at construction", () => {
    const event = recordEvent({
      lamport: 0,
      agent: null,
      entry_id: "e",
      entry: {},
      intent: "some intent here",
    });
    expect(event.seq).toBe(-1);
  });

  it("stamps wall_time as a plausible Unix ms value", () => {
    const before = Date.now();
    const event = recordEvent({
      lamport: 0,
      agent: null,
      entry_id: "e",
      entry: {},
      intent: "some intent here",
    });
    const after = Date.now();
    expect(event.wall_time).toBeGreaterThanOrEqual(before);
    expect(event.wall_time).toBeLessThanOrEqual(after);
  });

  it("carries confidence through recordEvent when provided", () => {
    const event = recordEvent({
      lamport: 0,
      agent: null,
      entry_id: "e",
      entry: {},
      intent: "some intent here",
      confidence: { score: 0.8, reason: "cross-checked with two sources" },
    });
    expect(event.confidence).toEqual({ score: 0.8, reason: "cross-checked with two sources" });
  });

  it("leaves confidence absent when not provided", () => {
    const event = recordEvent({
      lamport: 0,
      agent: null,
      entry_id: "e",
      entry: {},
      intent: "some intent here",
    });
    expect(event.confidence).toBeUndefined();
  });

  it("carries supersedes through when provided", () => {
    const event = recordEvent({
      lamport: 0,
      agent: null,
      entry_id: "e2",
      entry: {},
      intent: "some intent here",
      supersedes: "e1",
    });
    expect(event.supersedes).toBe("e1");
  });
});
