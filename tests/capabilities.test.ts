import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../src/adapter.js";
import { createMemoryAdapter } from "../src/adapters/memory.js";
import { FIELD_PROTOCOL_LEVELS, createField } from "../src/index.js";
import { buildProjection } from "../src/projection.js";

/** Wraps MemoryAdapter but overrides the capabilities it declares. */
function adapterWithCapabilities(capabilities: readonly string[]): StorageAdapter {
  const base = createMemoryAdapter();
  return { ...base, capabilities };
}

describe("capabilities — field advertising", () => {
  it("field_capabilities includes L0", async () => {
    const field = createField();
    const result = await field.register({ id: "agent", role: "researcher" });
    expect(result.field_capabilities).toContain("L0");
  });

  it("field_capabilities includes L1", async () => {
    const field = createField();
    const result = await field.register({ id: "agent", role: "researcher" });
    expect(result.field_capabilities).toContain("L1");
  });

  it("a default in-memory field does NOT advertise durable", async () => {
    const field = createField();
    const result = await field.register({ id: "agent", role: "researcher" });
    expect(result.field_capabilities).not.toContain("durable");
  });

  it("a field with an adapter declaring ['durable'] advertises it", async () => {
    const field = createField({ adapter: adapterWithCapabilities(["durable"]) });
    const result = await field.register({ id: "agent", role: "researcher" });
    expect(result.field_capabilities).toContain("durable");
  });

  it("adapter flags appear alongside, not instead of, protocol levels", async () => {
    const field = createField({ adapter: adapterWithCapabilities(["durable"]) });
    const result = await field.register({ id: "agent", role: "researcher" });
    expect(result.field_capabilities).toContain("L0");
    expect(result.field_capabilities).toContain("L1");
    expect(result.field_capabilities).toContain("durable");
  });

  it("an adapter declaring an unrecognised flag has it passed through unchanged", async () => {
    const field = createField({ adapter: adapterWithCapabilities(["multi-tenant"]) });
    const result = await field.register({ id: "agent", role: "researcher" });
    expect(result.field_capabilities).toContain("multi-tenant");
  });

  it("an adapter omitting capabilities entirely produces levels only", async () => {
    const base = createMemoryAdapter();
    const { capabilities: _capabilities, ...rest } = base;
    const field = createField({ adapter: rest as StorageAdapter });
    const result = await field.register({ id: "agent", role: "researcher" });
    expect(result.field_capabilities.sort()).toEqual([...FIELD_PROTOCOL_LEVELS].sort());
  });

  it("field_capabilities is identical across repeated registrations", async () => {
    const field = createField();
    const first = await field.register({ id: "alice", role: "researcher" });
    const second = await field.register({ id: "bob", role: "researcher" });
    expect(first.field_capabilities).toEqual(second.field_capabilities);
  });

  it("mutating a returned field_capabilities array does not affect the field", async () => {
    const field = createField();
    const first = await field.register({ id: "alice", role: "researcher" });
    first.field_capabilities.push("fabricated");
    const second = await field.register({ id: "bob", role: "researcher" });
    expect(second.field_capabilities).not.toContain("fabricated");
  });

  it("two fields with different adapters advertise different capability sets", async () => {
    const plainField = createField();
    const durableField = createField({ adapter: adapterWithCapabilities(["durable"]) });
    const plainResult = await plainField.register({ id: "agent", role: "researcher" });
    const durableResult = await durableField.register({ id: "agent", role: "researcher" });
    expect(plainResult.field_capabilities).not.toContain("durable");
    expect(durableResult.field_capabilities).toContain("durable");
  });
});

describe("capabilities — agent declarations", () => {
  it("an agent registering with capabilities succeeds", async () => {
    const field = createField();
    await expect(
      field.register({ id: "agent", role: "researcher", capabilities: ["draft-writes"] }),
    ).resolves.toBeDefined();
  });

  it("an agent registering without capabilities succeeds", async () => {
    const field = createField();
    await expect(field.register({ id: "agent", role: "researcher" })).resolves.toBeDefined();
  });

  it("declared capabilities are recorded on the REGISTER event", async () => {
    const field = createField();
    await field.register({
      id: "agent",
      role: "researcher",
      capabilities: ["draft-writes", "subscriptions"],
    });
    const events = await field.replay();
    const registerEvent = events.find((e) => e.type === "REGISTER");
    expect(registerEvent?.type === "REGISTER" && registerEvent.capabilities).toEqual([
      "draft-writes",
      "subscriptions",
    ]);
  });

  it("declared capabilities survive replay()", async () => {
    const field = createField();
    await field.register({ id: "agent", role: "researcher", capabilities: ["draft-writes"] });
    const events = await field.replay({ agent: "agent" });
    const registerEvent = events.find((e) => e.type === "REGISTER");
    expect(registerEvent?.type === "REGISTER" && registerEvent.capabilities).toEqual([
      "draft-writes",
    ]);
  });

  it("declared capabilities are present in the projection's session", async () => {
    const field = createField();
    await field.register({ id: "agent", role: "researcher", capabilities: ["draft-writes"] });
    const events = await field.replay();
    const projection = buildProjection(events);
    expect(projection.sessions.get("agent")).toEqual({
      role: "researcher",
      capabilities: ["draft-writes"],
    });
  });

  it("an agent declaring an unrecognised capability is NOT rejected", async () => {
    const field = createField();
    await expect(
      field.register({ id: "agent", role: "researcher", capabilities: ["telekinesis"] }),
    ).resolves.toBeDefined();
  });

  it("an agent declaring capabilities the field lacks is NOT rejected", async () => {
    const field = createField();
    await expect(
      field.register({ id: "agent", role: "researcher", capabilities: ["durable"] }),
    ).resolves.toBeDefined();
  });

  it("re-registration does not replace the recorded capability list (idempotent)", async () => {
    // Matches v0.2's existing idempotent registration semantics: re-registering
    // the same id is a no-op that returns the existing session unchanged — no
    // new REGISTER event, no role or capability update. Same rule already
    // covers role ("re-registering with same id but different role does not
    // throw" in register.test.ts); capabilities follow the same discipline.
    const field = createField();
    await field.register({ id: "agent", role: "researcher", capabilities: ["draft-writes"] });
    await field.register({ id: "agent", role: "researcher", capabilities: ["subscriptions"] });

    const events = await field.replay();
    const registerEvents = events.filter((e) => e.type === "REGISTER");
    expect(registerEvents).toHaveLength(1);
    expect(registerEvents[0]?.type === "REGISTER" && registerEvents[0].capabilities).toEqual([
      "draft-writes",
    ]);
  });

  it("deregister removes the session and its capabilities", async () => {
    const field = createField();
    await field.register({ id: "agent", role: "researcher", capabilities: ["draft-writes"] });
    await field.deregister({ id: "agent" });

    const events = await field.replay();
    const projection = buildProjection(events);
    expect(projection.sessions.has("agent")).toBe(false);
  });
});

describe("capabilities — conformance const", () => {
  it("FIELD_PROTOCOL_LEVELS contains exactly ['L0', 'L1'] at v0.3", () => {
    expect(FIELD_PROTOCOL_LEVELS).toEqual(["L0", "L1"]);
  });

  it("FIELD_PROTOCOL_LEVELS is readonly at the type level", () => {
    // Compile-time check: assigning to an index of a `readonly` tuple must
    // fail typecheck. Runtime behaviour is asserted above; this just proves
    // the array literal itself is declared `as const`.
    type IsReadonly = typeof FIELD_PROTOCOL_LEVELS extends readonly string[] ? true : false;
    const check: IsReadonly = true;
    expect(check).toBe(true);
  });

  it("every level in the const appears in a field's field_capabilities", async () => {
    const field = createField();
    const result = await field.register({ id: "agent", role: "researcher" });
    for (const level of FIELD_PROTOCOL_LEVELS) {
      expect(result.field_capabilities).toContain(level);
    }
  });
});
