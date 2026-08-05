import { promises as fs } from "node:fs";
import path from "node:path";
import type { EventScope, StorageAdapter } from "../adapter.js";
import { AkashikError } from "../errors.js";
import type { FieldEvent } from "../events.js";
import { type Projection, deserializeProjection, serializeProjection } from "../projection.js";

export type FileAdapterOptions = {
  /**
   * Path to the event log file. The field's identity IS this path — separate
   * fields use separate files. No fieldId option is needed or offered.
   */
  path: string;
};

const STALE_MS = 30_000;
const RETRY_MS = 25;
const MAX_WAIT_MS = 10_000;

/**
 * Acquire an exclusive lock by creating a lock file with O_EXCL. Retries with
 * backoff. Treats a lock older than STALE_MS as abandoned by a crashed process
 * and reclaims it.
 *
 * Serialising append is not optional: concurrent writers assigning overlapping
 * seq values would make sinceSeq reads skip events permanently, exactly as
 * unserialised BIGSERIAL would in Postgres.
 */
async function acquireLock(lockPath: string): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;

  for (;;) {
    try {
      const handle = await fs.open(lockPath, "wx");
      await handle.close();
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;

      // Reclaim a stale lock left by a crashed process.
      try {
        const stat = await fs.stat(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_MS) {
          await fs.unlink(lockPath);
          continue;
        }
      } catch {
        continue; // lock vanished between EEXIST and stat; retry immediately
      }

      if (Date.now() > deadline) {
        throw new AkashikError("STORAGE_ERROR", `timed out acquiring lock at ${lockPath}`);
      }
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch {
    // Already gone. Releasing a released lock is not an error.
  }
}

/**
 * Parse JSONL content into events. Only the FINAL line may be torn (a crash
 * truncates the tail, never the middle) — a parse failure anywhere else is
 * genuine corruption and must not be silently swallowed. Discarding a torn
 * final line is correct recovery: that event never finished committing.
 * Discarding a mid-file parse failure would silently drop committed events
 * and hand back a wrong field state — resilience and data loss look similar
 * from the outside, but are not the same thing.
 */
function parseLines(content: string): FieldEvent[] {
  const lines = content.split("\n").filter((l) => l.length > 0);
  const events: FieldEvent[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      events.push(JSON.parse(lines[i] as string) as FieldEvent);
    } catch {
      if (i === lines.length - 1) break;
      throw new AkashikError(
        "STORAGE_ERROR",
        `corrupt event log at line ${i + 1}; the file is damaged beyond a truncated tail`,
      );
    }
  }

  return events;
}

export function createFileAdapter(options: FileAdapterOptions): StorageAdapter {
  const logPath = options.path;
  const lockPath = `${logPath}.lock`;
  const snapshotPath = `${logPath}.snapshot`;

  async function readAllEvents(): Promise<FieldEvent[]> {
    try {
      const content = await fs.readFile(logPath, "utf8");
      return parseLines(content);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  return {
    // FileAdapter is durable — state survives process restart.
    capabilities: ["durable"],

    async init(): Promise<void> {
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      // Create the log if absent. Never truncate an existing file: "a" opens
      // for append (creating if needed), unlike "w" which would destroy an
      // existing field's history.
      const handle = await fs.open(logPath, "a");
      await handle.close();
    },

    async append(events: FieldEvent[]): Promise<{ seqs: number[] }> {
      if (events.length === 0) return { seqs: [] };

      await acquireLock(lockPath);
      try {
        // Determine the next seq under the lock, so concurrent writers
        // cannot assign overlapping values.
        const existing = await readAllEvents();
        let nextSeq = existing.length === 0 ? 0 : Math.max(...existing.map((e) => e.seq)) + 1;

        const seqs: number[] = [];
        const lines: string[] = [];
        for (const event of events) {
          const seq = nextSeq++;
          seqs.push(seq);
          lines.push(JSON.stringify({ ...event, seq }));
        }

        // One write call for the whole batch. Combined with the lock this is
        // the atomicity guarantee; a crash mid-write leaves a torn final
        // line that readers discard.
        await fs.appendFile(logPath, `${lines.join("\n")}\n`, "utf8");

        return { seqs };
      } finally {
        await releaseLock(lockPath);
      }
    },

    async readEvents(opts?: { scope?: EventScope; sinceSeq?: number }): Promise<FieldEvent[]> {
      let result = await readAllEvents();

      if (opts?.sinceSeq !== undefined) {
        const since = opts.sinceSeq;
        result = result.filter((e) => e.seq > since);
      }

      if (opts?.scope?.agent !== undefined) {
        const agent = opts.scope.agent;
        result = result.filter((e) => e.agent === agent);
      }

      if (opts?.scope?.topic !== undefined) {
        const topic = opts.scope.topic;
        // Mirror MemoryAdapter and PostgresAdapter: non-RECORD events pass
        // through a topic scope, because the field needs REGISTER events to
        // resolve roles. Divergence here is the specific failure this story
        // exists to rule out.
        result = result.filter((e) => {
          if (e.type !== "RECORD") return true;
          return e.entry.topic === topic;
        });
      }

      return result.sort((a, b) => a.seq - b.seq);
    },

    async loadProjection(_scope?: EventScope): Promise<Projection | null> {
      try {
        const content = await fs.readFile(snapshotPath, "utf8");
        return deserializeProjection(JSON.parse(content));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") return null;
        // A corrupt snapshot is recoverable: the log is authoritative, so
        // returning null makes the field rebuild from events.
        if (error instanceof SyntaxError) return null;
        throw error;
      }
    },

    async saveProjection(projection: Projection, upToSeq: number): Promise<void> {
      const payload = JSON.stringify({
        ...serializeProjection(projection),
        upToSeq,
      });

      // Temp-and-rename: rename is atomic within a filesystem, so a reader
      // never observes a partially written snapshot. The pid in the temp
      // filename means two processes snapshotting concurrently don't
      // collide on the temp path before rename.
      const tempPath = `${snapshotPath}.${process.pid}.tmp`;
      await fs.writeFile(tempPath, payload, "utf8");
      await fs.rename(tempPath, snapshotPath);
    },

    async close(): Promise<void> {
      // No persistent handles are held; nothing to release.
    },
  };
}
