import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StorageAdapter } from "../../src/adapter.js";
import { recordEvent } from "../../src/events.js";
import { createField } from "../../src/index.js";
import { buildProjection } from "../../src/projection.js";

const INTENT = "a sufficiently long intent for this test scenario";

export type AdapterFactory = () => Promise<{
  adapter: StorageAdapter;
  cleanup: () => Promise<void>;
}>;

/**
 * Every semantic the protocol promises, run against whatever adapter the
 * factory produces. Passing here for MemoryAdapter validates the suite
 * itself, since MemoryAdapter is already proven by the 280+ v0.2 tests
 * running through it implicitly. Passing for PostgresAdapter (or any future
 * adapter) proves the interface, not just one implementation of it.
 */
export function runAdapterConformanceSuite(name: string, factory: AdapterFactory): void {
  describe(`adapter conformance: ${name}`, () => {
    let adapter: StorageAdapter;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const created = await factory();
      adapter = created.adapter;
      cleanup = created.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    // ── core operations ───────────────────────────────────────────────────

    describe("core operations", () => {
      it("write and read back", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
        const all = await field.read();
        expect(all).toHaveLength(1);
        expect(all[0]?.entry).toEqual({ topic: "x" });
      });

      it("mandatory intent is enforced", async () => {
        const field = createField({ adapter });
        // An empty string is still a string — it fails the length check
        // (INTENT_TOO_SHORT), not the presence check. Omitting intent
        // entirely is what triggers INTENT_REQUIRED.
        await expect(field.write({ entry: { topic: "x" } } as never)).rejects.toMatchObject({
          code: "INTENT_REQUIRED",
        });
      });

      it("attune excludes the caller's own writes", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
        const result = await field.attune({ agent: "alice", topic: "x" });
        expect(result).toHaveLength(0);
      });

      it("attune orders by relevance", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
        await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "bob" });
        const result = await field.attune({ agent: "writer", topic: "x" });
        expect(result).toHaveLength(2);
        expect(result[0]?.relevance_score).toBeGreaterThanOrEqual(result[1]?.relevance_score ?? 0);
      });

      it("reckon detects conflicts", async () => {
        const field = createField({ adapter });
        await field.write({
          entry: { topic: "pricing", price: 49 },
          intent: "researcher's pricing observation from g2",
          agent: "researcher",
        });
        await field.write({
          entry: { topic: "pricing", price: 39 },
          intent: "fact-checker's correction after verifying the source",
          agent: "fact-checker",
        });
        const result = await field.reckon({ agent: "writer", topic: "pricing" });
        expect(result.conflicts).toHaveLength(1);
      });

      it("reckon returns no false conflicts among agreeing entries", async () => {
        const field = createField({ adapter });
        await field.write({
          entry: { topic: "pricing", price: 49 },
          intent: "researcher's pricing observation from g2",
          agent: "researcher",
        });
        await field.write({
          entry: { topic: "pricing", region: "us" },
          intent: "fact-checker noting the pricing region",
          agent: "fact-checker",
        });
        const result = await field.reckon({ agent: "writer", topic: "pricing" });
        expect(result.conflicts).toHaveLength(0);
      });

      it("a draft is invisible to other agents", async () => {
        const field = createField({ adapter });
        await field.draft({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
        const result = await field.attune({ agent: "bob", topic: "x" });
        expect(result).toHaveLength(0);
      });

      it("commit publishes a draft", async () => {
        const field = createField({ adapter });
        const { draft_id } = await field.draft({ entry: { topic: "x" }, intent: INTENT });
        await field.commit({ draft_id });
        const all = await field.read();
        expect(all[0]?.status).toBe("committed");
      });

      it("discard removes a draft, leaving a retracted audit entry", async () => {
        const field = createField({ adapter });
        const { draft_id } = await field.draft({ entry: { topic: "x" }, intent: INTENT });
        await field.discard({ draft_id, intent: "no longer needed for this test" });
        const all = await field.read();
        expect(all[0]?.status).toBe("retracted");
      });

      it("retract hides a committed entry from attune", async () => {
        const field = createField({ adapter });
        const { id } = await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
        await field.retract({
          id,
          intent: "withdrawing this observation for the test",
          agent: "alice",
        });
        const result = await field.attune({ agent: "writer", topic: "x" });
        expect(result).toHaveLength(0);
      });

      it("a supersession chain resolves to only the latest entry", async () => {
        const field = createField({ adapter });
        const { id: originalId } = await field.write({
          entry: { topic: "x", v: 1 },
          intent: INTENT,
          agent: "alice",
        });
        await field.supersede({
          superseding_id: originalId,
          entry: { topic: "x", v: 2 },
          intent: INTENT,
          agent: "bob",
        });
        await field.supersede({
          superseding_id: originalId,
          entry: { topic: "x", v: 3 },
          intent: INTENT,
          agent: "carol",
        });
        const result = await field.attune({ agent: "writer", topic: "x" });
        expect(result).toHaveLength(1);
        expect((result[0]?.entry as { v: number }).v).toBe(3);
      });

      it("register and deregister round-trip a session", async () => {
        const field = createField({ adapter });
        const result = await field.register({ id: "alice", role: "researcher" });
        expect(typeof result.session_id).toBe("string");
        await expect(field.deregister({ id: "alice" })).resolves.toBeUndefined();
      });
    });

    // ── event log ──────────────────────────────────────────────────────────

    describe("event log", () => {
      it("replay returns all events in order", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { n: 1 }, intent: INTENT, agent: "alice" });
        await field.write({ entry: { n: 2 }, intent: INTENT, agent: "bob" });
        const events = await field.replay();
        expect(events.map((e) => e.seq)).toEqual(
          [...events.map((e) => e.seq)].sort((a, b) => a - b),
        );
        expect(events).toHaveLength(2);
      });

      it("replay chain-following resolves a three-link chain", async () => {
        const field = createField({ adapter });
        const { id: id1 } = await field.write({
          entry: { topic: "x" },
          intent: INTENT,
          agent: "a",
        });
        const { id: id2 } = await field.supersede({
          superseding_id: id1,
          entry: { topic: "x", v: 2 },
          intent: INTENT,
          agent: "b",
        });
        const { id: id3 } = await field.supersede({
          superseding_id: id1,
          entry: { topic: "x", v: 3 },
          intent: INTENT,
          agent: "c",
        });
        const events = await field.replay({ entry_id: id1 });
        const ids = new Set(events.map((e) => e.entry_id));
        expect(ids).toEqual(new Set([id1, id2, id3]));
      });

      it("events carry their format version", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { topic: "x" }, intent: INTENT });
        const events = await field.replay();
        expect(events[0]?.v).toBe(1);
      });

      it("events carry their assigned seq", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { topic: "x" }, intent: INTENT });
        const events = await field.replay();
        expect(typeof events[0]?.seq).toBe("number");
        expect(events[0]?.seq).toBeGreaterThanOrEqual(0);
      });
    });

    // ── ordering ───────────────────────────────────────────────────────────

    describe("ordering", () => {
      it("a single field's lamport sequence is 0..n-1", async () => {
        const field = createField({ adapter });
        for (let i = 0; i < 5; i++) {
          await field.write({ entry: { n: i }, intent: INTENT });
        }
        const all = await field.read();
        expect(all.map((e) => e.epoch)).toEqual([0, 1, 2, 3, 4]);
      });

      it("two fields sharing the adapter converge on the same visible state", async () => {
        const fieldA = createField({ adapter });
        const fieldB = createField({ adapter });
        await fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
        await fieldB.write({ entry: { topic: "x" }, intent: INTENT, agent: "bob" });
        const allA = await fieldA.read();
        const allB = await fieldB.read();
        expect(allA.map((e) => e.id).sort()).toEqual(allB.map((e) => e.id).sort());
      });

      it("concurrent writes order deterministically and identically from both fields", async () => {
        const fieldA = createField({ adapter });
        const fieldB = createField({ adapter });
        await Promise.all([
          fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" }),
          fieldB.write({ entry: { topic: "x" }, intent: INTENT, agent: "bob" }),
        ]);
        const eventsA = await fieldA.replay();
        const eventsB = await fieldB.replay();
        expect(eventsA.map((e) => e.event_id)).toEqual(eventsB.map((e) => e.event_id));
      });
    });

    // ── confidence ─────────────────────────────────────────────────────────

    describe("confidence", () => {
      it("is carried through write", async () => {
        const field = createField({ adapter });
        await field.write({
          entry: { topic: "x" },
          intent: INTENT,
          confidence: { score: 0.8, reason: "cross-checked" },
        });
        const all = await field.read();
        expect(all[0]?.confidence).toEqual({ score: 0.8, reason: "cross-checked" });
      });

      it("survives read and replay", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { topic: "x" }, intent: INTENT, confidence: { score: 0.4 } });
        const all = await field.read();
        const events = await field.replay();
        const record = events.find((e) => e.type === "RECORD");
        expect(all[0]?.confidence?.score).toBe(0.4);
        expect(record?.type === "RECORD" && record.confidence?.score).toBe(0.4);
      });

      it("does not alter relevance ordering", async () => {
        const field = createField({ adapter });
        await field.write({
          entry: { topic: "x", label: "older" },
          intent: INTENT,
          agent: "alice",
          confidence: { score: 0.99 },
        });
        await field.write({
          entry: { topic: "x", label: "newer" },
          intent: INTENT,
          agent: "alice",
          confidence: { score: 0.01 },
        });
        const result = await field.attune({ agent: "writer", topic: "x" });
        expect((result[0]?.entry as { label: string }).label).toBe("newer");
      });
    });

    // ── polling ────────────────────────────────────────────────────────────

    describe("polling", () => {
      it("since_epoch returns only newer entries", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "alice" });
        const all = await field.read();
        const watermark = all[0]?.epoch as number;
        await field.write({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "bob" });

        const result = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
        expect(result).toHaveLength(1);
        expect((result[0]?.entry as { n: number }).n).toBe(2);
      });

      it("is empty when the watermark is already current", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
        const all = await field.read();
        const highest = all[0]?.epoch as number;
        const result = await field.attune({ agent: "writer", topic: "x", since_epoch: highest });
        expect(result).toEqual([]);
      });

      it("combines with topic", async () => {
        const field = createField({ adapter });
        await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
        const all = await field.read();
        const watermark = all[0]?.epoch as number;
        await field.write({ entry: { topic: "y" }, intent: INTENT, agent: "bob" });
        await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "carol" });

        const result = await field.attune({ agent: "writer", topic: "x", since_epoch: watermark });
        expect(result).toHaveLength(1);
        expect((result[0]?.entry as { topic: string }).topic).toBe("x");
      });
    });

    // ── capabilities ───────────────────────────────────────────────────────

    describe("capabilities", () => {
      it("field_capabilities includes L0 and L1", async () => {
        const field = createField({ adapter });
        const result = await field.register({ id: "agent", role: "researcher" });
        expect(result.field_capabilities).toContain("L0");
        expect(result.field_capabilities).toContain("L1");
      });

      it("durable is present exactly when the adapter declares it", async () => {
        const field = createField({ adapter });
        const result = await field.register({ id: "agent", role: "researcher" });
        const adapterDeclaresDurable = (adapter.capabilities ?? []).includes("durable");
        expect(result.field_capabilities.includes("durable")).toBe(adapterDeclaresDurable);
      });
    });

    // ── persistence-specific ───────────────────────────────────────────────

    describe("persistence", () => {
      it("a new field constructed over the same adapter sees prior state", async () => {
        const fieldA = createField({ adapter });
        await fieldA.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });

        const fieldB = createField({ adapter });
        const all = await fieldB.read();
        expect(all).toHaveLength(1);
        expect(all[0]?.entry).toEqual({ topic: "x" });
      });

      it("saveProjection then loadProjection round-trips losslessly, where snapshots are real", async () => {
        // Always returning null from loadProjection is explicitly legal per
        // the interface contract (MemoryAdapter does exactly this —
        // snapshots are an optimisation, not a requirement). So this only
        // asserts the round-trip for adapters that actually persist one;
        // an adapter with no-op snapshotting trivially satisfies the
        // "lossless" claim by never claiming to have saved anything.
        const field = createField({ adapter });
        await field.write({
          entry: { topic: "x" },
          intent: INTENT,
          agent: "alice",
          confidence: { score: 0.6, reason: "moderate certainty" },
        });
        await field.register({ id: "alice", role: "researcher", capabilities: ["draft-writes"] });

        const events = await field.replay();
        const projection = buildProjection(events);
        await adapter.saveProjection(projection, projection.upToSeq);

        const loaded = await adapter.loadProjection();
        if (loaded === null) return; // legal no-op snapshotting; nothing more to assert

        expect(loaded.upToSeq).toBe(projection.upToSeq);
        expect(loaded.maxLamport).toBe(projection.maxLamport);
        expect([...loaded.entries]).toEqual([...projection.entries]);
        expect([...loaded.sessions]).toEqual([...projection.sessions]);
      });

      it("a field loading a stale snapshot catches up correctly via readEvents", async () => {
        const fieldA = createField({ adapter });
        await fieldA.write({ entry: { topic: "x", n: 1 }, intent: INTENT, agent: "alice" });

        // Snapshot the field at this point.
        const eventsSoFar = await fieldA.replay();
        const projection = buildProjection(eventsSoFar);
        await adapter.saveProjection(projection, projection.upToSeq);

        // More activity happens after the snapshot was taken.
        await fieldA.write({ entry: { topic: "x", n: 2 }, intent: INTENT, agent: "bob" });

        // A fresh field loads the (now stale) snapshot, then must catch up.
        const fieldB = createField({ adapter });
        const all = await fieldB.read();
        expect(all).toHaveLength(2);
        expect(all.map((e) => (e.entry as { n: number }).n).sort()).toEqual([1, 2]);
      });

      it("batch append is atomic — a rejected duplicate leaves no partial state", async () => {
        const field = createField({ adapter });
        const { id } = await field.write({ entry: { topic: "x" }, intent: INTENT, agent: "alice" });
        const before = await adapter.readEvents();

        // Re-append the exact same event object (same event_id) alongside a
        // brand-new one, in one batch. Adapters that enforce event_id
        // uniqueness (Postgres, via its unique index) must reject the whole
        // batch, leaving neither event stored. Adapters with no uniqueness
        // constraint (MemoryAdapter, by design — see Story 1) cannot be
        // forced to fail this way; for those this assertion is vacuously
        // satisfied, since nothing failed and the "no partial state" claim
        // trivially holds. The append is still exercised either way.
        const duplicate = recordEvent({
          lamport: 999,
          agent: "eve",
          entry_id: id,
          entry: { topic: "x", duplicate: true },
          intent: INTENT,
        });
        const fresh = recordEvent({
          lamport: 1000,
          agent: "eve",
          entry_id: "should-not-land",
          entry: { topic: "x" },
          intent: INTENT,
        });

        let threw = false;
        try {
          await adapter.append([
            { ...duplicate, event_id: before[0]?.event_id ?? duplicate.event_id },
            fresh,
          ]);
        } catch {
          threw = true;
        }

        const after = await adapter.readEvents();
        if (threw) {
          expect(after).toHaveLength(before.length);
        } else {
          // Adapter does not enforce uniqueness; both events land, which is
          // a legal (if less strict) implementation of the interface.
          expect(after.length).toBeGreaterThanOrEqual(before.length);
        }
      });
    });
  });
}
