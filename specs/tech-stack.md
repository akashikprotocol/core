# Tech Stack

The technical choices behind `@akashikprotocol/core`, and the reasoning for each.

Status: Current as of v0.3.0 (August 2026).

---

## Language and runtime

TypeScript, in strict mode. The compiler runs with `strict` and `noUncheckedIndexedAccess` enabled, so indexing and nullability are checked rather than assumed.

Node.js 22 or later. The version is pinned in `.nvmrc` and `package.json` engines, and CI runs against Node 22.

The compile target is ES2022 for both the type check and the build.

## Package shape

The package ships dual module formats. `tsup` emits an ESM build, a CommonJS build, and type declarations from three entry points: `src/index.ts` (the core package), `src/postgres.ts` (`@akashikprotocol/core/postgres`), and `src/file.ts` (`@akashikprotocol/core/file`). The `exports` map in `package.json` points `import`, `require`, and `types` at the matching output for each.

Only `dist`, `LICENSE`, and `README.md` are published. Source, tests, and design documents stay in the repository and out of the installed package.

## Dependencies

The core package's runtime dependency surface is one package: `ulid`, used to generate sortable identifiers for entries and events.

A small runtime surface is a deliberate choice. The protocol's value is in its semantics, not in the libraries it pulls in, and a narrow dependency set keeps the SDK simple to audit and to adopt. This claim held through v0.3 deliberately, even while adding persistent storage:

- `PostgresAdapter`, reached only through the `@akashikprotocol/core/postgres` subpath, depends on `pg`. It is declared as an optional peer dependency, not a hard one. The core entry point has no reference to `pg` anywhere, so installing `@akashikprotocol/core` alone never pulls it in.
- `FileAdapter`, reached through `@akashikprotocol/core/file`, uses only `node:fs` and `node:path`. It costs nothing to install, because it needs nothing beyond the Node runtime itself.

A consumer who only ever calls `createField()` with no adapter still has exactly one runtime dependency.

Development tooling is held in devDependencies: `tsup` for the build, `vitest` for tests, `biome` for lint and format, `tsx` for running examples, `pg` and `@types/pg` for developing and testing `PostgresAdapter`, and `typescript` for the type check.

## Build, test, and quality

| Concern | Tool | Command |
| --- | --- | --- |
| Build | tsup | `npm run build` |
| Test | vitest | `npm run test` |
| Type check | tsc (noEmit) | `npm run typecheck` |
| Lint and format | biome | `npm run lint` |

The full v0.3 suite is 590 tests without a database available, and 621 with `AKASHIK_TEST_POSTGRES` set, which adds the Postgres conformance suite to the matrix already run against `MemoryAdapter` and `FileAdapter`. Tests describe contracts rather than implementation detail, so a passing suite is a statement about behaviour that consumers can rely on.

`prepublishOnly` runs lint, type check, test, and build in sequence, so a release cannot be published with any of them failing.

## Continuous integration

GitHub Actions runs on every push and pull request against `main`. The job installs with `npm ci` on Node 22, then runs lint, type check, build, and test in that order.

CI must pass before merge. The same four commands run locally and in CI, so a green local run predicts a green pipeline.

## Storage and transport

State is event-sourced. A Field appends validated operations to a `StorageAdapter` as an ordered log of events, and maintains a derived projection, current entries and sessions, by applying that log in total order. The projection is never written to directly; it is only ever produced by replaying events, which is what makes `replay()` and a rebuilt-from-scratch field trustworthy by construction rather than by convention.

Three adapters ship in this package, all satisfying the same conformance suite:

- `MemoryAdapter`, the default. State lives in a closure over a JavaScript array and does not survive process exit.
- `FileAdapter`, append-only JSONL on local disk, with lock-file serialised writes and torn-line recovery on read.
- `PostgresAdapter`, a real transactional store, with advisory-lock serialised writes and JSONB-backed events.

There is no transport binding yet. Every operation is wrapped in a message envelope and validated internally, but the envelope does not cross a wire. Transport bindings belong to Level 3. Keeping the envelope present now sets up those bindings without a later reshaping of the internals.

## What is deliberately absent

No framework coupling. The SDK does not depend on any agent framework, and it does not assume one.

No embedding model, no network stack, no authority hierarchy. Each of these maps to a specific conformance level and arrives with the release that reaches that level: vector embeddings and semantic relevance are Level 2 (v0.4); transport bindings and authentication are Level 3 (v0.5). Persistence and the event log, previously listed here as absent, shipped in v0.3 and are no longer scoped ahead. The current absences are scoped, not accidental, and the schedule is in [roadmap.md](./roadmap.md).
