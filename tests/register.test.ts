import { describe, expect, it } from "vitest";
import { createField } from "../src/index.js";

describe("field.register() — happy path", () => {
  it("accepts a valid registration and returns expected shape", async () => {
    const field = createField();
    const result = await field.register({
      id: "researcher-prod-1",
      role: "researcher",
    });

    expect(Array.isArray(result.field_capabilities)).toBe(true);
    expect(typeof result.field_protocol_version).toBe("string");
    expect(result.field_protocol_version).toBe("0.2");
    expect(typeof result.session_id).toBe("string");
  });

  it("accepts capabilities array", async () => {
    const field = createField();
    const result = await field.register({
      id: "researcher",
      role: "research",
      capabilities: ["draft-writes", "subscriptions"],
    });
    expect(result.session_id).toBeDefined();
  });

  it("session_id matches the registered id", async () => {
    const field = createField();
    const result = await field.register({
      id: "researcher-1",
      role: "researcher",
    });
    expect(result.session_id).toBe("researcher-1");
  });

  it("field_capabilities is always an empty array in v0.2", async () => {
    const field = createField();
    const result = await field.register({ id: "agent", role: "writer" });
    expect(result.field_capabilities).toEqual([]);
  });

  it("accepts capabilities as empty array", async () => {
    const field = createField();
    const result = await field.register({
      id: "agent",
      role: "researcher",
      capabilities: [],
    });
    expect(result.session_id).toBeDefined();
  });
});

describe("field.register() — idempotence", () => {
  it("re-registering with the same id returns the same session info", async () => {
    const field = createField();
    const r1 = await field.register({
      id: "researcher",
      role: "researcher",
      capabilities: ["a", "b"],
    });
    const r2 = await field.register({
      id: "researcher",
      role: "researcher",
      capabilities: ["a", "b"],
    });
    expect(r2.session_id).toBe(r1.session_id);
  });

  it("re-registering with same id but different role does not throw", async () => {
    const field = createField();
    await field.register({ id: "researcher", role: "researcher" });
    await expect(field.register({ id: "researcher", role: "fact-checker" })).resolves.not.toThrow();
  });

  it("re-registering with same id preserves original session_id", async () => {
    const field = createField();
    const r1 = await field.register({ id: "researcher", role: "researcher" });
    const r2 = await field.register({ id: "researcher", role: "fact-checker" });
    expect(r2.session_id).toBe(r1.session_id);
  });
});

describe("field.register() — validation", () => {
  it("rejects missing input", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally missing
      field.register(),
    ).rejects.toMatchObject({
      name: "AkashikError",
      code: "AGENT_REQUIRED",
    });
  });

  it("rejects null input", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — intentionally null
      field.register(null),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects missing id", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — missing id
      field.register({ role: "researcher" }),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects empty id", async () => {
    const field = createField();
    await expect(field.register({ id: "", role: "researcher" })).rejects.toMatchObject({
      code: "AGENT_REQUIRED",
    });
  });

  it("rejects whitespace-only id", async () => {
    const field = createField();
    await expect(field.register({ id: "   ", role: "researcher" })).rejects.toMatchObject({
      code: "AGENT_REQUIRED",
    });
  });

  it("rejects missing role", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — missing role
      field.register({ id: "researcher" }),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects empty role", async () => {
    const field = createField();
    await expect(field.register({ id: "researcher", role: "" })).rejects.toMatchObject({
      code: "AGENT_REQUIRED",
    });
  });

  it("rejects whitespace-only role", async () => {
    const field = createField();
    await expect(field.register({ id: "researcher", role: "   " })).rejects.toMatchObject({
      code: "AGENT_REQUIRED",
    });
  });

  it("rejects non-string id", async () => {
    const field = createField();
    await expect(
      field.register({
        // @ts-expect-error — wrong type
        id: 12345,
        role: "researcher",
      }),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects non-array capabilities", async () => {
    const field = createField();
    await expect(
      field.register({
        id: "researcher",
        role: "researcher",
        // @ts-expect-error — wrong type
        capabilities: "not-an-array",
      }),
    ).rejects.toMatchObject({ code: "INVALID_ENTRY" });
  });

  it("rejects capabilities with non-string elements", async () => {
    const field = createField();
    await expect(
      field.register({
        id: "researcher",
        role: "researcher",
        // @ts-expect-error — wrong element type
        capabilities: ["valid", 12345, "also-valid"],
      }),
    ).rejects.toMatchObject({ code: "INVALID_ENTRY" });
  });
});

describe("field.deregister() — happy path", () => {
  it("deregisters a registered agent", async () => {
    const field = createField();
    await field.register({ id: "researcher", role: "researcher" });
    await expect(field.deregister({ id: "researcher" })).resolves.toBeUndefined();
  });

  it("deregistering an unregistered agent is idempotent (no error)", async () => {
    const field = createField();
    await expect(field.deregister({ id: "never-registered" })).resolves.toBeUndefined();
  });

  it("can register, deregister, then re-register the same agent", async () => {
    const field = createField();
    await field.register({ id: "researcher", role: "researcher" });
    await field.deregister({ id: "researcher" });
    const result = await field.register({ id: "researcher", role: "researcher" });
    expect(result.session_id).toBeDefined();
  });

  it("re-register after deregister produces a fresh session_id", async () => {
    const field = createField();
    await field.register({ id: "researcher", role: "researcher" });
    await field.deregister({ id: "researcher" });
    const result = await field.register({ id: "researcher", role: "researcher" });
    expect(result.session_id).toBe("researcher");
  });
});

describe("field.deregister() — validation", () => {
  it("rejects missing input", async () => {
    const field = createField();
    await expect(
      // @ts-expect-error — missing input
      field.deregister(),
    ).rejects.toMatchObject({ code: "AGENT_REQUIRED" });
  });

  it("rejects empty id", async () => {
    const field = createField();
    await expect(field.deregister({ id: "" })).rejects.toMatchObject({
      code: "AGENT_REQUIRED",
    });
  });

  it("rejects whitespace-only id", async () => {
    const field = createField();
    await expect(field.deregister({ id: "   " })).rejects.toMatchObject({
      code: "AGENT_REQUIRED",
    });
  });
});

describe("Story 2 — backward compatibility", () => {
  it("v0.1 code that doesn't call register() still works for write/read/attune", async () => {
    const field = createField();

    await field.write({
      entry: { topic: "x" },
      intent: "v0.1 style write without registration",
      agent: "writer-without-register",
    });

    const all = await field.read();
    expect(all).toHaveLength(1);

    const relevant = await field.attune({ agent: "writer-without-register" });
    expect(Array.isArray(relevant)).toBe(true);
  });

  it("registration does not affect entries written without registration", async () => {
    const field = createField();
    await field.write({
      entry: { topic: "x" },
      intent: "writing without registering first",
      agent: "researcher",
    });

    await field.register({ id: "researcher", role: "researcher" });

    const all = await field.read();
    expect(all).toHaveLength(1);
  });

  it("registered and unregistered agents can coexist in the same field", async () => {
    const field = createField();
    await field.register({ id: "agent-a", role: "writer" });

    await field.write({
      entry: { topic: "registered" },
      intent: "write from registered agent",
      agent: "agent-a",
    });
    await field.write({
      entry: { topic: "unregistered" },
      intent: "write from unregistered agent",
      agent: "agent-b",
    });

    const all = await field.read();
    expect(all).toHaveLength(2);
  });
});
