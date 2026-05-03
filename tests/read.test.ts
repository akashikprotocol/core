import { describe, expect, it } from "vitest";
import { AkashikError, createField } from "../src/index.js";

describe("field.read() — no query", () => {
  it("returns empty array when field is empty", async () => {
    const field = createField();
    const result = await field.read();
    expect(result).toEqual([]);
  });

  it("returns all entries when called with no argument", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: "first write here" });
    await field.write({ entry: { topic: "b" }, intent: "second write here" });
    const result = await field.read();
    expect(result).toHaveLength(2);
    expect(result[0]?.entry).toEqual({ topic: "a" });
    expect(result[1]?.entry).toEqual({ topic: "b" });
  });

  it("returns all entries when called with empty object", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: "writing entry one" });
    await field.write({ entry: { topic: "b" }, intent: "writing entry two" });
    const result = await field.read({});
    expect(result).toHaveLength(2);
  });

  it("preserves write order (oldest first)", async () => {
    const field = createField();
    await field.write({ entry: { n: 1 }, intent: "first in sequence" });
    await field.write({ entry: { n: 2 }, intent: "second in sequence" });
    await field.write({ entry: { n: 3 }, intent: "third in sequence" });
    const result = await field.read();
    expect(result.map((r) => r.entry.n)).toEqual([1, 2, 3]);
  });
});

describe("field.read() — primitive matching", () => {
  it("filters by string equality", async () => {
    const field = createField();
    await field.write({ entry: { topic: "pricing" }, intent: "logging pricing" });
    await field.write({ entry: { topic: "research" }, intent: "logging research" });
    const result = await field.read({ topic: "pricing" });
    expect(result).toHaveLength(1);
    expect(result[0]?.entry.topic).toBe("pricing");
  });

  it("filters by number equality", async () => {
    const field = createField();
    await field.write({ entry: { count: 5 }, intent: "logging a number" });
    await field.write({ entry: { count: 10 }, intent: "logging another number" });
    const result = await field.read({ count: 5 });
    expect(result).toHaveLength(1);
    expect(result[0]?.entry.count).toBe(5);
  });

  it("filters by boolean equality", async () => {
    const field = createField();
    await field.write({ entry: { done: true }, intent: "marking as done" });
    await field.write({ entry: { done: false }, intent: "marking as undone" });
    const result = await field.read({ done: true });
    expect(result).toHaveLength(1);
    expect(result[0]?.entry.done).toBe(true);
  });

  it("requires all query keys to match", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "pricing", region: "uk" },
      intent: "uk pricing entry",
    });
    await field.write({
      entry: { topic: "pricing", region: "us" },
      intent: "us pricing entry",
    });
    await field.write({
      entry: { topic: "research", region: "uk" },
      intent: "uk research entry",
    });
    const result = await field.read({ topic: "pricing", region: "uk" });
    expect(result).toHaveLength(1);
    expect(result[0]?.entry).toEqual({ topic: "pricing", region: "uk" });
  });

  it("returns empty array when nothing matches", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: "writing topic a" });
    const result = await field.read({ topic: "nonexistent" });
    expect(result).toEqual([]);
  });

  it("does not match if entry is missing the queried key", async () => {
    const field = createField();
    await field.write({ entry: { topic: "x" }, intent: "entry with no region" });
    const result = await field.read({ region: "uk" });
    expect(result).toEqual([]);
  });

  it("uses strict equality (no type coercion)", async () => {
    const field = createField();
    await field.write({ entry: { count: 5 }, intent: "writing the number 5" });
    // Querying for the string "5" should NOT match the number 5.
    const result = await field.read({ count: "5" });
    expect(result).toEqual([]);
  });
});

describe("field.read() — object value matching (shallow)", () => {
  it("matches entries where every key in object query matches", async () => {
    const field = createField();
    await field.write({
      entry: { meta: { source: "blog", author: "ak" } },
      intent: "writing meta with source blog",
    });
    await field.write({
      entry: { meta: { source: "podcast", author: "sahil" } },
      intent: "writing meta with source podcast",
    });
    const result = await field.read({ meta: { source: "blog" } });
    expect(result).toHaveLength(1);
    expect(result[0]?.entry.meta).toMatchObject({ source: "blog" });
  });

  it("allows extra keys on the entry side", async () => {
    const field = createField();
    await field.write({
      entry: { meta: { source: "blog", author: "ak", date: "2026-01-01" } },
      intent: "writing meta with extra keys",
    });
    const result = await field.read({ meta: { source: "blog" } });
    expect(result).toHaveLength(1);
  });

  it("requires every key in object query to match (multi-key)", async () => {
    const field = createField();
    await field.write({
      entry: { meta: { source: "blog", author: "ak" } },
      intent: "writing meta blog ak",
    });
    await field.write({
      entry: { meta: { source: "blog", author: "sahil" } },
      intent: "writing meta blog sahil",
    });
    const result = await field.read({ meta: { source: "blog", author: "ak" } });
    expect(result).toHaveLength(1);
  });

  it("does not match if entry value is not an object", async () => {
    const field = createField();
    await field.write({
      entry: { meta: "not an object" },
      intent: "entry with primitive meta",
    });
    const result = await field.read({ meta: { source: "blog" } });
    expect(result).toEqual([]);
  });

  it("does NOT perform deep matching (v0.2 behaviour)", async () => {
    // This test documents the v0.1 limitation explicitly.
    // Deep nesting does not recurse into shallow comparison.
    const field = createField();
    await field.write({
      entry: { meta: { source: { url: "https://example.com" } } },
      intent: "deeply nested entry for v0.2 doc test",
    });
    // Shallow per-key === comparison: query value `{ url: "..." }`
    // is compared to entry value `{ url: "..." }` using ===.
    // These are different object references, so === is false.
    // Result: no match. This is correct v0.1 behaviour.
    const result = await field.read({ meta: { source: { url: "https://example.com" } } });
    expect(result).toEqual([]);
  });
});

describe("field.read() — invalid queries", () => {
  it("rejects when query is null", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally null
      field.read(null),
    ).rejects.toMatchObject({
      name: "AkashikError",
      code: "INVALID_QUERY",
    });
  });

  it("rejects when query is a string", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally wrong type
      field.read("not a query"),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("rejects when query is a number", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally wrong type
      field.read(42),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("rejects when query is an array", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — arrays are not plain objects
      field.read([1, 2, 3]),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("INVALID_QUERY error is an instance of AkashikError", async () => {
    const field = createField();
    try {
      // @ts-expect-error — intentionally invalid
      await field.read("bad");
    } catch (e) {
      expect(e).toBeInstanceOf(AkashikError);
      expect((e as AkashikError).code).toBe("INVALID_QUERY");
    }
  });
});

describe("field.read() — entry shape", () => {
  it("returns full FieldEntry shape with id, timestamp, entry, intent", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "checking entry shape returned",
    });
    const result = await field.read();
    const entry = result[0];
    expect(entry).toBeDefined();
    expect(entry?.id).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{26}$/);
    expect(typeof entry?.timestamp).toBe("number");
    expect(entry?.entry).toEqual({ topic: "x" });
    expect(entry?.intent).toBe("checking entry shape returned");
  });

  it("includes agent when supplied on write", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "writing with agent specified",
      agent: "researcher",
    });
    const result = await field.read();
    expect(result[0]?.agent).toBe("researcher");
  });

  it("omits agent when not supplied on write", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "writing without agent",
    });
    const result = await field.read();
    expect(result[0]?.agent).toBeUndefined();
  });

  it("returned entries are not the internal array (mutation safety)", async () => {
    const field = createField();
    await field.write({ entry: { topic: "a" }, intent: "writing entry one" });
    const result1 = await field.read();
    result1.length = 0; // try to mutate the returned array
    const result2 = await field.read();
    expect(result2).toHaveLength(1); // internal state unaffected
  });
});
