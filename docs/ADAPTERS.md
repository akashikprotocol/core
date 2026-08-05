# Adapters

A Field is a coordinator over a `StorageAdapter`. The coordinator logic (validation, relevance scoring, conflict detection, chain resolution) is the same regardless of where events end up. Three adapters ship with this package, all satisfying the same conformance suite, and a fourth can be written against the same interface.

## Choosing an adapter

| Adapter | Durable | Good for | Not for |
|---|---|---|---|
| `MemoryAdapter` | No | Tests, ephemeral coordination, single-run scripts | Anything that needs to survive a restart |
| `FileAdapter` | Yes | Local development, single-machine long-running services, CLI tools, embedded use | Serverless deployments spanning machines, network filesystems |
| `PostgresAdapter` | Yes | Production, serverless, multi-machine deployments, anything needing real concurrent writers | Cases where running a database is disproportionate to the need |

There is no adapter that serves every deployment shape well, and none is meant to. Choosing the right adapter per deployment is the intended design, not a limitation to work around with one adapter trying to do everything.

`createField()` with no arguments uses `MemoryAdapter`. Every other adapter is passed explicitly: `createField({ adapter })`.

## Configuration

### MemoryAdapter

```typescript
import { createField } from "@akashikprotocol/core";

const field = createField(); // MemoryAdapter, implicitly
```

No options. State lives in a closure over a JavaScript array and is gone when the process exits.

### FileAdapter

```typescript
import { createField } from "@akashikprotocol/core";
import { createFileAdapter } from "@akashikprotocol/core/file";

const adapter = createFileAdapter({ path: "./field.jsonl" });
await adapter.init();
const field = createField({ adapter });
```

The path *is* the field's identity. Two `FileAdapter` instances pointed at the same path see the same field; two different paths are two different fields. There is no separate `fieldId` option, because a second namespacing mechanism alongside the path would be redundant.

A relative path resolves against `process.cwd()` at the moment the adapter is constructed, not against the source file's location. This is worth naming explicitly, because it is an easy footgun: a script run from a different working directory silently opens or creates a different field. Prefer an absolute path, built from `import.meta.url` or an explicit configuration value, in anything that is not a one-off script.

Three files exist under one field: the log itself (`field.jsonl`), a lock file (`field.jsonl.lock`) that exists only transiently during an append, and a snapshot (`field.jsonl.snapshot`) written only if `saveProjection` is called. Back up the `.jsonl` file. The snapshot is a rebuildable cache; losing it costs a slower cold start, not data.

### PostgresAdapter

```typescript
import { createField } from "@akashikprotocol/core";
import { createPostgresAdapter } from "@akashikprotocol/core/postgres";

const adapter = createPostgresAdapter({
  connectionString: process.env.DATABASE_URL,
  fieldId: "production",
});
await adapter.init();
const field = createField({ adapter });
```

Construct from a `connectionString`, which the adapter turns into a `pg.Pool` it owns, or from an existing `pool` the caller already manages. `fieldId` namespaces multiple fields within one database (it defaults to `"default"`), since a Postgres database, unlike a file, is a natural place to hold more than one field's events.

If you inject a `pool`, `adapter.close()` does not end it. The pool is yours; you opened it, you decide when it closes. Only a pool the adapter created for itself is closed by `close()`.

## Snapshots are optional

`loadProjection` returning `null` unconditionally is a legal implementation of the interface. `MemoryAdapter` does exactly this. The log is authoritative; a snapshot is an optimisation that lets a field skip replaying its full history on startup, never a requirement for correctness.

A corrupt snapshot should return `null`, not throw. Both `FileAdapter` and `PostgresAdapter` follow this: a snapshot that fails to parse is treated as absent, and the field rebuilds from the event log instead. This is the event-sourcing invariant paying off directly. Because the projection is always derivable from the log, a bad cache is never a failure, only a cache miss.

## Topic scoping semantics

Every adapter's `readEvents` accepts an optional `scope.topic`. Non-RECORD events (REGISTER, DEREGISTER, STATUS_CHANGE) pass through a topic scope rather than being filtered out, because the field needs REGISTER events to resolve agent roles regardless of which topic it is currently reading. All three built-in adapters implement this identically. A custom adapter that filtered non-RECORD events out under a topic scope would behave differently from the other three under the same interface, which defeats the purpose of the interface.

## Implementing a custom adapter

`StorageAdapter` has five required methods (`append`, `readEvents`, `loadProjection`, `saveProjection`) plus two optional lifecycle hooks (`init`, `close`) and an optional `capabilities` array. The full type is in `src/adapter.ts`.

Two guarantees are not optional, and getting either wrong produces failures that the type system cannot catch:

**Append must be atomic across a batch.** A single `supersede` call produces two events, a `STATUS_CHANGE` marking the predecessor and a `RECORD` for the new entry, appended together. A partial write, where one event lands and the other does not, leaves a field with a superseded predecessor and no successor, or a new entry with no record of what it replaced. Wrap the batch in whatever transactional mechanism the backend provides.

**Sequence assignment must be serialized across concurrent writers.** If two writers can assign overlapping or out-of-commit-order `seq` values, an incremental reader using `sinceSeq` will skip an event permanently, not just late. `PostgresAdapter` serializes this with `pg_advisory_xact_lock`, scoped per field so unrelated fields never contend. `FileAdapter` serializes it with a lock file. A custom adapter must solve this problem somehow; there is no way to opt out of it while still supporting `sinceSeq`-based polling and replay correctly.

Run the existing adapter conformance suite (`tests/conformance/adapter-suite.ts`) against a new adapter before trusting it. It encodes every protocol semantic the three built-in adapters were held to, and passing it is the actual bar, not a description of correct behaviour to approximate.
