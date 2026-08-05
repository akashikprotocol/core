import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordEvent } from "../src/events.js";
import { createFileAdapter } from "../src/file.js";
import { buildProjection, emptyProjection } from "../src/projection.js";

let dir: string;
let logPath: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "akashik-file-adapter-"));
  logPath = path.join(dir, "field.jsonl");
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

function makeRecord(overrides: { lamport?: number; agent?: string | null } = {}) {
  return recordEvent({
    lamport: overrides.lamport ?? 0,
    agent: overrides.agent === undefined ? "alice" : overrides.agent,
    entry_id: "entry-1",
    entry: { topic: "x" },
    intent: "a sufficiently long intent for this test scenario",
  });
}

describe("FileAdapter — format and durability", () => {
  it("the log file is created by init() and is valid JSONL", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    const content = await fs.readFile(logPath, "utf8");
    expect(content).toBe("");
  });

  it("each appended event occupies exactly one line", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await adapter.append([makeRecord({ lamport: 0 }), makeRecord({ lamport: 1 })]);
    const content = await fs.readFile(logPath, "utf8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("a batch append writes all lines together", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    const { seqs } = await adapter.append([
      makeRecord({ lamport: 0 }),
      makeRecord({ lamport: 1 }),
      makeRecord({ lamport: 2 }),
    ]);
    expect(seqs).toEqual([0, 1, 2]);
  });

  it("init() on an existing file does not truncate it", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await adapter.append([makeRecord()]);
    await adapter.init?.();
    const events = await adapter.readEvents();
    expect(events).toHaveLength(1);
  });

  it("a new adapter over an existing file reads prior events", async () => {
    const adapterA = createFileAdapter({ path: logPath });
    await adapterA.init?.();
    await adapterA.append([makeRecord()]);

    const adapterB = createFileAdapter({ path: logPath });
    const events = await adapterB.readEvents();
    expect(events).toHaveLength(1);
  });

  it("events round-trip with v, confidence, and null agent intact", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    const withConfidence = recordEvent({
      lamport: 0,
      agent: null,
      entry_id: "entry-1",
      entry: { topic: "x" },
      intent: "an anonymous entry with confidence attached",
      confidence: { score: 0.5, reason: "test" },
    });
    await adapter.append([withConfidence]);

    const [event] = await adapter.readEvents();
    expect(event?.v).toBe(1);
    expect(event?.agent).toBeNull();
    expect(event?.type === "RECORD" && event.confidence).toEqual({ score: 0.5, reason: "test" });
  });
});

describe("FileAdapter — torn-line recovery", () => {
  it("a file whose final line is truncated mid-JSON reads back all complete events", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await adapter.append([makeRecord({ lamport: 0 }), makeRecord({ lamport: 1 })]);

    // Manually tear the final line, simulating a crash mid-write.
    const content = await fs.readFile(logPath, "utf8");
    const lines = content.split("\n").filter((l) => l.length > 0);
    const torn = `${lines[0]}\n${(lines[1] as string).slice(0, 20)}`;
    await fs.writeFile(logPath, torn, "utf8");

    const events = await adapter.readEvents();
    expect(events).toHaveLength(1);
  });

  it("a torn final line is excluded from results, not just ignored on error", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await adapter.append([makeRecord({ lamport: 0 })]);
    await fs.appendFile(logPath, '{"seq":1,"v":1,"event_id":"broken', "utf8");

    const events = await adapter.readEvents();
    expect(events.map((e) => e.seq)).toEqual([0]);
  });

  it("appending after a torn line succeeds and produces a valid log", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await adapter.append([makeRecord({ lamport: 0 })]);
    await fs.appendFile(logPath, '{"seq":1,"broken', "utf8");

    // The next append should still work; the adapter recomputes nextSeq
    // from the complete (non-torn) events it can parse.
    await expect(adapter.append([makeRecord({ lamport: 1 })])).resolves.toBeDefined();
    const events = await adapter.readEvents();
    expect(events.every((e) => e.type === "RECORD")).toBe(true);
  });

  it("corruption in a middle line throws STORAGE_ERROR rather than being skipped", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await adapter.append([makeRecord({ lamport: 0 })]);
    // Insert genuinely corrupt content in the middle, then a valid line after.
    await fs.appendFile(logPath, "not valid json at all\n", "utf8");
    await adapter.append([makeRecord({ lamport: 1 })]).catch(() => {
      // append() itself reads existing events to compute nextSeq, so the
      // corruption is detected here too; either surface is acceptable as
      // long as it throws rather than silently dropping data.
    });

    await expect(adapter.readEvents()).rejects.toMatchObject({ code: "STORAGE_ERROR" });
  });

  it("an empty file reads as zero events", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    const events = await adapter.readEvents();
    expect(events).toEqual([]);
  });

  it("a file containing only a newline reads as zero events", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await fs.writeFile(logPath, "\n", "utf8");
    const events = await adapter.readEvents();
    expect(events).toEqual([]);
  });
});

describe("FileAdapter — locking", () => {
  it("two adapters over the same path appending concurrently produce contiguous, non-overlapping seqs", async () => {
    const adapterA = createFileAdapter({ path: logPath });
    await adapterA.init?.();
    const adapterB = createFileAdapter({ path: logPath });

    const [resultA, resultB] = await Promise.all([
      adapterA.append([makeRecord({ lamport: 0, agent: "alice" })]),
      adapterB.append([makeRecord({ lamport: 0, agent: "bob" })]),
    ]);

    const allSeqs = [...resultA.seqs, ...resultB.seqs].sort((a, b) => a - b);
    expect(allSeqs).toEqual([0, 1]);
  });

  it("no events are lost when two adapters append simultaneously", async () => {
    const adapterA = createFileAdapter({ path: logPath });
    await adapterA.init?.();
    const adapterB = createFileAdapter({ path: logPath });

    await Promise.all([
      adapterA.append([makeRecord({ lamport: 0, agent: "alice" })]),
      adapterB.append([makeRecord({ lamport: 0, agent: "bob" })]),
    ]);

    const events = await adapterA.readEvents();
    expect(events).toHaveLength(2);
    const seqs = events.map((e) => e.seq);
    expect(new Set(seqs).size).toBe(2);
  });

  it("a stale lock file older than the threshold is reclaimed", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();

    // Simulate an abandoned lock from a crashed process: create it, then
    // backdate its mtime well past the staleness threshold.
    const lockPath = `${logPath}.lock`;
    await fs.writeFile(lockPath, "", "utf8");
    const old = new Date(Date.now() - 60_000);
    await fs.utimes(lockPath, old, old);

    await expect(adapter.append([makeRecord()])).resolves.toBeDefined();
  });

  it("a fresh lock file causes a waiting writer to retry rather than fail immediately", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();

    const lockPath = `${logPath}.lock`;
    await fs.writeFile(lockPath, "", "utf8"); // fresh — not stale

    const appendPromise = adapter.append([makeRecord()]);

    // Release the lock shortly after, well within MAX_WAIT_MS, simulating
    // the "owner" finishing its own append.
    await new Promise((r) => setTimeout(r, 100));
    await fs.unlink(lockPath);

    await expect(appendPromise).resolves.toBeDefined();
  });

  it("the lock is released after a successful append", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await adapter.append([makeRecord()]);
    const lockPath = `${logPath}.lock`;
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it("the lock is released even when the append throws", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();

    const circular: Record<string, unknown> = { topic: "x" };
    circular.self = circular;
    const unstringifiable = {
      ...makeRecord(),
      entry: circular,
    };

    await expect(adapter.append([unstringifiable as never])).rejects.toThrow();

    const lockPath = `${logPath}.lock`;
    await expect(fs.access(lockPath)).rejects.toThrow();
  });
});

describe("FileAdapter — snapshots", () => {
  it("saveProjection then loadProjection round-trips", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await adapter.append([makeRecord({ lamport: 0 })]);
    const events = await adapter.readEvents();
    const projection = buildProjection(events);

    await adapter.saveProjection(projection, projection.upToSeq);
    const loaded = await adapter.loadProjection();

    expect(loaded).not.toBeNull();
    expect([...(loaded?.entries ?? [])]).toEqual([...projection.entries]);
    expect(loaded?.upToSeq).toBe(projection.upToSeq);
  });

  it("loadProjection returns null when no snapshot file exists", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    const loaded = await adapter.loadProjection();
    expect(loaded).toBeNull();
  });

  it("a corrupt snapshot file returns null rather than throwing", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await fs.writeFile(`${logPath}.snapshot`, "not valid json", "utf8");
    await expect(adapter.loadProjection()).resolves.toBeNull();
  });

  it("no .tmp file remains after a successful saveProjection", async () => {
    const adapter = createFileAdapter({ path: logPath });
    await adapter.init?.();
    await adapter.saveProjection(emptyProjection(), -1);
    const files = await fs.readdir(dir);
    expect(files.some((f) => f.endsWith(".tmp"))).toBe(false);
  });

  it("a snapshot written by one adapter is readable by another over the same path", async () => {
    const adapterA = createFileAdapter({ path: logPath });
    await adapterA.init?.();
    await adapterA.append([makeRecord()]);
    const projection = buildProjection(await adapterA.readEvents());
    await adapterA.saveProjection(projection, projection.upToSeq);

    const adapterB = createFileAdapter({ path: logPath });
    const loaded = await adapterB.loadProjection();
    expect(loaded?.upToSeq).toBe(projection.upToSeq);
  });
});

describe("FileAdapter — persistence across instances", () => {
  it("write with adapter A, close, construct adapter B over the same path, all state present", async () => {
    const adapterA = createFileAdapter({ path: logPath });
    await adapterA.init?.();
    await adapterA.append([makeRecord({ lamport: 0 }), makeRecord({ lamport: 1 })]);
    await adapterA.close?.();

    const adapterB = createFileAdapter({ path: logPath });
    const events = await adapterB.readEvents();
    expect(events).toHaveLength(2);
  });

  it("a field constructed over an existing file resumes with the correct lamport value", async () => {
    const adapterA = createFileAdapter({ path: logPath });
    await adapterA.init?.();
    await adapterA.append([makeRecord({ lamport: 0 }), makeRecord({ lamport: 5 })]);

    const adapterB = createFileAdapter({ path: logPath });
    const events = await adapterB.readEvents();
    const maxLamport = Math.max(...events.map((e) => e.lamport));
    expect(maxLamport).toBe(5);
  });
});
