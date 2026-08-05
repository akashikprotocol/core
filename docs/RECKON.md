# Reckon, the protocol's conflict-aware primitive

`reckon()` is `attune`'s deeper sibling. Same input shape. Richer return shape. Where attune surfaces what's relevant, reckon surfaces what's relevant *and the disagreements among it*. The agent reasons about both before acting.

## What it does

Two agents writing to the same topic with different facts produce a real disagreement. `attune` would surface both entries, sorted by relevance, with no commentary. `reckon` surfaces both plus a `conflicts` array describing where they disagree.

```typescript
const result = await field.reckon({
  agent: "writer",
  topic: "competitor-pricing",
});

result.entries     // Same as attune: relevant entries, scored, sorted
result.conflicts   // Pairs of entries that disagree on shared primitive keys
```

A `Conflict` carries:

- `a` and `b`, the two `FieldEntry` values that disagree
- `keys`, the specific keys whose values differ, alphabetically sorted

## Why a separate method

`attune` and `reckon` exist as distinct methods, not as one method with a flag. The reasoning is mental model: they answer different questions.

- `attune` says *"surface what's relevant; I'm going to act."* Conflicts, if they exist, are not part of the decision the agent is making.
- `reckon` says *"I want to act, but I want to know about disagreement first."* Conflicts are the feature, not an exception.

Most modern APIs distinguish similar pairs this way. `Array.find` and `Array.filter` overlap conceptually; the caller picks based on what they're expressing. Same here. The simpler tool is the right default; reach for the deeper one when conflict-aware reasoning is the actual job.

## What counts as a conflict

A pair of entries conflicts when all of the following hold:

1. Their `topic` matches exactly (strict `===`).
2. They share at least one other key in `entry`.
3. The values at that shared key are both primitives (string, number, boolean, null) and they differ.

This is *mechanical* conflict detection. It does not understand that `"$49/mo"` and `"$50 per month"` are the same number stated differently, or that `"competitor priced low"` and `"competitor priced high"` are semantically opposed. Mechanical means strict equality on primitive values. Semantic conflict reasoning is v0.4 (Level 2), powered by vector embeddings.

The deliberate trade-off: mechanical detection works without an LLM, without embeddings, without any external dependency. It catches the *clear* cases: agents writing different prices, dates, status codes, counts, names. It misses semantic disagreements. The next conformance level closes that gap.

## What it deliberately does not do

`reckon` surfaces conflicts. It does not resolve them.

The protocol takes no stance on which entry "wins" when two agents disagree. There is no `suggested` field on `Conflict`, no `basis: "latest-wins"` annotation, no automatic resolution.

The reasoning is that resolution is domain-specific in a way detection isn't. The same conflict between two pricing observations could correctly resolve as:

- Most recent wins (data freshness matters)
- Highest-confidence wins (some sources are more reliable)
- Both held simultaneously (the agent treats it as a range, not a point)
- Escalate to a human (the disagreement is the signal)

Each strategy is valid in some context. The protocol picking one silently is exactly the wrong move: it bakes a domain assumption into the wire format. Better to surface the disagreement clearly and let the agent decide.

### Confidence does not change this

An entry's `confidence`, if the writer supplied one, is visible on both sides of a conflict, exactly like it is on any `attune` result. It is not used to rank the two entries against each other, not used to suppress a conflict when one side reports low confidence, and not used to pick a "winner" automatically.

A high-confidence wrong observation and a low-confidence correct one are exactly the situation where the reading agent, holding domain knowledge the protocol cannot have, must decide. If `reckon` silently favoured the higher-confidence entry, it could bury the correct answer behind a number the writer estimated, not verified. The same reasoning that rejects auto-resolution by recency or by an unstated priority rejects auto-resolution by confidence. Confidence is an input to the agent's decision, not to the protocol's.

## Visibility rules

Conflicts only surface between entries that appear in `result.entries`. If an entry is invisible to the caller, because they wrote it themselves, or because it was retracted or superseded, it does not appear in conflicts.

The reasoning: showing "you conflict with an entry you can't see" is incoherent for the agent. Conflict surfacing follows the same visibility rules as attune.

This also means `max_units` truncation interacts with conflicts. If `max_units: 2` and three conflicting entries exist, only the top two by relevance survive truncation, and only conflicts between *those two* surface. The third entry's conflicts are silently dropped.

### since_epoch and reckon

`reckon` accepts `since_epoch` exactly as `attune` does, since the two share `AttuneContext`. The same visibility rule applies: `reckon({ since_epoch })` detects conflicts only among the entries that survive the watermark filter, which means conflicts between a newly-arrived entry and an older one that was already polled will not surface on that call. A caller polling with `reckon` sees conflicts *among what is new*, not the full conflict picture. A caller that needs complete conflict detection should call `reckon` without `since_epoch`.

## Edge cases worth knowing

- **Object-valued shared keys do not produce conflicts.** If two entries share a key whose values are both objects, no conflict surfaces even if the objects differ. Deferred to v0.4 with semantic detection.
- **Each pair appears once.** A vs B is the same conflict as B vs A. The result includes one pair, not two.
- **An entry never conflicts with itself.** Same id can't appear on both sides.
- **Same value, no conflict.** Two agents both writing `{ topic: "x", price: "$49" }` agree. No conflict.

## Ordering

Conflicts are returned ordered by the timestamp of the second-written entry in each pair, ascending. The most recently-emerging conflicts appear last in the array. This is deterministic and lets consumers display "newest disagreements at the bottom" without re-sorting.

## When to use which

- Use `attune` when the agent will act on what surfaces. Conflicts are not part of the decision.
- Use `reckon` when the agent's reasoning depends on whether disagreement exists: the strategist deciding whether to escalate, the writer choosing which source to trust, the fact-checker reviewing claims.

If unsure, use `attune`. The simpler primitive is the right default. Reach for `reckon` when conflict-aware reasoning is genuinely part of the work.
