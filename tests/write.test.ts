import { describe, expect, it, vi } from "vitest";
import { AkashikError, createField } from "../src/index.js";

describe("createField()", () => {
  it("returns a Field with a write method", () => {
    const field = createField();
    expect(typeof field.write).toBe("function");
  });

  it("accepts no options", () => {
    expect(() => createField()).not.toThrow();
  });

  it("accepts a custom minIntentLength", () => {
    expect(() => createField({ minIntentLength: 5 })).not.toThrow();
  });
});

describe("field.write() — happy path", () => {
  it("writes a valid entry and returns id + timestamp", async () => {
    const field = createField();
    const result = await field.write({
      entry: { topic: "pricing", value: "$49" },
      intent: "proposing the launch price",
    });
    expect(result.id).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{26}$/); // ULID format
    expect(typeof result.timestamp).toBe("number");
    expect(result.timestamp).toBeGreaterThan(0);
    expect(result.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it("accepts an optional agent field", async () => {
    const field = createField();
    const result = await field.write({
      entry: { topic: "pricing" },
      intent: "logging an entry from the researcher",
      agent: "researcher",
    });
    expect(result.id).toBeDefined();
  });

  it("returns unique ids across rapid writes", async () => {
    const field = createField();
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const r = await field.write({
        entry: { i },
        intent: "stress testing id uniqueness",
      });
      ids.add(r.id);
    }
    expect(ids.size).toBe(50);
  });

  it("returns timestamps in Unix milliseconds", async () => {
    const before = Date.now();
    const field = createField();
    const result = await field.write({
      entry: { topic: "x" },
      intent: "checking timestamp shape",
    });
    const after = Date.now();
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });
});

describe("field.write() — intent enforcement", () => {
  it("rejects when intent is undefined", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally omitting intent
      field.write({ entry: { topic: "x" } }),
    ).rejects.toMatchObject({
      name: "AkashikError",
      code: "INTENT_REQUIRED",
    });
  });

  it("rejects when intent is null", async () => {
    const field = createField();
    await expect(
      field.write({
        entry: { topic: "x" },
        // @ts-expect-error — intentionally null
        intent: null,
      }),
    ).rejects.toMatchObject({ code: "INTENT_REQUIRED" });
  });

  it("rejects when intent is not a string", async () => {
    const field = createField();
    await expect(
      field.write({
        entry: { topic: "x" },
        // @ts-expect-error — intentionally wrong type
        intent: 12345,
      }),
    ).rejects.toMatchObject({ code: "INTENT_REQUIRED" });
  });

  it("rejects intent under default minimum (10 chars)", async () => {
    const field = createField();
    await expect(
      field.write({ entry: { topic: "x" }, intent: "too short" }), // 9 chars
    ).rejects.toMatchObject({ code: "INTENT_TOO_SHORT" });
  });

  it("accepts intent at exactly default minimum (10 chars)", async () => {
    const field = createField();
    await expect(
      field.write({ entry: { topic: "x" }, intent: "1234567890" }), // 10 chars
    ).resolves.toBeDefined();
  });

  it("trims whitespace before checking intent length", async () => {
    const field = createField();
    await expect(
      field.write({ entry: { topic: "x" }, intent: "   short   " }), // trims to 5 chars
    ).rejects.toMatchObject({ code: "INTENT_TOO_SHORT" });
  });

  it("respects a custom minIntentLength", async () => {
    const field = createField({ minIntentLength: 5 });
    await expect(
      field.write({ entry: { topic: "x" }, intent: "1234" }), // 4 chars
    ).rejects.toMatchObject({ code: "INTENT_TOO_SHORT" });
    await expect(
      field.write({ entry: { topic: "x" }, intent: "12345" }), // 5 chars
    ).resolves.toBeDefined();
  });

  it("includes diagnostic details on INTENT_TOO_SHORT", async () => {
    const field = createField({ minIntentLength: 15 });
    try {
      await field.write({ entry: { topic: "x" }, intent: "ten chars!" }); // 10 chars
      throw new Error("should have rejected");
    } catch (e) {
      expect(e).toBeInstanceOf(AkashikError);
      const err = e as InstanceType<typeof AkashikError>;
      expect(err.code).toBe("INTENT_TOO_SHORT");
      expect(err.details).toMatchObject({ minIntentLength: 15, actualLength: 10 });
    }
  });
});

describe("field.write() — minIntentLength: 0 escape hatch", () => {
  it("accepts any intent including empty string", async () => {
    const field = createField({ minIntentLength: 0 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(field.write({ entry: { topic: "x" }, intent: "" })).resolves.toBeDefined();
    warnSpy.mockRestore();
  });

  it("warns on first write when intent enforcement is disabled", async () => {
    const field = createField({ minIntentLength: 0 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await field.write({ entry: { topic: "x" }, intent: "" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain("minIntentLength is 0");
    warnSpy.mockRestore();
  });

  it("only warns once across multiple writes", async () => {
    const field = createField({ minIntentLength: 0 });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await field.write({ entry: { topic: "x" }, intent: "" });
    await field.write({ entry: { topic: "x" }, intent: "" });
    await field.write({ entry: { topic: "x" }, intent: "" });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

describe("field.write() — entry validation", () => {
  it("rejects when entry is null", async () => {
    const field = createField();
    await expect(
      field.write({
        // @ts-expect-error — intentionally null
        entry: null,
        intent: "validating entry shape",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ENTRY" });
  });

  it("rejects when entry is a string", async () => {
    const field = createField();
    await expect(
      field.write({
        // @ts-expect-error — intentionally wrong type
        entry: "not an object",
        intent: "validating entry shape",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ENTRY" });
  });

  it("rejects when entry is an array", async () => {
    const field = createField();
    await expect(
      field.write({
        // @ts-expect-error — arrays are not plain objects
        entry: [1, 2, 3],
        intent: "validating entry shape",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ENTRY" });
  });

  it("accepts an empty object as entry", async () => {
    const field = createField();
    await expect(
      field.write({ entry: {}, intent: "empty entry should be fine" }),
    ).resolves.toBeDefined();
  });

  it("accepts deeply nested entries", async () => {
    const field = createField();
    await expect(
      field.write({
        entry: { meta: { source: { url: "x", note: { tag: "y" } } } },
        intent: "deeply nested entries should be accepted",
      }),
    ).resolves.toBeDefined();
  });
});

describe("AkashikError", () => {
  it("is an instance of Error", async () => {
    const field = createField();
    try {
      await field.write({
        entry: { topic: "x" },
        intent: "a",
      });
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(AkashikError);
    }
  });

  it("carries a name of 'AkashikError'", async () => {
    const field = createField();
    try {
      await field.write({ entry: { topic: "x" }, intent: "a" });
    } catch (e) {
      expect((e as Error).name).toBe("AkashikError");
    }
  });

  it("carries a typed code", async () => {
    const field = createField();
    try {
      await field.write({ entry: { topic: "x" }, intent: "a" });
    } catch (e) {
      const err = e as InstanceType<typeof AkashikError>;
      expect(err.code).toBe("INTENT_TOO_SHORT");
    }
  });
});
