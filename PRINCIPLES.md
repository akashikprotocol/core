# PRINCIPLES.md

This document states the design philosophy that produced v0.1 and v0.2, so that future work holds to the same standard.

Status: Current as of v0.2.0 (June 2026).

---

These principles are binding, and they are meant as a shared footing rather than a gate. A pull request that conflicts with one is returned with a reason, not waved through by default. They are not decoration, and they are not aspiration. They describe how this SDK is actually built, so that a contributor can read them and know what to expect.

## 1. The protocol thesis

Akashik is an open standard for shared memory in multi-agent AI systems. The protocol decides what is relevant and detects disagreement; the agent decides resolution.

Every principle below either supports that thesis or is named as out of scope.

## 2. The eight principles

### Principle 1: Intent is mandatory.

Every state-changing operation requires a non-trivial intent string.

The thesis is that intent makes multi-agent state legible. A reader of the field can see not only what an agent recorded but why it was recorded. Writes, drafts, retractions, supersessions, and discards all require intent. The minimum length is configurable per field and defaults to 10 characters. No path through the SDK produces a state change without an associated intent. `write` rejects a missing intent with `INTENT_REQUIRED` and a short one with `INTENT_TOO_SHORT`, and the same rule holds for `draft`, `discard`, `retract`, and `supersede`. The discard case is deliberate: the reason for withdrawing a draft is itself a signal worth recording.

Intent is enforced at runtime, not by convention or by type signature alone. A caller cannot satisfy the requirement with an empty string or whitespace; the trimmed length is what counts.

### Principle 2: Spec is canonical; the SDK earns its way up the conformance levels.

The spec defines the protocol. This SDK is one implementation of it.

The spec is the authoritative reference for what the protocol does. The SDK ships at a stated conformance level, and reaching the next level is a deliberate release decision rather than a casual additive change. v0.2 reaching full Level 0 plus selected Level 1 operations was such a decision, scoped and frozen at the design stage before code began. An implementation that diverges from the spec carries a bug in the implementation, not a feature. Where the spec and the SDK disagree, the spec is right by definition. The same discipline applies downward: a capability that belongs to a higher level is not back-ported into a lower one to make a release look more complete.

### Principle 3: The protocol decides, the agent acts.

`attune` surfaces what is relevant. `reckon` surfaces conflicts among what is relevant. Neither resolves anything.

Resolution strategies, latest-wins, priority-based, intent-based, or escalate-to-human, are domain-specific and belong in agent code. The protocol does not pick winners. `reckon` returns conflicting pairs with the keys on which they disagree and hands that back to the caller untouched. Making the disagreement legible is the protocol's job. Deciding what to do about it is not.

When a researcher records a competitor price of 49 and a fact-checker records 39 at the same topic, `reckon` reports the pair and the key, `price`, on which they differ. It does not declare the fact-checker correct. A version that added a default resolution would be making a decision that belongs to the agent.

### Principle 4: Mechanical now, semantic later.

Each conformance level adds capability that does not depend on the next level being available.

Level 0 relevance scoring is feature-weighted: topic, role, recency, and intent quality, combined into a single score in the range zero to one. Level 2 adds vector embeddings on top. Level 0 conflict detection is mechanical key-value comparison over shared primitive keys at a matching topic. Level 2 adds intent-based reasoning. The mechanical layer is a foundation, not a stepping stone to be discarded. An implementation may stop at any conformance level and remain useful.

This matters to adopters. A team can take Level 0, run it with no embedding model and no vector store, and get relevance ranking and conflict detection that work. Nothing about Level 0 is a placeholder waiting for Level 2 to arrive.

### Principle 5: Backward compatibility within a major version.

Once a method, type, or error code ships at `0.X.0`, its shape does not change within the `0.X.Y` series.

Behaviour changes that an earlier consumer might notice are documented explicitly. v0.2 changing `attune` ordering from write-order to relevance-sorted was such a change, and it was called out in the design document rather than left to surprise. New capability arrives additively: optional parameters, widened return types, new methods. `FieldEntryWithRelevance` widened the old entry shape without removing a field. Breaking changes happen at major version boundaries and are deliberate.

The cost of a broken shape is borne by every consumer at once, often silently, at a version bump they expected to be safe. That asymmetry is why the rule is strict rather than best-effort within a major line.

### Principle 6: Naming uses single evocative verbs with deliberate gravity.

Public methods are named with intention.

The vocabulary register is contemplative where the operation warrants it: `attune`, `reckon`, `supersede`. Where standard protocol vocabulary serves users better, that wins: `register`, `deregister`. Where lifecycle clarity matters more than evocation, that wins: `commit`, `discard`. The convention is not ornament; it sets a reader's expectation about what an operation means before they read its signature. New method names are reviewed against it.

`reckon` is the clearest case. A plainer name like `query` or `detectConflicts` would describe the mechanism and lose the stance: the caller is reckoning with the field before acting, not running a search.

### Principle 7: No marketing language anywhere.

No "powerful," "fast," "easy-to-use," "best-in-class," "robust," "delightful," "amazing."

Describe what the SDK does, not what is good about it. This holds in the README, the docs, the code comments, the commit messages, and the changelog. The subtle forms are caught too: "performant," "intuitive," "elegant." If a phrase reads as a value claim rather than a fact, it does not ship. A reader can judge whether the SDK is good. The documents state what it is.

### Principle 8: Refuse scope creep at the design layer.

Each conformance level is scoped to what the next layer requires, not to everything the current layer could contain.

v0.2 reached Level 0 plus selected Level 1 because those operations completed lifecycle stories: an agent that registers can deregister, an entry that is written can be retracted or superseded, a conflict that exists can be surfaced through `reckon`. It did not include persistence or vector embeddings, because those belong to deeper levels. A feature arriving "while we are here" is rejected by default. Scope expansion across stories is what produces shipping delays and broken contracts.

The temptation is real during a build that is going well: the next feature looks close, the code is open, adding it feels free. It is not free. It widens the surface that every later version must keep compatible.

## 3. Anti-patterns to refuse on sight

This codebase will not accept the following. Each carries its reason. These are the concrete shapes the principles take when a change is in front of a reviewer; most rejected pull requests fail one of these, not an abstract principle.

- Folding two methods into one with a flag parameter. Each method has a single job; flag-based polymorphism produces methods with several jobs and confused implementations.
- Adding fields to a published shape "while we are here." Every shape addition is a deliberate version decision.
- Implementing transport bindings before Level 3. Transport bindings belong to v0.5 and later. v0.2 wraps and validates envelopes but does not cross any wire.
- LLM calls inside protocol primitives. Level 0 and Level 1 are mechanical. Semantic reasoning is Level 2.
- In-place editing of drafts. The pattern is discard then redraft. Editing introduces history tracking that belongs to Level 1's event log.
- Auto-resolution of conflicts. The protocol surfaces; the agent decides. Suggested resolutions, latest-wins defaults, and priority-based merging all belong in agent code.
- Removing or renaming a public export within a minor version. Even when a rename reads as clearer, every consumer pays the cost.
- Marketing copy in READMEs, docs, or comments, including the subtle forms: "performant," "intuitive," "elegant."
- Skipping verification between stories during a build. Each story verifies against tests before the next begins. This is enforced at the development workflow level, not only at CI.
- "Improving" earlier code that works. A correct function is left alone. Refactoring without a feature-driven reason is a separate decision.

## 4. Decision-making heuristics

Three heuristics resolve most design ambiguity.

Defer scope. When unsure whether something belongs in v0.X or v0.X+1, default to v0.X+1. Shipping less is recoverable. Shipping a feature that cannot be sustained is not. A deferred feature can ship next cycle; a feature that shipped and cannot be maintained has to be removed, which is itself a breaking change.

Prefer optional over required. When adding a parameter to a public method, prefer optional with a sensible default. A required parameter is a breaking change. An optional one is additive. The default carries the old behaviour, so existing callers see no change while new callers gain the parameter.

One purpose per method. When a method has a mode parameter that changes its behaviour substantially, it is two methods, not one. The `attune` and `reckon` split follows this: they share a scoring core but stay separate because one adds conflict detection and the other does not.

## 5. When principles conflict

The principles can produce tension in real cases. The resolution rule is short.

When principles conflict, Principle 2, spec is canonical, wins over all others. When Principle 2 is not at stake, the maintainer makes the call and documents it in the PR description.

A worked case: a clearer method name (Principle 6) that would rename a published export (Principle 5 forbids it within a minor version) is not a standoff. Principle 5 holds, and the rename waits for a major version.

This keeps the principles a foundation rather than handcuffs. They are not sacred. They are the default, and the default is overridden in the open, with a reason on the record.

## 6. How this document evolves

Changes to this document require a separate PR with no code changes attached. A principle change is discussed in a GitHub Discussion before the PR is opened. A new principle is added only when an actual contribution has surfaced a gap the existing principles do not address. Updating this document follows the contribution flow in `GOVERNANCE.md`.

This prevents principle drift through "while we are here" edits. The list stands at eight. It grows only when the work proves it must.

---

This document is canonical. It governs how `akashikprotocol/core` is maintained and built. PRs that conflict with it require either an exemption stated in the PR description or a separate PR updating the document.
