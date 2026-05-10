import { describe, expect, it } from "vitest";
import { protocolVersion, unwrap, wrap } from "../src/envelope.js";
import { AkashikError, createField } from "../src/index.js";

describe("envelope.wrap", () => {
  it("constructs a Message with all required fields", () => {
    const msg = wrap({
      type: "RECORD",
      sender: "researcher",
      epoch: 0,
      payload: { entry: { topic: "x" }, intent: "test test test" },
    });

    expect(msg.id).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{26}$/);
    expect(msg.type).toBe("RECORD");
    expect(msg.sender).toBe("researcher");
    expect(msg.epoch).toBe(0);
    expect(typeof msg.timestamp).toBe("number");
    expect(msg.timestamp).toBeGreaterThan(0);
    expect(msg.payload).toEqual({
      entry: { topic: "x" },
      intent: "test test test",
    });
  });

  it("includes correlation_id when provided", () => {
    const msg = wrap({
      type: "ATTUNE",
      sender: "writer",
      epoch: 5,
      payload: { topic: "x" },
      correlation_id: "corr-123",
    });
    expect(msg.correlation_id).toBe("corr-123");
  });

  it("omits correlation_id when not provided", () => {
    const msg = wrap({
      type: "RECORD",
      sender: "researcher",
      epoch: 0,
      payload: {},
    });
    expect("correlation_id" in msg).toBe(false);
  });

  it("generates unique ids across rapid calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      const msg = wrap({
        type: "RECORD",
        sender: "x",
        epoch: 0,
        payload: {},
      });
      ids.add(msg.id);
    }
    expect(ids.size).toBe(50);
  });
});

describe("envelope.unwrap — happy path", () => {
  it("accepts a well-formed envelope", () => {
    const msg = wrap({
      type: "RECORD",
      sender: "researcher",
      epoch: 0,
      payload: { entry: { topic: "x" } },
    });
    expect(() => unwrap(msg)).not.toThrow();
  });

  it("returns the same shape it received", () => {
    const original = wrap({
      type: "ATTUNE",
      sender: "writer",
      epoch: 3,
      payload: { topic: "pricing" },
    });
    const result = unwrap(original);
    expect(result).toEqual(original);
  });
});

describe("envelope.unwrap — invalid envelope rejection", () => {
  it("rejects null", () => {
    expect(() => unwrap(null)).toThrow(AkashikError);
    try {
      unwrap(null);
    } catch (e) {
      expect((e as AkashikError).code).toBe("INVALID_ENVELOPE");
    }
  });

  it("rejects an array", () => {
    expect(() => unwrap([])).toThrow(AkashikError);
  });

  it("rejects a string", () => {
    expect(() => unwrap("not an envelope")).toThrow(AkashikError);
  });

  it("rejects missing id", () => {
    const broken = { type: "RECORD", sender: "x", epoch: 0, timestamp: 1, payload: {} };
    expect(() => unwrap(broken)).toThrow(AkashikError);
  });

  it("rejects unknown type", () => {
    const broken = {
      id: "abc",
      type: "FROBNICATE",
      sender: "x",
      epoch: 0,
      timestamp: 1,
      payload: {},
    };
    expect(() => unwrap(broken)).toThrow(AkashikError);
  });

  it("rejects negative epoch", () => {
    const broken = {
      id: "abc",
      type: "RECORD",
      sender: "x",
      epoch: -1,
      timestamp: 1,
      payload: {},
    };
    expect(() => unwrap(broken)).toThrow(AkashikError);
  });

  it("rejects non-integer epoch", () => {
    const broken = {
      id: "abc",
      type: "RECORD",
      sender: "x",
      epoch: 1.5,
      timestamp: 1,
      payload: {},
    };
    expect(() => unwrap(broken)).toThrow(AkashikError);
  });

  it("rejects payload that is not a plain object", () => {
    const broken = {
      id: "abc",
      type: "RECORD",
      sender: "x",
      epoch: 0,
      timestamp: 1,
      payload: "string payload",
    };
    expect(() => unwrap(broken)).toThrow(AkashikError);
  });

  it("rejects non-string correlation_id when present", () => {
    const broken = {
      id: "abc",
      type: "RECORD",
      sender: "x",
      epoch: 0,
      timestamp: 1,
      payload: {},
      correlation_id: 12345,
    };
    expect(() => unwrap(broken)).toThrow(AkashikError);
  });
});

describe("envelope integration with field operations", () => {
  it("write() routes through the envelope without changing public behaviour", async () => {
    const field = createField();
    const result = await field.write({
      entry: { topic: "x" },
      intent: "writing for envelope integration test",
      agent: "researcher",
    });
    expect(result.id).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{26}$/);
    expect(typeof result.timestamp).toBe("number");
  });

  it("attune() routes through the envelope without changing public behaviour", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "writing for envelope integration test",
      agent: "researcher",
    });
    const result = await field.attune({ agent: "writer" });
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("read() does NOT route through the envelope (per design)", async () => {
    // read is a developer convenience, not a protocol operation.
    // This test exists to lock that decision: changing it would mean
    // adding a "READ" MessageType to the union, which is a design change.
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "writing for envelope integration test",
    });
    const result = await field.read();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("protocol version", () => {
  it("returns the v0.2 protocol version", () => {
    expect(protocolVersion()).toBe("0.2");
  });
});
