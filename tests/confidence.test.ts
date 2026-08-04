import { describe, expect, it } from "vitest";
import { AkashikError, createField } from "../src/index.js";

const INTENT = "a sufficiently long intent for this test scenario";

describe("confidence — acceptance and carriage", () => {
  it("a write with confidence succeeds and the entry carries it", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: INTENT,
      confidence: { score: 0.8, reason: "cross-checked with two sources" },
    });
    const all = await field.read();
    expect(all[0]?.confidence).toEqual({ score: 0.8, reason: "cross-checked with two sources" });
  });

  it("a write without confidence succeeds and the entry has no confidence field", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: INTENT });
    const all = await field.read();
    expect(all[0]?.confidence).toBeUndefined();
  });

  it("confidence with only a score is accepted", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: INTENT, confidence: { score: 0.5 } });
    const all = await field.read();
    expect(all[0]?.confidence).toEqual({ score: 0.5 });
  });

  it("confidence with score and reason is accepted", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: INTENT,
      confidence: { score: 0.5, reason: "a stated reason" },
    });
    const all = await field.read();
    expect(all[0]?.confidence).toEqual({ score: 0.5, reason: "a stated reason" });
  });

  it("confidence survives to read()", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: INTENT, confidence: { score: 0.7 } });
    const all = await field.read();
    expect(all[0]?.confidence?.score).toBe(0.7);
  });

  it("confidence survives to attune()", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: INTENT,
      agent: "alice",
      confidence: { score: 0.7 },
    });
    const result = await field.attune({ agent: "bob", topic: "x" });
    expect(result[0]?.confidence?.score).toBe(0.7);
  });

  it("confidence survives to reckon() entries", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: INTENT,
      agent: "alice",
      confidence: { score: 0.7 },
    });
    const result = await field.reckon({ agent: "bob", topic: "x" });
    expect(result.entries[0]?.confidence?.score).toBe(0.7);
  });

  it("confidence survives a draft to commit cycle", async () => {
    const field = createField();
    const { draft_id } = await field.draft({
      entry: { topic: "x" },
      intent: INTENT,
      confidence: { score: 0.6, reason: "drafted with moderate certainty" },
    });
    await field.commit({ draft_id });
    const all = await field.read();
    expect(all[0]?.confidence).toEqual({ score: 0.6, reason: "drafted with moderate certainty" });
  });

  it("a supersede's new entry carries confidence", async () => {
    const field = createField();
    const { id } = await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    await field.supersede({
      superseding_id: id,
      entry: { topic: "x", v: 2 },
      intent: INTENT,
      agent: "bob",
      confidence: { score: 0.85 },
    });
    const all = await field.read();
    const newEntry = all.find((e) => e.status === "committed");
    expect(newEntry?.confidence?.score).toBe(0.85);
  });

  it("a supersede's superseded predecessor is unaffected by the new confidence", async () => {
    const field = createField();
    const { id } = await field.write({
      entry: { topic: "x" },
      intent: INTENT,
      agent: "alice",
      confidence: { score: 0.3 },
    });
    await field.supersede({
      superseding_id: id,
      entry: { topic: "x", v: 2 },
      intent: INTENT,
      agent: "bob",
      confidence: { score: 0.9 },
    });
    const all = await field.read();
    const predecessor = all.find((e) => e.id === id);
    expect(predecessor?.status).toBe("superseded");
    expect(predecessor?.confidence?.score).toBe(0.3);
  });

  it("confidence survives replay() on the RECORD event", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: INTENT,
      confidence: { score: 0.65, reason: "recorded observation" },
    });
    const events = await field.replay();
    const record = events.find((e) => e.type === "RECORD");
    expect(record?.type === "RECORD" && record.confidence).toEqual({
      score: 0.65,
      reason: "recorded observation",
    });
  });

  it("an entry without confidence has the key absent, not set to undefined", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: INTENT });
    const all = await field.read();
    expect("confidence" in (all[0] as object)).toBe(false);
  });
});

describe("confidence — validation", () => {
  it("score below 0 throws INVALID_CONFIDENCE", async () => {
    const field = createField();
    await expect(
      field.write({ entry: { topic: "x" }, intent: INTENT, confidence: { score: -0.1 } }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("score above 1 throws INVALID_CONFIDENCE", async () => {
    const field = createField();
    await expect(
      field.write({ entry: { topic: "x" }, intent: INTENT, confidence: { score: 1.1 } }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("score of exactly 0 is accepted", async () => {
    const field = createField();
    await expect(
      field.write({ entry: { topic: "x" }, intent: INTENT, confidence: { score: 0 } }),
    ).resolves.toBeDefined();
  });

  it("score of exactly 1 is accepted", async () => {
    const field = createField();
    await expect(
      field.write({ entry: { topic: "x" }, intent: INTENT, confidence: { score: 1 } }),
    ).resolves.toBeDefined();
  });

  it("score of NaN throws INVALID_CONFIDENCE", async () => {
    const field = createField();
    await expect(
      field.write({ entry: { topic: "x" }, intent: INTENT, confidence: { score: Number.NaN } }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("score of Infinity throws INVALID_CONFIDENCE", async () => {
    const field = createField();
    await expect(
      field.write({
        entry: { topic: "x" },
        intent: INTENT,
        confidence: { score: Number.POSITIVE_INFINITY },
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("non-numeric score throws INVALID_CONFIDENCE", async () => {
    const field = createField();
    await expect(
      field.write({
        entry: { topic: "x" },
        intent: INTENT,
        // @ts-expect-error — intentionally wrong type
        confidence: { score: "high" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("missing score throws INVALID_CONFIDENCE", async () => {
    const field = createField();
    await expect(
      field.write({
        entry: { topic: "x" },
        intent: INTENT,
        // @ts-expect-error — intentionally missing score
        confidence: { reason: "no score given" },
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("non-string reason throws INVALID_CONFIDENCE", async () => {
    const field = createField();
    await expect(
      field.write({
        entry: { topic: "x" },
        intent: INTENT,
        // @ts-expect-error — intentionally wrong type
        confidence: { score: 0.5, reason: 42 },
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("confidence as an array throws INVALID_CONFIDENCE", async () => {
    const field = createField();
    await expect(
      field.write({
        entry: { topic: "x" },
        intent: INTENT,
        // @ts-expect-error — intentionally wrong type
        confidence: [0.5],
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("confidence as null throws INVALID_CONFIDENCE", async () => {
    const field = createField();
    await expect(
      field.write({
        entry: { topic: "x" },
        intent: INTENT,
        // @ts-expect-error — intentionally null
        confidence: null,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("INVALID_CONFIDENCE is an instance of AkashikError", async () => {
    const field = createField();
    try {
      await field.write({ entry: { topic: "x" }, intent: INTENT, confidence: { score: 5 } });
      throw new Error("should have rejected");
    } catch (e) {
      expect(e).toBeInstanceOf(AkashikError);
      expect((e as AkashikError).code).toBe("INVALID_CONFIDENCE");
    }
  });

  it("validation applies to draft", async () => {
    const field = createField();
    await expect(
      field.draft({ entry: { topic: "x" }, intent: INTENT, confidence: { score: 2 } }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });

  it("validation applies to supersede", async () => {
    const field = createField();
    const { id } = await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
    await expect(
      field.supersede({
        superseding_id: id,
        entry: { topic: "x", v: 2 },
        intent: INTENT,
        agent: "bob",
        confidence: { score: -5 },
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIDENCE" });
  });
});

describe("confidence — inertness", () => {
  it("two entries identical except for confidence receive identical relevance scores", async () => {
    const fieldNoConfidence = createField();
    const fieldWithConfidence = createField();
    await fieldNoConfidence.write({
      entry: { topic: "x" },
      intent: INTENT,
      agent: "researcher",
    });
    await fieldWithConfidence.write({
      entry: { topic: "x" },
      intent: INTENT,
      agent: "researcher",
      confidence: { score: 0.95, reason: "cross-verified with two independent sources" },
    });

    const resultNoConfidence = await fieldNoConfidence.attune({ agent: "writer", topic: "x" });
    const resultWithConfidence = await fieldWithConfidence.attune({ agent: "writer", topic: "x" });

    expect(resultWithConfidence[0]?.relevance_score).toBe(resultNoConfidence[0]?.relevance_score);
    expect(resultWithConfidence[0]?.relevance_reason).toEqual(
      resultNoConfidence[0]?.relevance_reason,
    );
  });

  it("attune ordering is unchanged when confidence is added to every entry", async () => {
    const plainField = createField();
    const confidentField = createField();

    const entries = [
      { topic: "x", label: "first" },
      { topic: "x", label: "second" },
      { topic: "x", label: "third" },
    ];

    for (const entry of entries) {
      await plainField.write({ entry, intent: INTENT, agent: "researcher" });
    }
    for (const entry of entries) {
      await confidentField.write({
        entry,
        intent: INTENT,
        agent: "researcher",
        confidence: { score: Math.random() },
      });
    }

    const plainOrder = (await plainField.attune({ agent: "writer", topic: "x" })).map(
      (e) => (e.entry as { label: string }).label,
    );
    const confidentOrder = (await confidentField.attune({ agent: "writer", topic: "x" })).map(
      (e) => (e.entry as { label: string }).label,
    );

    expect(confidentOrder).toEqual(plainOrder);
  });

  it("a high-confidence entry does not outrank a low-confidence entry on an otherwise-identical basis", async () => {
    const field = createField();
    // Older entry (lower recency component), but high confidence.
    await field.write({
      entry: { topic: "x", label: "older" },
      intent: INTENT,
      agent: "alice",
      confidence: { score: 0.99 },
    });
    // Newer entry (higher recency component), but low confidence.
    await field.write({
      entry: { topic: "x", label: "newer" },
      intent: INTENT,
      agent: "alice",
      confidence: { score: 0.01 },
    });

    const result = await field.attune({ agent: "writer", topic: "x" });
    expect(result).toHaveLength(2);
    // The newer entry has the higher real relevance score and must rank
    // first, despite carrying the LOWER confidence. If confidence leaked
    // into scoring, the high-confidence older entry could win instead.
    expect((result[0]?.entry as { label: string }).label).toBe("newer");
    expect(result[0]?.confidence?.score).toBe(0.01);
  });

  it("reckon detects the same conflicts whether or not confidence is present", async () => {
    const fieldNoConfidence = createField();
    const fieldWithConfidence = createField();

    await fieldNoConfidence.write({
      entry: { topic: "pricing", price: 49 },
      intent: "researcher's pricing observation from g2",
      agent: "researcher",
    });
    await fieldNoConfidence.write({
      entry: { topic: "pricing", price: 39 },
      intent: "fact-checker's correction after verifying the source",
      agent: "fact-checker",
    });

    await fieldWithConfidence.write({
      entry: { topic: "pricing", price: 49 },
      intent: "researcher's pricing observation from g2",
      agent: "researcher",
      confidence: { score: 0.9 },
    });
    await fieldWithConfidence.write({
      entry: { topic: "pricing", price: 39 },
      intent: "fact-checker's correction after verifying the source",
      agent: "fact-checker",
      confidence: { score: 0.1 },
    });

    const resultNoConfidence = await fieldNoConfidence.reckon({
      agent: "writer",
      topic: "pricing",
    });
    const resultWithConfidence = await fieldWithConfidence.reckon({
      agent: "writer",
      topic: "pricing",
    });

    expect(resultWithConfidence.conflicts).toHaveLength(1);
    expect(resultWithConfidence.conflicts[0]?.keys).toEqual(resultNoConfidence.conflicts[0]?.keys);
  });

  it("a conflict between a 0.9-confidence and a 0.1-confidence entry is surfaced identically to one between two unscored entries", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: 49 },
      intent: "researcher's pricing observation from g2",
      agent: "researcher",
      confidence: { score: 0.9 },
    });
    await field.write({
      entry: { topic: "pricing", price: 39 },
      intent: "fact-checker's correction after verifying the source",
      agent: "fact-checker",
      confidence: { score: 0.1 },
    });

    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.keys).toEqual(["price"]);
  });

  it("the Conflict shape contains no confidence-derived field", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", price: 49 },
      intent: "researcher's pricing observation from g2",
      agent: "researcher",
      confidence: { score: 0.9 },
    });
    await field.write({
      entry: { topic: "pricing", price: 39 },
      intent: "fact-checker's correction after verifying the source",
      agent: "fact-checker",
      confidence: { score: 0.1 },
    });

    const result = await field.reckon({ agent: "writer", topic: "pricing" });
    const conflict = result.conflicts[0];
    expect(conflict && Object.keys(conflict).sort()).toEqual(["a", "b", "keys"]);
  });

  it("adding confidence to every entry in a field leaves the full attune result order identical", async () => {
    const plainField = createField();
    const confidentField = createField();

    await plainField.write({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "a" });
    await plainField.write({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "b" });
    await plainField.write({ entry: { topic: "x", n: 3 }, intent: INTENT, agent: "c" });

    await confidentField.write({
      entry: { topic: "x", n: 1 },
      intent: INTENT,
      agent: "a",
      confidence: { score: 0.1 },
    });
    await confidentField.write({
      entry: { topic: "x", n: 2 },
      intent: INTENT,
      agent: "b",
      confidence: { score: 0.9 },
    });
    await confidentField.write({
      entry: { topic: "x", n: 3 },
      intent: INTENT,
      agent: "c",
      confidence: { score: 0.5 },
    });

    const plainOrder = (await plainField.attune({ agent: "writer", topic: "x" })).map(
      (e) => (e.entry as { n: number }).n,
    );
    const confidentOrder = (await confidentField.attune({ agent: "writer", topic: "x" })).map(
      (e) => (e.entry as { n: number }).n,
    );

    expect(confidentOrder).toEqual(plainOrder);
  });
});
