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
    expect(result.map((r) => r.agent)).toEqual(["researcher", "strategist"]);
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

describe("field.attune() — order preservation", () => {
  it("returns entries in write order", async () => {
    const field = createField();
    await field.write({ entry: { n: 1 }, intent: "first write", agent: "a" });
    await field.write({ entry: { n: 2 }, intent: "second write", agent: "b" });
    await field.write({ entry: { n: 3 }, intent: "third write", agent: "a" });
    await field.write({ entry: { n: 4 }, intent: "fourth write", agent: "b" });
    const result = await field.attune({ agent: "writer" });
    expect(result.map((r) => r.entry.n)).toEqual([1, 2, 3, 4]);
  });

  it("preserves order after agent filtering", async () => {
    const field = createField();
    await field.write({ entry: { n: 1 }, intent: "first write", agent: "writer" });
    await field.write({ entry: { n: 2 }, intent: "second write", agent: "researcher" });
    await field.write({ entry: { n: 3 }, intent: "third write", agent: "writer" });
    await field.write({ entry: { n: 4 }, intent: "fourth write", agent: "researcher" });
    const result = await field.attune({ agent: "writer" });
    expect(result.map((r) => r.entry.n)).toEqual([2, 4]);
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
