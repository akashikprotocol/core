# GOVERNANCE.md

This document defines who makes decisions for `akashikprotocol/core`, how those decisions are made, and how contributions move through the repository.

Status: Current as of v0.2.0 (June 2026).

---

## 1. Maintainership (current state)

`akashikprotocol/core` is maintained by a single person. Sahil David holds that role today, as benevolent dictator for life (BDFL).

The BDFL model here is a statement of openness, not authority. Decisions are made in the open. Substantive changes are raised in GitHub Discussions or Issues, discussed there, and committed only after that discussion has run. Disagreement is welcome and engaged with directly.

Working in the open means the reasoning behind a decision is recoverable. A decision recorded only in a maintainer's head is not governance; a decision recorded in a Discussion or an Issue thread is. A contributor can read why a past choice was made and challenge it on those terms.

Final decisions on SDK shape, release cadence, and conformance commitments rest with the maintainer. That authority holds until governance opens up under the criteria in Section 2, at which point it is shared.

The maintainer's authority is bounded by the project's published commitments. The conformance ratchet in Section 5 and the backward compatibility rule in `PRINCIPLES.md` hold regardless of who decides. A claimed conformance level cannot be withdrawn, and a published shape cannot break inside a major version. The discretion is over what gets built next, not over promises already made.

The honest description of the project today is one maintainer who works in public. It is not a working group, and it is not a broad contributor community yet. Naming that plainly is more useful to anyone evaluating Akashik than a polite fiction would be.

## 2. Path to expanded maintainership

Maintainership opens to additional maintainers when at least two non-original-maintainer contributors have made substantive merged contributions over a 90-day rolling window.

A substantive contribution is non-trivial. A feature implementation, a meaningful bug fix carried by tests, or a documentation expansion that fills a real gap all count. Typo fixes, dependency bumps, and comment polish do not.

A merged contribution counts only once it has landed on the default branch with CI passing. An open pull request, a draft, or a reverted change does not count toward the window. The window is rolling rather than cumulative so that the signal is sustained participation, not a single burst of activity that then stops.

Two contributors rather than one guards against a single highly active contributor becoming a second single point of failure. The aim of opening governance is resilience, not headcount.

When that trigger is met, governance shifts to a multi-maintainer model with three changes:

- Major version bumps require agreement from at least two maintainers.
- The maintainer set is named in this document.
- A deprecation policy is added. None exists today because the BDFL stage does not need one.

Until the trigger is met, this document stands as written.

## 3. Decision types and where they live

Decisions fall into three categories, and they do not all live here.

Protocol-shape decisions cover additions, removals, or changes to the wire protocol or its semantics. These belong to the spec repository, `akashikprotocol/spec`, not here. This SDK implements what the spec states.

SDK-shape decisions cover release cadence, conformance level commitments, version policy, and breaking changes within a major version. These belong here.

Editorial decisions cover naming, comments, documentation phrasing, and test organisation. These are maintainer discretion and need no formal process.

When the category of a change is unclear, ask in a GitHub Discussion before writing code. A pull request that changes protocol shape will be redirected to the spec repository. A change to relevance scoring math is SDK-shape and lives here; a change to which fields a memory unit carries on the wire is protocol-shape and lives in the spec.

The boundary between SDK-shape and protocol-shape is the one that matters most in practice, because a change can look local while altering what the protocol promises. When the surfacing behaviour of `attune` changes, that is SDK-shape. When the meaning of an intent string changes, that is protocol-shape.

## 4. Contribution flow

A contribution moves from idea to merged commit in four steps.

First, discussion. Substantive changes start as a GitHub Discussion or Issue. The maintainer engages with the proposal before code is written, which avoids wasted effort on both sides.

Second, design alignment. A change with architectural depth references `PRINCIPLES.md` and states how it aligns with or extends those principles.

Third, a pull request with full context. The PR states what changes, why, which tests verify it, what backward compatibility implications it carries, and what conformance level impact it has, if any.

Fourth, review and merge. The maintainer reviews against the principles, the conformance commitments, and the stated scope of the change. Most changes either merge or come back with specific feedback. When a change is returned, the reason comes with it and points at the relevant principle, so the path forward is clear.

CI must pass before merge. There are no exceptions. A CI failure means the change is not ready, regardless of stated urgency.

Verification is not deferred to CI alone. During a multi-story build, each story verifies against the test suite before the next begins, which is how v0.2 was built. A change that passes only at the end, after several stories have accumulated, hides which story broke a contract. The discipline is described in `PRINCIPLES.md` and is expected of larger contributions.

## 5. Versioning policy

The project follows SemVer with explicit clarifications.

A patch release (`0.2.x` to `0.2.y`) carries bug fixes, performance changes that do not alter the public surface, and documentation updates.

A minor release (`0.x.0` to `0.y.0`) carries new features at the API surface, additive type changes, and conformance levels newly reached or extended.

A major release (`x.0.0` to `y.0.0`) carries breaking changes to the public API. The project reserves the right to make breaking changes at major boundaries and commits to never making them silently within a major version.

While on `0.x`, backward compatibility is best-effort and not guaranteed across minor versions. That guarantee tightens at `1.0`.

SDK version maps to protocol conformance level as follows:

- v0.1: partial Level 0 (foundation).
- v0.2: full Level 0 plus selected Level 1 operations (current).
- v0.3: full Level 1 conformance (planned).
- v0.4: Level 2 conformance (planned).
- v0.5: Level 3 conformance (planned).
- v1.0: stable API, conformance level frozen for the major version.

Conformance level transitions are minor version bumps, not major. The conformance ratchet runs one way: once a level is claimed, that level's requirements are permanent commitments. A later release may add capability above a claimed level, but it may not drop below one.

Conformance is asserted in the README and the design documents, and it is backed by the test suite rather than by claim alone. A release that states a conformance level carries the tests that exercise that level's required operations. Dropping or weakening one of those tests is a breaking change to the conformance claim, not a routine edit.

## 6. Relationship to the spec repo

The Akashik Protocol Specification lives at `github.com/akashikprotocol/spec`. The relationship between spec and SDK runs one way.

This SDK implements what the spec states. Changes to the spec reach this repository through new releases. Changes to this SDK do not modify the spec.

A contributor who wants to propose a protocol change opens that discussion in the spec repository. This document does not constrain the spec repository's governance. The spec repository will adopt its own model when the time comes.

Spec version and SDK version move independently. The SDK at v0.2 implements a specific draft of the spec; a later spec revision does not retroactively change what a published SDK version did. The mapping between the two is recorded in each release.

## 7. Conduct expectations

The expectations are short and specific, and they are meant in good faith. A separate Code of Conduct is out of scope.

Be specific. Feedback lands best when it points at the line and says what would help; a bare "this is wrong" leaves the reader guessing.

Be patient. Maintainers reply as time allows. This is volunteer work.

Be honest about scope. When a title and a diff agree, review goes smoothly for everyone. A "small fix" that turns out to span 500 lines across three concerns is easier to review when it arrives as three changes.

Be respectful of design discipline. The principles in `PRINCIPLES.md` are open to challenge, and a well-argued case is welcome. Overriding them in passing, without that conversation first, is what does not work.

These are expectations, not a contract. They hold for the maintainer as much as for anyone contributing.

## 8. What this document does not cover

Several topics sit outside this document by design:

- Marketing, public communications, and social presence, which are managed separately.
- Hosting, infrastructure, and cloud, which do not apply to a library rather than a service.
- Trademarks and brand assets, which are managed separately.
- Commercial licensing. Apache 2.0 applies, and that is sufficient.

---

This document is canonical. It governs how `akashikprotocol/core` is maintained and built. PRs that conflict with it require either an exemption stated in the PR description or a separate PR updating the document.
