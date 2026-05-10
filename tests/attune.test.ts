import { describe, expect, it } from "vitest";
import { AkashikError, createField } from "../src/index.js";

describe("field.attune() — basic surfacing", () => {
  it("returns empty array when field is empty", async () => {
    const field = createField();
    const result = await field.attune({ agent: "writer" });
    expect(result).toEqual([]);
  });

  it("surfaces entries written by other agents", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing" },
      intent: "researcher logging pricing finding",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "writer" });
    expect(result).toHaveLength(1);
    expect(result[0]?.agent).toBe("researcher");
  });

  it("excludes entries authored by the calling agent", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "writer logging its own note",
      agent: "writer",
    });
    const result = await field.attune({ agent: "writer" });
    expect(result).toEqual([]);
  });

  it("excludes only the calling agent's writes when multiple agents present", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "a" },
      intent: "writer logging entry one",
      agent: "writer",
    });
    await field.write({
      entry: { topic: "b" },
      intent: "researcher logging entry two",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "c" },
      intent: "strategist logging entry three",
      agent: "strategist",
    });
    const result = await field.attune({ agent: "writer" });
    expect(result).toHaveLength(2);
    // Sorted by relevance: strategist has higher epoch → higher recency score → comes first.
    expect(result.map((r) => r.agent)).toEqual(["strategist", "researcher"]);
  });
});

describe("field.attune() — entries without an agent", () => {
  it("includes entries written without an agent field", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "anonymous" },
      intent: "logging without an agent identifier",
      // no agent field
    });
    const result = await field.attune({ agent: "writer" });
    expect(result).toHaveLength(1);
    expect(result[0]?.agent).toBeUndefined();
  });

  it("documents v0.1 behaviour: agent-less entries appear to all attuners", async () => {
    // This test names the v0.1 contract explicitly so future contributors
    // know the behaviour is deliberate, not accidental.
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "anonymous write that all should see",
    });
    const a = await field.attune({ agent: "agent-a" });
    const b = await field.attune({ agent: "agent-b" });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });
});

describe("field.attune() — topic filter", () => {
  it("filters by entry.topic when topic is supplied", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", value: "$49" },
      intent: "researcher logging pricing",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "research", note: "from a paper" },
      intent: "researcher logging research note",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "writer", topic: "pricing" });
    expect(result).toHaveLength(1);
    expect(result[0]?.entry.topic).toBe("pricing");
  });

  it("returns empty array when no entry matches the topic", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing" },
      intent: "researcher logging pricing",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "writer", topic: "nonexistent" });
    expect(result).toEqual([]);
  });

  it("does not match entries missing a topic field", async () => {
    const field = createField();
    await field.write({
      entry: { value: "$49" }, // no topic
      intent: "logging without topic",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "writer", topic: "pricing" });
    expect(result).toEqual([]);
  });

  it("uses strict equality for topic match", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing" },
      intent: "researcher logging pricing",
      agent: "researcher",
    });
    // "Pricing" with a capital P should not match.
    const result = await field.attune({ agent: "writer", topic: "Pricing" });
    expect(result).toEqual([]);
  });

  it("combines agent exclusion and topic filter", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing" },
      intent: "writer's own pricing note",
      agent: "writer",
    });
    await field.write({
      entry: { topic: "pricing" },
      intent: "researcher's pricing finding",
      agent: "researcher",
    });
    await field.write({
      entry: { topic: "research" },
      intent: "researcher's other note",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "writer", topic: "pricing" });
    expect(result).toHaveLength(1);
    expect(result[0]?.agent).toBe("researcher");
    expect(result[0]?.entry.topic).toBe("pricing");
  });
});

describe("field.attune() — relevance ordering", () => {
  it("returns entries sorted by relevance (recency) descending when no topic filter", async () => {
    const field = createField();
    await field.write({ entry: { n: 1 }, intent: "first write", agent: "a" });
    await field.write({ entry: { n: 2 }, intent: "second write", agent: "b" });
    await field.write({ entry: { n: 3 }, intent: "third write", agent: "a" });
    await field.write({ entry: { n: 4 }, intent: "fourth write", agent: "b" });
    const result = await field.attune({ agent: "writer" });
    // Sorted by recency desc: epoch 3 > 2 > 1 > 0 → n=4,3,2,1
    expect(result.map((r) => r.entry.n)).toEqual([4, 3, 2, 1]);
  });

  it("returns entries sorted by relevance after agent filtering", async () => {
    const field = createField();
    await field.write({ entry: { n: 1 }, intent: "first write", agent: "writer" });
    await field.write({ entry: { n: 2 }, intent: "second write", agent: "researcher" });
    await field.write({ entry: { n: 3 }, intent: "third write", agent: "writer" });
    await field.write({ entry: { n: 4 }, intent: "fourth write", agent: "researcher" });
    const result = await field.attune({ agent: "writer" });
    // Visible: researcher entries (n=2 epoch 1, n=4 epoch 3). n=4 is newer → comes first.
    expect(result.map((r) => r.entry.n)).toEqual([4, 2]);
  });
});

describe("field.attune() — invalid input", () => {
  it("rejects when context is undefined", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally missing
      field.attune(),
    ).rejects.toMatchObject({
      name: "AkashikError",
      code: "AGENT_REQUIRED",
    });
  });

  it("rejects when context is null", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally null
      field.attune(null),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects when agent is missing", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally missing agent
      field.attune({}),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects when agent is empty string", async () => {
    const field = createField();
    await expect(field.attune({ agent: "" })).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects when agent is whitespace only", async () => {
    const field = createField();
    await expect(field.attune({ agent: "   " })).rejects.toMatchObject({
      code: "AGENT_REQUIRED",
    });
  });

  it("rejects when agent is not a string", async () => {
    const field = createField();
    await expect(
      field.attune({
        // @ts-expect-error — intentionally wrong type
        agent: 12345,
      }),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("AGENT_REQUIRED error is an instance of AkashikError", async () => {
    const field = createField();
    try {
      // @ts-expect-error — intentionally invalid
      await field.attune({});
    } catch (e) {
      expect(e).toBeInstanceOf(AkashikError);
      expect((e as AkashikError).code).toBe("AGENT_REQUIRED");
    }
  });
});

describe("field.attune() — return shape", () => {
  it("returns full FieldEntry shape with intent intact", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing" },
      intent: "this intent must survive into attune results",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "writer" });
    expect(result[0]?.intent).toBe("this intent must survive into attune results");
  });

  it("returned array does not mutate internal state", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "writing entry one for mutation test",
      agent: "researcher",
    });
    const result1 = await field.attune({ agent: "writer" });
    result1.length = 0;
    const result2 = await field.attune({ agent: "writer" });
    expect(result2).toHaveLength(1);
  });
});

describe("field.attune() — Story 3 relevance scoring", () => {
  it("returns entries sorted by relevance descending", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "different" },
      intent: "low relevance entry",
      agent: "w",
    });
    await field.write({
      entry: { topic: "pricing" },
      intent: "high relevance entry",
      agent: "w",
    });
    const result = await field.attune({ agent: "caller", topic: "pricing" });
    expect(result[0]?.entry.topic).toBe("pricing");
  });

  it("includes relevance_score in [0, 1]", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: "test entry", agent: "w" });
    const result = await field.attune({ agent: "caller", topic: "x" });
    expect(result[0]?.relevance_score).toBeGreaterThanOrEqual(0);
    expect(result[0]?.relevance_score).toBeLessThanOrEqual(1);
  });

  it("includes relevance_reason with components and summary", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: "test entry", agent: "w" });
    const result = await field.attune({ agent: "caller", topic: "x" });
    const entry = result[0];
    expect(entry?.relevance_reason).toBeDefined();
    expect(entry?.relevance_reason.components).toBeDefined();
    expect(entry?.relevance_reason.components.topic).toBeGreaterThanOrEqual(0);
    expect(typeof entry?.relevance_reason.summary).toBe("string");
  });

  it("ties on score break by epoch descending (newer wins)", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing" },
      intent: "first entry written",
      agent: "w1",
    });
    await field.write({
      entry: { topic: "pricing" },
      intent: "second entry written",
      agent: "w2",
    });
    const result = await field.attune({ agent: "caller", topic: "pricing" });
    expect(result[0]?.epoch).toBeGreaterThan(result[1]?.epoch ?? -1);
  });

  it("uses session-registered roles for role match scoring", async () => {
    const field = createField();
    await field.register({ id: "writer-1", role: "researcher" });
    await field.register({ id: "caller-1", role: "researcher" });
    await field.write({ entry: { topic: "x" }, intent: "writer entry", agent: "writer-1" });
    const result = await field.attune({ agent: "caller-1", topic: "x" });
    expect(result[0]?.relevance_reason.components.role).toBe(0.2);
  });

  it("contributes 0 to role component when roles differ", async () => {
    const field = createField();
    await field.register({ id: "writer-1", role: "researcher" });
    await field.register({ id: "caller-1", role: "writer" });
    await field.write({ entry: { topic: "x" }, intent: "writer entry", agent: "writer-1" });
    const result = await field.attune({ agent: "caller-1", topic: "x" });
    expect(result[0]?.relevance_reason.components.role).toBe(0);
  });

  it("all FieldEntry fields are preserved on returned entries", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x", value: 42 },
      intent: "preserving all fields",
      agent: "w",
    });
    const result = await field.attune({ agent: "caller" });
    const e = result[0];
    expect(typeof e?.id).toBe("string");
    expect(typeof e?.timestamp).toBe("number");
    expect(typeof e?.epoch).toBe("number");
    expect(e?.status).toBe("committed");
    expect(e?.entry.value).toBe(42);
    expect(e?.intent).toBe("preserving all fields");
  });
});
