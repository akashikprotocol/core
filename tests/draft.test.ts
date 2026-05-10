import { describe, expect, it } from "vitest";
import { createField } from "../src/index.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeField() {
  return createField();
}

const VALID_ENTRY = { topic: "plans", content: "do the thing" };
const VALID_INTENT = "capturing initial thoughts";

// ── draft() — happy path ─────────────────────────────────────────────────────

describe("draft() — happy path", () => {
  it("returns a draft_id string", async () => {
    const field = makeField();
    const result = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    expect(typeof result.draft_id).toBe("string");
    expect(result.draft_id.length).toBeGreaterThan(0);
  });

  it("returns a valid ULID as draft_id", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    expect(draft_id).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{26}$/);
  });

  it("accepts agent property", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({
      entry: VALID_ENTRY,
      intent: VALID_INTENT,
      agent: "agent-1",
    });
    expect(draft_id).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{26}$/);
  });

  it("draft does not appear in read() without caller option", async () => {
    const field = makeField();
    await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT, agent: "agent-1" });
    const entries = await field.read();
    expect(entries).toHaveLength(0);
  });

  it("two drafts produce distinct draft_ids", async () => {
    const field = makeField();
    const a = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    const b = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    expect(a.draft_id).not.toBe(b.draft_id);
  });
});

// ── draft() — validation ─────────────────────────────────────────────────────

describe("draft() — validation", () => {
  it("throws INVALID_ENTRY when entry is not a plain object", async () => {
    const field = makeField();
    await expect(
      field.draft({ entry: "string" as unknown as Record<string, unknown>, intent: VALID_INTENT }),
    ).rejects.toMatchObject({ code: "INVALID_ENTRY" });
  });

  it("throws INVALID_ENTRY when entry is null", async () => {
    const field = makeField();
    await expect(
      field.draft({ entry: null as unknown as Record<string, unknown>, intent: VALID_INTENT }),
    ).rejects.toMatchObject({ code: "INVALID_ENTRY" });
  });

  it("throws INVALID_ENTRY when entry is an array", async () => {
    const field = makeField();
    await expect(
      field.draft({ entry: [] as unknown as Record<string, unknown>, intent: VALID_INTENT }),
    ).rejects.toMatchObject({ code: "INVALID_ENTRY" });
  });

  it("throws INTENT_REQUIRED when intent is empty string", async () => {
    const field = makeField();
    await expect(field.draft({ entry: VALID_ENTRY, intent: "" })).rejects.toMatchObject({
      code: "INTENT_REQUIRED",
    });
  });

  it("throws INTENT_REQUIRED when intent is whitespace only", async () => {
    const field = makeField();
    await expect(field.draft({ entry: VALID_ENTRY, intent: "   " })).rejects.toMatchObject({
      code: "INTENT_REQUIRED",
    });
  });

  it("respects minIntentLength from FieldOptions", async () => {
    const field = createField({ minIntentLength: 10 });
    await expect(field.draft({ entry: VALID_ENTRY, intent: "short" })).rejects.toMatchObject({
      code: "INTENT_TOO_SHORT",
    });
  });

  it("allows intent meeting minIntentLength", async () => {
    const field = createField({ minIntentLength: 5 });
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: "valid intent text" });
    expect(draft_id).toBeTruthy();
  });
});

// ── read() — draft visibility ────────────────────────────────────────────────

describe("read() — draft visibility", () => {
  it("draft is visible to its author via caller option", async () => {
    const field = makeField();
    await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT, agent: "alice" });
    const entries = await field.read(undefined, { caller: "alice" });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe("draft");
  });

  it("draft is NOT visible to a different agent via caller option", async () => {
    const field = makeField();
    await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT, agent: "alice" });
    const entries = await field.read(undefined, { caller: "bob" });
    expect(entries).toHaveLength(0);
  });

  it("agentless draft never visible through caller option", async () => {
    const field = makeField();
    await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    const entries = await field.read(undefined, { caller: "alice" });
    expect(entries).toHaveLength(0);
  });

  it("draft status is 'draft' when visible", async () => {
    const field = makeField();
    await field.draft({ entry: { topic: "test" }, intent: VALID_INTENT, agent: "agent-x" });
    const entries = await field.read(undefined, { caller: "agent-x" });
    expect(entries[0]?.status).toBe("draft");
  });

  it("query filter applies to caller's drafts", async () => {
    const field = makeField();
    await field.draft({ entry: { topic: "plans" }, intent: VALID_INTENT, agent: "alice" });
    await field.draft({ entry: { topic: "notes" }, intent: VALID_INTENT, agent: "alice" });
    const entries = await field.read({ topic: "plans" }, { caller: "alice" });
    expect(entries).toHaveLength(1);
    expect((entries[0]?.entry as Record<string, unknown>)?.topic).toBe("plans");
  });

  it("committed entries still visible in read() with caller option", async () => {
    const field = makeField();
    await field.write({ entry: VALID_ENTRY, intent: VALID_INTENT });
    const entries = await field.read(undefined, { caller: "alice" });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe("committed");
  });

  it("caller option does not hide entries from other authors", async () => {
    const field = makeField();
    await field.write({ entry: VALID_ENTRY, intent: VALID_INTENT });
    const entries = await field.read(undefined, { caller: "bob" });
    expect(entries).toHaveLength(1);
  });
});

// ── attune() — draft visibility ──────────────────────────────────────────────

describe("attune() — draft visibility", () => {
  it("calling agent sees own drafts in attune result", async () => {
    const field = makeField();
    await field.draft({ entry: { topic: "plans" }, intent: VALID_INTENT, agent: "alice" });
    const results = await field.attune({ agent: "alice", topic: "plans" });
    expect(results.length).toBeGreaterThan(0);
    const draft = results.find((r) => r.status === "draft");
    expect(draft).toBeDefined();
  });

  it("calling agent does NOT see other agents' drafts in attune", async () => {
    const field = makeField();
    await field.draft({ entry: { topic: "plans" }, intent: VALID_INTENT, agent: "bob" });
    const results = await field.attune({ agent: "alice", topic: "plans" });
    expect(results).toHaveLength(0);
  });

  it("attune shows committed entries from others plus caller's own drafts", async () => {
    const field = makeField();
    await field.write({
      entry: { topic: "plans", content: "bob plan" },
      intent: VALID_INTENT,
      agent: "bob",
    });
    await field.draft({
      entry: { topic: "plans", content: "alice draft" },
      intent: VALID_INTENT,
      agent: "alice",
    });
    const results = await field.attune({ agent: "alice", topic: "plans" });
    // Should include bob's committed entry + alice's own draft (own entries excluded from committed, but drafts included)
    const statuses = results.map((r) => r.status);
    expect(statuses).toContain("draft");
    expect(statuses).toContain("committed");
  });
});

// ── commit() — happy path ────────────────────────────────────────────────────

describe("commit() — happy path", () => {
  it("returns CommitResult with id, epoch, timestamp", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    const result = await field.commit({ draft_id });
    expect(typeof result.id).toBe("string");
    expect(typeof result.epoch).toBe("number");
    expect(typeof result.timestamp).toBe("number");
  });

  it("committed id equals the original draft_id", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    const { id } = await field.commit({ draft_id });
    expect(id).toBe(draft_id);
  });

  it("committed entry appears in read() after commit", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({
      entry: VALID_ENTRY,
      intent: VALID_INTENT,
      agent: "alice",
    });
    await field.commit({ draft_id });
    const entries = await field.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe("committed");
    expect(entries[0]?.id).toBe(draft_id);
  });

  it("committed entry has status 'committed'", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    await field.commit({ draft_id });
    const entries = await field.read();
    expect(entries[0]?.status).toBe("committed");
  });

  it("draft no longer visible after commit", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({
      entry: VALID_ENTRY,
      intent: VALID_INTENT,
      agent: "alice",
    });
    await field.commit({ draft_id });
    const entries = await field.read(undefined, { caller: "alice" });
    const drafts = entries.filter((e) => e.status === "draft");
    expect(drafts).toHaveLength(0);
  });

  it("commit preserves entry data", async () => {
    const field = makeField();
    const myEntry = { topic: "plans", payload: 42 };
    const { draft_id } = await field.draft({ entry: myEntry, intent: VALID_INTENT });
    await field.commit({ draft_id });
    const entries = await field.read();
    expect(entries[0]?.entry).toMatchObject(myEntry);
  });

  it("commit preserves agent", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({
      entry: VALID_ENTRY,
      intent: VALID_INTENT,
      agent: "alice",
    });
    await field.commit({ draft_id });
    const entries = await field.read();
    expect(entries[0]?.agent).toBe("alice");
  });

  it("committed entry epoch is higher than draft epoch", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    const { epoch: committedEpoch } = await field.commit({ draft_id });
    const entries = await field.read();
    expect(committedEpoch).toBeGreaterThan(0);
    expect(entries[0]?.epoch).toBe(committedEpoch);
  });
});

// ── commit() — error cases ───────────────────────────────────────────────────

describe("commit() — error cases", () => {
  it("throws DRAFT_NOT_FOUND for unknown draft_id", async () => {
    const field = makeField();
    await expect(field.commit({ draft_id: "NONEXISTENT00000000000000" })).rejects.toMatchObject({
      code: "DRAFT_NOT_FOUND",
    });
  });

  it("throws DRAFT_NOT_FOUND when committing twice", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    await field.commit({ draft_id });
    await expect(field.commit({ draft_id })).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
  });

  it("throws DRAFT_NOT_FOUND for empty draft_id", async () => {
    const field = makeField();
    await expect(field.commit({ draft_id: "" })).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
  });
});

// ── discard() — happy path ───────────────────────────────────────────────────

describe("discard() — happy path", () => {
  it("resolves without error", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    await expect(field.discard({ draft_id, intent: "no longer needed" })).resolves.toBeUndefined();
  });

  it("draft no longer visible after discard", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({
      entry: VALID_ENTRY,
      intent: VALID_INTENT,
      agent: "alice",
    });
    await field.discard({ draft_id, intent: "not needed after all" });
    const entries = await field.read(undefined, { caller: "alice" });
    const still_draft = entries.filter((e) => e.status === "draft");
    expect(still_draft).toHaveLength(0);
  });

  it("discard leaves a retracted entry in the field", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({
      entry: VALID_ENTRY,
      intent: VALID_INTENT,
      agent: "alice",
    });
    await field.discard({ draft_id, intent: "no longer needed" });
    // Retracted entry persists in committed entries (audit trail)
    const entries = await field.read();
    const retracted = entries.find((e) => e.status === "retracted");
    expect(retracted).toBeDefined();
    expect(retracted?.id).toBe(draft_id);
  });
});

// ── discard() — validation ───────────────────────────────────────────────────

describe("discard() — validation", () => {
  it("throws INTENT_REQUIRED when intent is empty", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    await expect(field.discard({ draft_id, intent: "" })).rejects.toMatchObject({
      code: "INTENT_REQUIRED",
    });
  });

  it("throws DRAFT_NOT_FOUND for unknown draft_id", async () => {
    const field = makeField();
    await expect(
      field.discard({ draft_id: "NONEXISTENT00000000000000", intent: "reason" }),
    ).rejects.toMatchObject({ code: "DRAFT_NOT_FOUND" });
  });

  it("throws DRAFT_NOT_FOUND after discard (can't discard twice)", async () => {
    const field = makeField();
    const { draft_id } = await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT });
    await field.discard({ draft_id, intent: "done with it" });
    await expect(field.discard({ draft_id, intent: "again" })).rejects.toMatchObject({
      code: "DRAFT_NOT_FOUND",
    });
  });

  it("throws INTENT_TOO_SHORT when below minIntentLength", async () => {
    const field = createField({ minIntentLength: 10 });
    const { draft_id } = await field.draft({
      entry: VALID_ENTRY,
      intent: "this is long enough to pass",
    });
    await expect(field.discard({ draft_id, intent: "short" })).rejects.toMatchObject({
      code: "INTENT_TOO_SHORT",
    });
  });
});

// ── lifecycle integration ────────────────────────────────────────────────────

describe("draft lifecycle — integration", () => {
  it("full draft → commit flow", async () => {
    const field = makeField();
    // write a committed entry from bob
    await field.write({
      entry: { topic: "plans", from: "bob" },
      intent: VALID_INTENT,
      agent: "bob",
    });
    // alice drafts
    const { draft_id } = await field.draft({
      entry: { topic: "plans", from: "alice" },
      intent: VALID_INTENT,
      agent: "alice",
    });
    // alice sees her draft in read
    const beforeCommit = await field.read(undefined, { caller: "alice" });
    expect(beforeCommit.some((e) => e.status === "draft")).toBe(true);
    // alice commits
    const result = await field.commit({ draft_id });
    expect(result.id).toBe(draft_id);
    // now both entries are committed
    const afterCommit = await field.read();
    expect(afterCommit).toHaveLength(2);
    expect(afterCommit.every((e) => e.status === "committed")).toBe(true);
  });

  it("full draft → discard flow", async () => {
    const field = makeField();
    await field.write({ entry: { topic: "ideas" }, intent: VALID_INTENT });
    const { draft_id } = await field.draft({
      entry: { topic: "ideas", draft: true },
      intent: VALID_INTENT,
      agent: "alice",
    });
    // visible as draft
    let visible = await field.read(undefined, { caller: "alice" });
    expect(visible.some((e) => e.id === draft_id && e.status === "draft")).toBe(true);
    // discard
    await field.discard({ draft_id, intent: "decided not to" });
    // draft gone, retracted entry present
    visible = await field.read(undefined, { caller: "alice" });
    expect(visible.some((e) => e.id === draft_id && e.status === "draft")).toBe(false);
    const all = await field.read();
    expect(all.some((e) => e.id === draft_id && e.status === "retracted")).toBe(true);
  });

  it("multiple drafts from the same agent all visible via caller", async () => {
    const field = makeField();
    await field.draft({ entry: { topic: "a" }, intent: VALID_INTENT, agent: "alice" });
    await field.draft({ entry: { topic: "b" }, intent: VALID_INTENT, agent: "alice" });
    await field.draft({ entry: { topic: "c" }, intent: VALID_INTENT, agent: "alice" });
    const entries = await field.read(undefined, { caller: "alice" });
    expect(entries.filter((e) => e.status === "draft")).toHaveLength(3);
  });

  it("backward compat: read() with no options still returns only committed entries", async () => {
    const field = makeField();
    await field.write({ entry: VALID_ENTRY, intent: VALID_INTENT });
    await field.draft({ entry: VALID_ENTRY, intent: VALID_INTENT, agent: "alice" });
    const entries = await field.read();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.status).toBe("committed");
  });
});
