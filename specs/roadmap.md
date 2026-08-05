# Roadmap

Where `@akashikprotocol/core` is going, mapped to the protocol's conformance levels.

Status: Current as of v0.3.0 (August 2026).

---

## How to read this

Each SDK release maps to a protocol conformance level. A level is a strict superset of the one below it, so a release reaches a level only when it meets every requirement of that level.

The conformance ratchet runs one way. Once a level is claimed, that level's requirements are permanent commitments, and no later release drops below it. Conformance transitions are minor version bumps, not major. The full versioning policy is in [GOVERNANCE.md](../GOVERNANCE.md).

Dates are not promised. The order is.

## Shipped

### v0.1 ~ partial Level 0 (foundation)

Released 2026-05-03. The first public surface: `createField`, `write`, `read`, and a topic-filtered `attune` that excludes the caller's own writes. Mandatory intent was present from the first release.

### v0.2 ~ full Level 0 plus selected Level 1

Released 2026-06-20. Full Level 0 conformance, plus four Level 1 operations that complete natural lifecycle stories.

- Standard message envelope, constructed and validated internally.
- `register` and `deregister` with capability exchange.
- Draft lifecycle: `draft`, `commit`, `discard`.
- `retract` and `supersede`, with chain resolution for supersession.
- `reckon`: relevance ranking plus mechanical conflict detection.
- Relevance scoring on `attune` across topic, role, recency, and intent quality.

What v0.2 did not yet do was scoped to deeper levels: persistence, an event log, full Lamport clocks, confidence on records, polling, embeddings, and transport.

### v0.3 ~ full Level 1 (current)

Released 2026-08-05. The release that completes Level 1. The in-memory reference became a durable, ordered, auditable store, and three storage backends now satisfy the same interface.

- Persistent storage behind a `StorageAdapter` interface. `MemoryAdapter`, `FileAdapter`, and `PostgresAdapter` all pass the same conformance suite, proving the abstraction rather than asserting it.
- An append-only event log, exposed through `replay()`, with supersession chain following that reconstructs the ordered sequence of intents behind the current state.
- Full Lamport logical clocks, replacing the monotonic counter used in v0.2, correct under concurrent writers sharing one field.
- Confidence on records: an optional `{ score, reason? }`, carried and surfaced, never used by the protocol to rank or resolve.
- `since_epoch` polling on `attune`, for subscription by polling without a transport.
- Real capability negotiation at registration: the field advertises the conformance levels and adapter-sourced flags it satisfies.

What v0.3 does not yet do is scoped to deeper levels: semantic relevance, embeddings, automatic conflict resolution, subscription push, and transport bindings.

## Planned

### v0.4 ~ Level 2

The release where relevance and conflict detection move from mechanical to semantic.

- Vector embeddings for record content.
- Semantic relevance scoring in `attune`, on top of the feature-weighted Level 0 scoring.
- Automatic conflict detection beyond explicit key-value mismatch.
- `MERGE` with conflict resolution strategies, kept as tools the agent invokes rather than choices the protocol makes.
- Push-based `SUBSCRIBE`, token budget management, and `COMPACT`.

### v0.5 ~ Level 3

The release that reaches production-grade coordination.

- The coordination extension: `COORDINATE` and `SESSION`.
- Authentication and an authority hierarchy for privileged operations.
- Transport bindings, so operations can cross a wire. The envelope present since v0.2 carries this forward.

### v1.0 ~ stable

The first release with a frozen public API for its major version. Backward compatibility moves from best-effort to guaranteed within the major line, and the claimed conformance level is fixed for that line.

## A note on scope

Each release is scoped to what its level requires, not to everything that could be added while the code is open. A feature arriving ahead of its level is deferred by default. This is the discipline that keeps the levels honest and the contracts stable, and it is stated in full in [PRINCIPLES.md](../PRINCIPLES.md).

v0.3 held to this discipline the same way v0.1 and v0.2 did. Three adapters, a full event log, real Lamport clocks, and capability negotiation shipped because Level 1 requires them. Semantic relevance, MERGE, and transport bindings did not ship, because they belong to levels v0.3 does not claim.
