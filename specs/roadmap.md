# Roadmap

Where `@akashikprotocol/core` is going, mapped to the protocol's conformance levels.

Status: Current as of v0.2.0 (June 2026).

---

## How to read this

Each SDK release maps to a protocol conformance level. A level is a strict superset of the one below it, so a release reaches a level only when it meets every requirement of that level.

The conformance ratchet runs one way. Once a level is claimed, that level's requirements are permanent commitments, and no later release drops below it. Conformance transitions are minor version bumps, not major. The full versioning policy is in [GOVERNANCE.md](../GOVERNANCE.md).

Dates are not promised. The order is.

## Shipped

### v0.1 ~ partial Level 0 (foundation)

Released 2026-05-03. The first public surface: `createField`, `write`, `read`, and a topic-filtered `attune` that excludes the caller's own writes. Mandatory intent was present from the first release.

### v0.2 ~ full Level 0 plus selected Level 1 (current)

Released 2026-06-20. Full Level 0 conformance, plus four Level 1 operations that complete natural lifecycle stories.

- Standard message envelope, constructed and validated internally.
- `register` and `deregister` with capability exchange.
- Draft lifecycle: `draft`, `commit`, `discard`.
- `retract` and `supersede`, with chain resolution for supersession.
- `reckon`: relevance ranking plus mechanical conflict detection.
- Relevance scoring on `attune` across topic, role, recency, and intent quality.

What v0.2 does not yet do is scoped to deeper levels: persistence, an event log, full Lamport clocks, confidence on records, polling, embeddings, and transport.

## Planned

### v0.3 ~ full Level 1

The release that completes Level 1. The work here turns the in-memory reference into a durable, ordered, auditable store.

- Persistent storage behind an adapter, so a Field survives process restarts.
- An append-only event log of every operation, and `REPLAY` to reconstruct reasoning chains from it.
- Full Lamport logical clocks, replacing the monotonic counter used in v0.2.
- Confidence on records: a score and the reasoning behind it.
- `since_epoch` polling on `attune`, for subscription by polling.
- Capability negotiation at registration, beyond the exchange placeholder of v0.2.

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
