import { describe, expect, it } from "vitest";
import { deserializeProjection, emptyProjection, serializeProjection } from "../src/projection.js";
import type { FieldEntry, Projection } from "../src/types.js";

describe("serializeProjection / deserializeProjection", () => {
  it("round-trips an empty projection", () => {
    const original = emptyProjection();
    const round = deserializeProjection(serializeProjection(original));
    expect(round.entries.size).toBe(0);
    expect(round.sessions.size).toBe(0);
    expect(round.upToSeq).toBe(-1);
    expect(round.maxLamport).toBe(0);
  });

  it("round-trips entries including optional confidence", () => {
    const original = emptyProjection();
    const entryWithConfidence: FieldEntry = {
      id: "entry-1",
      timestamp: 1000,
      epoch: 0,
      agent: "alice",
      status: "committed",
      entry: { topic: "x" },
      intent: "an intent long enough for this test",
      confidence: { score: 0.7, reason: "cross-checked" },
    };
    original.entries.set(entryWithConfidence.id, entryWithConfidence);

    const round = deserializeProjection(serializeProjection(original));
    expect(round.entries.get("entry-1")).toEqual(entryWithConfidence);
  });

  it("round-trips sessions with capabilities", () => {
    const original = emptyProjection();
    original.sessions.set("alice", { role: "researcher", capabilities: ["draft-writes"] });

    const round = deserializeProjection(serializeProjection(original));
    expect(round.sessions.get("alice")).toEqual({
      role: "researcher",
      capabilities: ["draft-writes"],
    });
  });

  it("preserves absent-versus-undefined agent", () => {
    const original = emptyProjection();
    const anonymousEntry: FieldEntry = {
      id: "entry-2",
      timestamp: 1000,
      epoch: 0,
      status: "committed",
      entry: { topic: "x" },
      intent: "an anonymous entry with no agent field set",
    };
    original.entries.set(anonymousEntry.id, anonymousEntry);

    const round = deserializeProjection(serializeProjection(original));
    const roundEntry = round.entries.get("entry-2");
    expect(roundEntry).toBeDefined();
    expect("agent" in (roundEntry as object)).toBe(false);
  });

  it("preserves upToSeq and maxLamport", () => {
    const original: Projection = {
      entries: new Map(),
      sessions: new Map(),
      upToSeq: 42,
      maxLamport: 41,
    };
    const round = deserializeProjection(serializeProjection(original));
    expect(round.upToSeq).toBe(42);
    expect(round.maxLamport).toBe(41);
  });

  it("survives an actual JSON.stringify / JSON.parse cycle", () => {
    const original = emptyProjection();
    original.entries.set("entry-1", {
      id: "entry-1",
      timestamp: 1000,
      epoch: 0,
      agent: "alice",
      status: "committed",
      entry: { topic: "x", price: 49 },
      intent: "an intent long enough for this test",
      confidence: { score: 0.5 },
    });
    original.sessions.set("bob", { role: "writer", capabilities: [] });
    original.upToSeq = 3;
    original.maxLamport = 3;

    const json = JSON.stringify(serializeProjection(original));
    const parsed = JSON.parse(json);
    const round = deserializeProjection(parsed);

    expect(round.entries.get("entry-1")).toEqual(original.entries.get("entry-1"));
    expect(round.sessions.get("bob")).toEqual(original.sessions.get("bob"));
    expect(round.upToSeq).toBe(3);
    expect(round.maxLamport).toBe(3);
  });
});
