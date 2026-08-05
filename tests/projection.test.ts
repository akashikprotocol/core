import { describe, expect, it } from "vitest";
import { deregisterEvent, recordEvent, registerEvent, statusChangeEvent } from "../src/events.js";
import type { FieldEvent } from "../src/events.js";
import { applyEvent, buildProjection, emptyProjection } from "../src/projection.js";

/** Assign a seq to an event, simulating what an adapter does on append. */
function withSeq<T extends FieldEvent>(event: T, seq: number): T {
  return { ...event, seq };
}

describe("emptyProjection", () => {
  it("has upToSeq -1 and empty maps", () => {
    const projection = emptyProjection();
    expect(projection.upToSeq).toBe(-1);
    expect(projection.maxLamport).toBe(0);
    expect(projection.entries.size).toBe(0);
    expect(projection.sessions.size).toBe(0);
  });
});

describe("applyEvent", () => {
  it("RECORD adds a committed entry", () => {
    const projection = emptyProjection();
    const event = withSeq(
      recordEvent({
        lamport: 1,
        agent: "researcher",
        entry_id: "entry-1",
        entry: { topic: "x", price: 10 },
        intent: "recording a price observation",
      }),
      0,
    );

    applyEvent(projection, event);

    const stored = projection.entries.get("entry-1");
    expect(stored).toBeDefined();
    expect(stored?.status).toBe("committed");
    expect(stored?.entry).toEqual({ topic: "x", price: 10 });
    expect(stored?.intent).toBe("recording a price observation");
    expect(stored?.agent).toBe("researcher");
    expect(stored?.epoch).toBe(1);
  });

  it("STATUS_CHANGE updates status", () => {
    const projection = emptyProjection();
    applyEvent(
      projection,
      withSeq(
        recordEvent({
          lamport: 1,
          agent: "researcher",
          entry_id: "entry-1",
          entry: { topic: "x" },
          intent: "recording an observation",
        }),
        0,
      ),
    );
    applyEvent(
      projection,
      withSeq(
        statusChangeEvent({
          lamport: 2,
          agent: "researcher",
          entry_id: "entry-1",
          new_status: "retracted",
          intent: "withdrawing this observation",
        }),
        1,
      ),
    );

    expect(projection.entries.get("entry-1")?.status).toBe("retracted");
  });

  it("STATUS_CHANGE for an unknown entry is a no-op and does not throw", () => {
    const projection = emptyProjection();
    expect(() =>
      applyEvent(
        projection,
        withSeq(
          statusChangeEvent({
            lamport: 1,
            agent: "researcher",
            entry_id: "does-not-exist",
            new_status: "retracted",
            intent: "withdrawing this observation",
          }),
          0,
        ),
      ),
    ).not.toThrow();
    expect(projection.entries.size).toBe(0);
  });

  it("a RECORD with supersedes marks the predecessor superseded", () => {
    const projection = emptyProjection();
    applyEvent(
      projection,
      withSeq(
        recordEvent({
          lamport: 1,
          agent: "researcher",
          entry_id: "entry-1",
          entry: { topic: "x", price: 10 },
          intent: "recording a price observation",
        }),
        0,
      ),
    );
    applyEvent(
      projection,
      withSeq(
        recordEvent({
          lamport: 2,
          agent: "fact-checker",
          entry_id: "entry-2",
          entry: { topic: "x", price: 12 },
          intent: "correcting the price observation",
          supersedes: "entry-1",
        }),
        1,
      ),
    );

    expect(projection.entries.get("entry-1")?.status).toBe("superseded");
    expect(projection.entries.get("entry-2")?.status).toBe("committed");
  });

  it("REGISTER adds a session; DEREGISTER removes it", () => {
    const projection = emptyProjection();
    applyEvent(
      projection,
      withSeq(
        registerEvent({
          lamport: 1,
          agent: "researcher",
          entry_id: "researcher",
          role: "researcher",
          capabilities: ["search"],
        }),
        0,
      ),
    );
    expect(projection.sessions.get("researcher")).toEqual({
      role: "researcher",
      capabilities: ["search"],
    });

    applyEvent(
      projection,
      withSeq(deregisterEvent({ lamport: 2, agent: "researcher", entry_id: "researcher" }), 1),
    );
    expect(projection.sessions.has("researcher")).toBe(false);
  });

  it("REGISTER twice for the same agent replaces the session", () => {
    const projection = emptyProjection();
    applyEvent(
      projection,
      withSeq(
        registerEvent({
          lamport: 1,
          agent: "researcher",
          entry_id: "researcher",
          role: "researcher",
          capabilities: ["search"],
        }),
        0,
      ),
    );
    applyEvent(
      projection,
      withSeq(
        registerEvent({
          lamport: 2,
          agent: "researcher",
          entry_id: "researcher",
          role: "lead-researcher",
          capabilities: ["search", "write"],
        }),
        1,
      ),
    );

    expect(projection.sessions.get("researcher")).toEqual({
      role: "lead-researcher",
      capabilities: ["search", "write"],
    });
  });

  it("upToSeq advances to the event's seq", () => {
    const projection = emptyProjection();
    applyEvent(
      projection,
      withSeq(
        recordEvent({
          lamport: 1,
          agent: "researcher",
          entry_id: "entry-1",
          entry: { topic: "x" },
          intent: "recording an observation",
        }),
        7,
      ),
    );
    expect(projection.upToSeq).toBe(7);
  });

  it("maxLamport advances to the event's lamport", () => {
    const projection = emptyProjection();
    applyEvent(
      projection,
      withSeq(
        recordEvent({
          lamport: 9,
          agent: "researcher",
          entry_id: "entry-1",
          entry: { topic: "x" },
          intent: "recording an observation",
        }),
        0,
      ),
    );
    expect(projection.maxLamport).toBe(9);
  });

  it("does not regress upToSeq when an older event is applied", () => {
    const projection = emptyProjection();
    applyEvent(
      projection,
      withSeq(
        recordEvent({
          lamport: 1,
          agent: "researcher",
          entry_id: "entry-1",
          entry: { topic: "x" },
          intent: "recording an observation",
        }),
        5,
      ),
    );
    applyEvent(
      projection,
      withSeq(
        recordEvent({
          lamport: 0,
          agent: "researcher",
          entry_id: "entry-2",
          entry: { topic: "y" },
          intent: "recording another observation",
        }),
        2,
      ),
    );
    expect(projection.upToSeq).toBe(5);
  });
});

describe("buildProjection", () => {
  it("produces an empty projection from an empty event list", () => {
    const projection = buildProjection([]);
    expect(projection.upToSeq).toBe(-1);
    expect(projection.entries.size).toBe(0);
  });

  it("sorts unordered input before applying", () => {
    const e1 = withSeq(
      recordEvent({
        lamport: 1,
        agent: "researcher",
        entry_id: "entry-1",
        entry: { topic: "x", price: 10 },
        intent: "recording a price observation",
      }),
      0,
    );
    const e2 = withSeq(
      recordEvent({
        lamport: 2,
        agent: "fact-checker",
        entry_id: "entry-1",
        entry: { topic: "x", price: 12 },
        intent: "correcting a price observation",
      }),
      1,
    );

    // Pass events out of order; the later lamport must still win.
    const projection = buildProjection([e2, e1]);
    expect(projection.entries.get("entry-1")?.entry.price).toBe(12);
  });

  it("produces identical projections from shuffled inputs of the same event set", () => {
    const events: FieldEvent[] = [
      withSeq(
        recordEvent({
          lamport: 1,
          agent: "a",
          entry_id: "entry-1",
          entry: { topic: "x" },
          intent: "recording an observation",
        }),
        0,
      ),
      withSeq(
        recordEvent({
          lamport: 2,
          agent: "b",
          entry_id: "entry-2",
          entry: { topic: "y" },
          intent: "recording another observation",
        }),
        1,
      ),
      withSeq(
        statusChangeEvent({
          lamport: 3,
          agent: "a",
          entry_id: "entry-1",
          new_status: "retracted",
          intent: "withdrawing this observation",
        }),
        2,
      ),
    ];

    const forward = buildProjection(events);
    const reversed = buildProjection([...events].reverse());

    expect(forward.entries.get("entry-1")?.status).toBe(reversed.entries.get("entry-1")?.status);
    expect(forward.entries.get("entry-2")?.status).toBe(reversed.entries.get("entry-2")?.status);
    expect(forward.upToSeq).toBe(reversed.upToSeq);
    expect(forward.maxLamport).toBe(reversed.maxLamport);
  });

  it("resolves a supersession chain to only the latest entry visible as committed", () => {
    const e1 = withSeq(
      recordEvent({
        lamport: 1,
        agent: "researcher",
        entry_id: "entry-1",
        entry: { topic: "x", price: 10 },
        intent: "recording a price observation",
      }),
      0,
    );
    const e2 = withSeq(
      recordEvent({
        lamport: 2,
        agent: "fact-checker",
        entry_id: "entry-2",
        entry: { topic: "x", price: 12 },
        intent: "first correction to the price observation",
        supersedes: "entry-1",
      }),
      1,
    );
    const e3 = withSeq(
      recordEvent({
        lamport: 3,
        agent: "auditor",
        entry_id: "entry-3",
        entry: { topic: "x", price: 15 },
        intent: "second correction to the price observation",
        supersedes: "entry-2",
      }),
      2,
    );

    const projection = buildProjection([e1, e2, e3]);

    expect(projection.entries.get("entry-1")?.status).toBe("superseded");
    expect(projection.entries.get("entry-2")?.status).toBe("superseded");
    expect(projection.entries.get("entry-3")?.status).toBe("committed");
  });
});
