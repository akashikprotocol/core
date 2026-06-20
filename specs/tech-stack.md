# Tech Stack

The technical choices behind `@akashikprotocol/core`, and the reasoning for each.

Status: Current as of v0.2.0 (June 2026).

---

## Language and runtime

TypeScript, in strict mode. The compiler runs with `strict` and `noUncheckedIndexedAccess` enabled, so indexing and nullability are checked rather than assumed.

Node.js 22 or later. The version is pinned in `.nvmrc` and `package.json` engines, and CI runs against Node 22.

The compile target is ES2022 for both the type check and the build.

## Package shape

The package ships dual module formats. `tsup` emits an ESM build, a CommonJS build, and type declarations from the single entry point `src/index.ts`. The `exports` map in `package.json` points `import`, `require`, and `types` at the matching output.

Only `dist`, `LICENSE`, and `README.md` are published. Source, tests, and design documents stay in the repository and out of the installed package.

## Dependencies

The runtime dependency surface is one package: `ulid`, used to generate sortable identifiers for entries and messages.

A small runtime surface is a deliberate choice. The protocol's value is in its semantics, not in the libraries it pulls in, and a narrow dependency set keeps the SDK simple to audit and to adopt.

Development tooling is held in devDependencies: `tsup` for the build, `vitest` for tests, `biome` for lint and format, `tsx` for running examples, and `typescript` for the type check.

## Build, test, and quality

| Concern | Tool | Command |
| --- | --- | --- |
| Build | tsup | `npm run build` |
| Test | vitest | `npm run test` |
| Type check | tsc (noEmit) | `npm run typecheck` |
| Lint and format | biome | `npm run lint` |

The full v0.2 suite is 280 tests across the protocol surface. Tests describe contracts rather than implementation detail, so a passing suite is a statement about behaviour that consumers can rely on.

`prepublishOnly` runs lint, type check, test, and build in sequence, so a release cannot be published with any of them failing.

## Continuous integration

GitHub Actions runs on every push and pull request against `main`. The job installs with `npm ci` on Node 22, then runs lint, type check, build, and test in that order.

CI must pass before merge. The same four commands run locally and in CI, so a green local run predicts a green pipeline.

## Storage and transport

State is held in memory. A Field is a closure over its own entries, drafts, sessions, and an epoch counter. Methods are async, so the signatures stay stable when a storage adapter arrives at Level 1.

There is no transport binding yet. v0.2 wraps every operation in a message envelope and validates it, but the envelope does not cross a wire. Transport bindings belong to Level 3. Keeping the envelope present now sets up those bindings without a later reshaping of the internals.

## What is deliberately absent

No framework coupling. The SDK does not depend on any agent framework, and it does not assume one.

No persistence layer, no embedding model, no network stack. Each of these maps to a specific conformance level and arrives with the release that reaches that level. The current absence is scoped, not accidental, and the schedule is in [roadmap.md](./roadmap.md).
