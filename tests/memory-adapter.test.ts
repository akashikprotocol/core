import { describe, expect, it } from "vitest";
import { createMemoryAdapter } from "../src/adapters/memory.js";
import { EVENT_FORMAT_VERSION, recordEvent, registerEvent } from "../src/events.js";
import { createField } from "../src/index.js";

function makeRecord(overrides: { lamport?: number; entry?: Record<string, unknown> } = {}) {
  return recordEvent({
    lamport: overrides.lamport ?? 0,
    agent: "researcher",
    entry_id: "entry-1",
    entry: overrides.entry ?? { topic: "x" },
    intent: "recording an observation for the adapter test",
  });
}

describe("createMemoryAdapter — append", () => {
  it("assigns sequential seqs starting at 0", async () => {
    const adapter = createMemoryAdapter();
    const { seqs } = await adapter.append([makeRecord({ lamport: 0 })]);
    expect(seqs).toEqual([0]);
    const { seqs: seqs2 } = await adapter.append([makeRecord({ lamport: 1 })]);
    expect(seqs2).toEqual([1]);
  });

  it("returns seqs in input order", async () => {
    const adapter = createMemoryAdapter();
    const { seqs } = await adapter.append([
      makeRecord({ lamport: 0 }),
      makeRecord({ lamport: 1 }),
      makeRecord({ lamport: 2 }),
    ]);
    expect(seqs).toEqual([0, 1, 2]);
  });

  it("assigns contiguous seqs across a batch", async () => {
    const adapter = createMemoryAdapter();
    await adapter.append([makeRecord({ lamport: 0 })]);
    const { seqs } = await adapter.append([makeRecord({ lamport: 1 }), makeRecord({ lamport: 2 })]);
    expect(seqs).toEqual([1, 2]);
  });

  it("preserves v on appended events", async () => {
    const adapter = createMemoryAdapter();
    await adapter.append([makeRecord()]);
    const all = await adapter.readEvents();
    expect(all[0]?.v).toBe(EVENT_FORMAT_VERSION);
  });
});

describe("createMemoryAdapter — readEvents", () => {
  it("returns all events in seq order with no options", async () => {
    const adapter = createMemoryAdapter();
    await adapter.append([makeRecord({ lamport: 0 }), makeRecord({ lamport: 1 })]);
    const all = await adapter.readEvents();
    expect(all.map((e) => e.seq)).toEqual([0, 1]);
  });

  it("sinceSeq returns only strictly-later events", async () => {
    const adapter = createMemoryAdapter();
    await adapter.append([
      makeRecord({ lamport: 0 }),
      makeRecord({ lamport: 1 }),
      makeRecord({ lamport: 2 }),
    ]);
    const later = await adapter.readEvents({ sinceSeq: 0 });
    expect(later.map((e) => e.seq)).toEqual([1, 2]);
  });

  it("sinceSeq beyond the log returns empty", async () => {
    const adapter = createMemoryAdapter();
    await adapter.append([makeRecord({ lamport: 0 })]);
    const later = await adapter.readEvents({ sinceSeq: 99 });
    expect(later).toEqual([]);
  });

  it("topic scope returns matching RECORD events", async () => {
    const adapter = createMemoryAdapter();
    await adapter.append([
      makeRecord({ lamport: 0, entry: { topic: "pricing" } }),
      makeRecord({ lamport: 1, entry: { topic: "other" } }),
    ]);
    const scoped = await adapter.readEvents({ scope: { topic: "pricing" } });
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.type).toBe("RECORD");
  });

  it("topic scope passes non-RECORD events through", async () => {
    const adapter = createMemoryAdapter();
    await adapter.append([
      registerEvent({
        lamport: 0,
        agent: "researcher",
        entry_id: "researcher",
        role: "researcher",
        capabilities: [],
      }),
      makeRecord({ lamport: 1, entry: { topic: "other" } }),
    ]);
    const scoped = await adapter.readEvents({ scope: { topic: "pricing" } });
    expect(scoped).toHaveLength(1);
    expect(scoped[0]?.type).toBe("REGISTER");
  });

  it("returned events carry their assigned seq", async () => {
    const adapter = createMemoryAdapter();
    const { seqs } = await adapter.append([makeRecord()]);
    const all = await adapter.readEvents();
    expect(all[0]?.seq).toBe(seqs[0]);
  });

  it("returns a copy, not the internal array", async () => {
    const adapter = createMemoryAdapter();
    await adapter.append([makeRecord()]);
    const first = await adapter.readEvents();
    first.length = 0;
    const second = await adapter.readEvents();
    expect(second).toHaveLength(1);
  });

  it("a fresh adapter has an empty log", async () => {
    const adapter = createMemoryAdapter();
    expect(await adapter.readEvents()).toEqual([]);
  });
});

describe("createMemoryAdapter — projection snapshotting", () => {
  it("loadProjection returns null", async () => {
    const adapter = createMemoryAdapter();
    expect(await adapter.loadProjection()).toBeNull();
  });

  it("saveProjection resolves without throwing", async () => {
    const adapter = createMemoryAdapter();
    await expect(
      adapter.saveProjection(
        { entries: new Map(), sessions: new Map(), upToSeq: -1, maxLamport: 0 },
        -1,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("createMemoryAdapter — isolation", () => {
  it("two adapters are independent", async () => {
    const a = createMemoryAdapter();
    const b = createMemoryAdapter();
    await a.append([makeRecord()]);
    expect(await a.readEvents()).toHaveLength(1);
    expect(await b.readEvents()).toHaveLength(0);
  });
});

describe("createField({ adapter }) — custom adapter integration", () => {
  it("accepts an explicit MemoryAdapter and behaves like the default", async () => {
    const adapter = createMemoryAdapter();
    const field = createField({ adapter });
    await field.write({ entry: { topic: "x" }, intent: "writing through a custom adapter" });
    const all = await field.read();
    expect(all).toHaveLength(1);
    expect(all[0]?.entry).toEqual({ topic: "x" });
  });

  it("writes through a custom adapter are visible on the adapter's own log", async () => {
    const adapter = createMemoryAdapter();
    const field = createField({ adapter });
    await field.write({ entry: { topic: "x" }, intent: "writing through a custom adapter" });
    const events = await adapter.readEvents();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("RECORD");
  });

  it("two fields over two separate adapters do not share state", async () => {
    const fieldA = createField({ adapter: createMemoryAdapter() });
    const fieldB = createField({ adapter: createMemoryAdapter() });
    await fieldA.write({ entry: { topic: "x" }, intent: "writing only to field a" });
    expect(await fieldA.read()).toHaveLength(1);
    expect(await fieldB.read()).toHaveLength(0);
  });
});
