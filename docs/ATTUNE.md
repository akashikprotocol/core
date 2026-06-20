# Attunement

The other two primitives are table-stakes. Most memory systems have something like `write` and `read`. They might call them `store` and `fetch`, or `set` and `get`, but the shape is familiar.

`attune` is the primitive that earns the protocol's existence.

## What attune is

`attune` answers a different question than `read`.

`read` is declarative: *here is the shape of what I want, give me the entries that match*. The caller specifies the filter; the field obeys.

`attune` is opinionated: *I am this agent, I am thinking about this topic, what should I be paying attention to*. The caller asks for relevance; the field decides what relevance means.

The difference matters because most agent systems built today don't have an answer to "what should this agent attend to right now". They search keywords. They retrieve by similarity score. They feed everything in and hope the model figures it out. Each of those is a workaround for the missing primitive.

## What attune does in v0.2

`attune` now runs a four-component relevance scoring pass, sorts by score, and optionally truncates the result:

> Entries not authored by the calling agent, optionally filtered by topic, scored by relevance, sorted highest-first, capped by max_units.

The scoring function weights four components:

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| topic     | 0.60   | Does the entry's topic match the caller's topic? |
| role      | 0.20   | Does the writer's role match the caller's role? |
| recency   | 0.15   | How recently was the entry written (relative to the visible set)? |
| intent    | 0.05   | How substantive is the entry's intent string? |

The weights sum to 1.0. Every entry gets a `relevance_score` in [0, 1] and a `relevance_reason` breakdown.

The interface is `attune(context: AttuneContext)`:

```typescript
const entries = await field.attune({
  agent: "writer",
  topic: "competitor-pricing",   // optional — filters and boosts topic score
  role: "researcher",            // optional — explicit role for scoring
  max_units: 5,                  // optional — cap on returned entries (default 100)
});

entries[0].relevance_score   // 0.0 to 1.0
entries[0].relevance_reason  // { components: { topic, role, recency, intent }, summary }
```

## Tuning the result

**`topic`** — When provided, attune filters to entries whose `entry.topic` matches exactly AND adds the full topic weight (0.6) to their score. When omitted, attune scans the full field and only scores on the other three components.

**`role`** — When provided, attune uses this role for the role-match scoring instead of (or in addition to) the calling agent's registered session role. Useful for agents calling attune without prior registration, or for agents temporarily adopting a different scoring perspective.

**`max_units`** — When provided, only the top N entries by score are returned. Entries beyond the cap are dropped (lowest-relevance first). Negative values throw `INVALID_QUERY`. Zero returns an empty array. Defaults to 100.

## What you do and don't see

**You never see your own committed entries.** The self-filter is unconditional. Entries where `agent === your-agent-id` are excluded regardless of topic, score, or any other factor. The reasoning: attune is for situational awareness, not a mirror.

**You see your own drafts.** Draft entries you've created (status `"draft"`) are visible to you via attune. Other agents' drafts are never visible — they're in the drafts map, not the entries array. Drafts are treated like committed entries for scoring purposes.

**Retracted and superseded entries are never visible.** Status filtering runs after the self-filter and before scoring. Only entries with `status === "committed"` from other agents, plus your own drafts, participate in scoring.

**Supersession chains resolve automatically.** If entry X was superseded by entry Y, only Y appears in attune results. X is marked `"superseded"` and filtered out. The chain always presents the latest.

## Why intent travels with the entry

When `attune` returns a list of entries, each entry carries the intent its author wrote it with. This is not metadata. It is the difference between *what* the field says and *why* the field says it.

A writer attuning to "competitor-pricing" sees that the researcher logged `$49/mo` with intent *"gathering market signal for pricing recommendation"*. The writer also sees that the fact-checker flagged the same entry with intent *"fact-checker correction after verifying directly with the source"*.

The writer is now in a different epistemic position than they would be with raw data alone. The same number, framed differently, leads to different decisions. Intent is what makes the framing legible.

This is the protocol's whole thesis. Every other primitive exists to make this one usable.

## When to use attune vs read

Use **`read`** when the caller knows what they want and asks for it directly. Auditing the field. Reporting on activity. Querying for a specific entry by id, topic, or other key.

Use **`attune`** when the caller is an agent about to make a decision. Before writing. Before deciding. Before acting. `attune` is the call you make when you want the field to tell you what matters.

If the answer to "should I use `read` or `attune`" is "I'm not sure", you probably want `attune`. The protocol is designed so that `attune` is the right answer most of the time, in agentic contexts. `read` is the escape hatch for everything else.

## When to reach for reckon instead

`attune` surfaces what's relevant. It does not comment on whether entries agree or disagree.

When the calling agent's reasoning depends on knowing whether disagreement exists among the visible entries, use `reckon` instead. `reckon` returns the same scored, sorted entries as `attune` — plus a `conflicts` array describing pairs of entries that disagree on shared primitive keys.

See [RECKON.md](./RECKON.md) for the full conflict detection specification.

The rule of thumb: use `attune` when you're going to act on the surface. Use `reckon` when you need to know about disagreement before you decide how to act.
