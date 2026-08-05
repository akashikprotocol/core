# Replay

Every other primitive answers "what is true now" or "what should I attend to now". `replay` answers a different question: how did the field get here.

## What replay is for

Intent is mandatory on every state change. That is true of a write, a retract, a supersede, a draft's commit. Because intent travels with every event, not just every entry, the append-only log is not a change feed in the usual sense. It is an ordered sequence of *why*, not just *what*.

`read` and `attune` show you the current, resolved state. `replay` shows you the reasoning that produced it. When entry A is superseded by B, and B by C, the field's current state shows only C. The replay shows all three, each with the intent that motivated it. That sequence, read in order, is the chain of reasoning behind the number you see today.

## The shape

```typescript
const events = await field.replay(query?: ReplayQuery);
```

`ReplayQuery` fields, all optional and combining with AND semantics except `entry_id`:

| Field | Effect |
|---|---|
| `entry_id` | Restrict to events concerning this entry. Combines with chain following (see below). |
| `topic` | Restrict to RECORD events on this topic. Excludes non-RECORD events entirely (see the limitation below). |
| `agent` | Restrict to events from this agent. |
| `sinceSeq` | Only events with seq strictly greater than this. |
| `untilSeq` | Only events with seq less than or equal to this. |
| `followChain` | Defaults to `true` when `entry_id` is set. Set `false` to see only that entry's own events. |

The result is an ordered array of `FieldEvent`, each carrying its `type`, `agent`, `intent` (on RECORD and STATUS_CHANGE), and the causal `lamport` value that places it in the field's total order.

## Chain following

This is the headline capability, and it earns the extra space.

A researcher records an initial pricing observation. A fact-checker corrects it after checking the source directly. A strategist updates it again after the vendor changes its published price. Each step is a `supersede`, and each supersede produces two events: a `STATUS_CHANGE` marking the predecessor superseded, and a `RECORD` creating the new entry, both carrying the intent given to that `supersede` call.

```typescript
const chain = await field.replay({ entry_id: originalId });
```

Read against a real three-link chain, the sequence comes back as:

```
[RECORD]         researcher:    "initial pricing observation from the g2 listing"
[STATUS_CHANGE]   fact-checker:  "correcting the price after a direct source check"
[RECORD]          fact-checker:  "correcting the price after a direct source check"
[STATUS_CHANGE]   strategist:    "updating again after the vendor changed published pricing"
[RECORD]          strategist:    "updating again after the vendor changed published pricing"
```

That reads as a story, not a dump. Each correction's intent appears twice on purpose: once marking why the previous value stopped being current, once recording why the new value exists. The same intent string does both jobs because a single `supersede` call is one decision with two effects, not two decisions.

`followChain` resolves over the *full* event set before any other filter narrows it, and it walks in both directions from the given entry. Starting from the original entry, from the middle correction, or from the final one all return the same three-entry chain. Chain resolution also tracks the same predecessor-forwarding `supersede` already uses: superseding an entry that has itself been superseded lands on the current latest, not a stale link.

## The topic-scoping limitation

Stated plainly rather than discovered the hard way: `replay({ topic })` will not show you a topic's retractions.

`STATUS_CHANGE` events, which carry a retraction or a supersession's predecessor-marking half, carry no `topic` field of their own. A bare topic filter matches only RECORD events, so a topic-scoped replay is structurally incomplete for a full change history. This was identified during the topic-scoping design work and accepted for v0.3 rather than patched around: denormalising topic onto status-change events would fix it, and is a reasonable v0.4 change if real usage asks for it, but it is not free, and nothing in v0.3 depends on it.

The path to a full story on one topic is `replay({ entry_id })` with chain following, not `replay({ topic })`. If the entry id is not known in advance, `read({ topic })` or `attune({ topic })` will surface it.

## Composability instead of a new surface

There is no `stateAt()` method, and none is planned for v0.3. State at any point is composable from parts that are already public:

```typescript
import { buildProjection } from "@akashikprotocol/core";

const eventsUpToThen = await field.replay({ untilSeq: someSeq });
const stateAtThatPoint = buildProjection(eventsUpToThen);
```

`buildProjection` is the same function the field itself uses internally to derive current state from the log. Exposing it, rather than adding a dedicated time-travel method, keeps the public surface smaller and the guarantee stronger: state-at-a-point is not a separate code path that could drift from the field's own logic, it is the same code path run over a bounded slice of the same log.

## replay versus attune({ since_epoch })

Both let a caller ask "what happened since I last looked". They answer different versions of that question.

`attune({ since_epoch })` is relevance-ranked and shows only what is currently visible: new entries and new supersessions, never retractions, and subject to `max_units` truncation by score rather than by time. It answers "what is newly relevant to me".

`replay({ sinceSeq })` is chronological, complete, and unranked. It shows every event, including status changes, in causal order. It answers "what happened".

Use `attune` when the caller is about to act on what is currently true. Use `replay` when the caller needs the complete, ordered history, including what stopped being true and why.
