# Attunement

The other two primitives are table-stakes. Most memory systems have something like `write` and `read`. They might call them `store` and `fetch`, or `set` and `get`, but the shape is familiar.

`attune` is the primitive that earns the protocol's existence.

## What attune is

`attune` answers a different question than `read`.

`read` is declarative: *here is the shape of what I want, give me the entries that match*. The caller specifies the filter; the field obeys.

`attune` is opinionated: *I am this agent, I am thinking about this topic, what should I be paying attention to*. The caller asks for relevance; the field decides what relevance means.

The difference matters because most agent systems built today don't have an answer to "what should this agent attend to right now". They search keywords. They retrieve by similarity score. They feed everything in and hope the model figures it out. Each of those is a workaround for the missing primitive.

## What attune does in v0.1

The v0.1 definition is deliberately the simplest thing that demonstrates the primitive:

> Entries not authored by the calling agent, optionally filtered by topic, returned in write order.

That's it. No recency weighting. No intent clustering. No conflict surfacing. No similarity score. The dumbest possible relevance function, shipped on purpose.

Why dumb on purpose: the protocol's job in v0.1 is to make the *interface* canonical. Once `attune({ agent, topic? })` is a fixed shape that consumers code against, the field's internal definition of relevance can deepen across versions without breaking a single line of consumer code.

## What attune does NOT do (yet)

Three things deliberately deferred to v0.2 and beyond:

**Recency weighting.** v0.1 returns entries in write order, oldest first. v0.2 will introduce recency-aware ranking — newer entries surface higher when they're relevant.

**Intent clustering.** v0.1 returns every non-authored, topic-matching entry. v0.2 will recognise when multiple entries express related intents (`"gathering market signal"` and `"flagging data quality"` are about the same workflow stage) and present them grouped.

**Conflict surfacing.** v0.1 doesn't notice when two entries on the same topic carry incompatible intents. v0.2 will flag conflicts to the attuning agent so the agent reasons about the disagreement before acting.

Each of these is a v0.2 launch moment, not a v0.1 oversight.

## Why intent travels with the entry

When `attune` returns a list of entries, each entry carries the intent its author wrote it with. This is not metadata. It is the difference between *what* the field says and *why* the field says it.

A writer attuning to "competitor-pricing" sees that the researcher logged `$49/mo` with intent *"gathering market signal for pricing recommendation"*. The writer also sees that the fact-checker flagged the same entry with intent *"flagging data quality before the writer uses it"*.

The writer is now in a different epistemic position than they would be with raw data alone. The same number, framed differently, leads to different decisions. Intent is what makes the framing legible.

This is the protocol's whole thesis. Every other primitive exists to make this one usable.

## When to use attune vs read

Use **`read`** when the caller knows what they want and asks for it directly. Auditing the field. Reporting on activity. Querying for a specific entry by id, topic, or other key.

Use **`attune`** when the caller is an agent about to make a decision. Before writing. Before deciding. Before acting. `attune` is the call you make when you want the field to tell you what matters.

If the answer to "should I use `read` or `attune`" is "I'm not sure", you probably want `attune`. The protocol is designed so that `attune` is the right answer most of the time, in agentic contexts. `read` is the escape hatch for everything else.
