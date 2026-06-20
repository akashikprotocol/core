# Changelog

All notable changes to `@akashikprotocol/core` are recorded here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows the versioning policy in [GOVERNANCE.md](./GOVERNANCE.md).

## [Unreleased]

### Added

- `GOVERNANCE.md`: who decides what, how contributions flow, and the relationship to the spec repository.
- `PRINCIPLES.md`: the design constitution that produced v0.1 and v0.2. PRs that conflict with it are rejected by default.

### Changed

- Factored the shared visibility, scoring, and truncation logic out of `attune` and `reckon` into a single internal `scopedView` helper. Behaviour is identical; the public surface is unchanged.

### Fixed

- Corrected the `register` error table in `API.md`. Invalid `id` or `role` rejects with `AGENT_REQUIRED`, and invalid `capabilities` rejects with `INVALID_ENTRY`. The previous table named `INVALID_ENVELOPE`, which the code never raised for `register`.

## [0.2.0] - 2026-06-20

Full Level 0 conformance plus selected Level 1 operations. All v0.1 code continues to work; the additions are at the API surface.

### Added

- Standard message envelope wrapping every operation. Constructed and validated internally; it does not cross a transport in this release.
- `register` and `deregister` with capability exchange. Registration is idempotent per id.
- Draft lifecycle: `draft`, `commit`, and `discard`. Drafts are private to their author until committed.
- `retract`: withdraw a committed entry. Author-only and idempotent.
- `supersede`: replace an entry with a newer one. Any agent may supersede, and chains resolve to the latest entry.
- `reckon`: relevance ranking plus conflict detection over the surfaced set. Conflicts are reported on shared primitive keys at a matching topic.
- Relevance scoring on `attune` across four components: topic, role, recency, and intent quality. Each scored entry carries a `relevance_score` and a `relevance_reason`.
- `max_units` truncation and an optional `role` on `attune`.
- Auto-generated `epoch` and `status` on every entry.
- Error codes `DRAFT_NOT_FOUND`, `RETRACT_NOT_AUTHORIZED`, `ENTRY_NOT_FOUND`, and `INVALID_ENVELOPE`.

### Changed

- `attune` returns entries ordered by relevance score descending, with epoch descending as the tiebreaker. v0.1 returned write order. The return type widens additively to `FieldEntryWithRelevance`; the existing fields are unchanged.
- `attune` and `reckon` exclude retracted and superseded entries, and exclude the calling agent's own committed entries.

### Notes

- Conformance: full Level 0, plus DEREGISTER, RETRACT, SUPERSEDE, and DETECT in list mode (surfaced as `reckon`) from Level 1.
- Not yet present: persistent storage, append-only event log, full Lamport clocks (a monotonic counter is used), confidence on RECORD, `since_epoch` polling, vector embeddings, and transport bindings. These are scoped to later releases.

## [0.1.0] - 2026-05-03

First public release. Partial Level 0: the foundation the rest of the protocol builds on.

### Added

- `createField` with an in-memory store and a configurable minimum intent length.
- `write`: record an entry with a mandatory intent string.
- `read`: declarative query over recorded entries.
- `attune`: surface entries from other agents, filtered by topic and excluding the caller's own writes.
- `AkashikError` with codes `INTENT_REQUIRED`, `INTENT_TOO_SHORT`, `INVALID_ENTRY`, `INVALID_QUERY`, and `AGENT_REQUIRED`.

[Unreleased]: https://github.com/akashikprotocol/core/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/akashikprotocol/core/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/akashikprotocol/core/releases/tag/v0.1.0
