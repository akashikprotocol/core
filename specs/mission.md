# Mission

What `akashikprotocol/core` is for, who it serves, and the problem it addresses.

Status: Current as of v0.2.0 (June 2026).

---

## The problem

When several AI agents work on the same task, they need a way to share what they have observed and reason about it together.

Most systems today take one of two paths. They pass messages between agents, which loses context quickly as conversations branch and summarise. Or they share a database, which stores values but holds no opinion about what any of them mean or which ones matter right now.

Neither path carries the reasoning behind a piece of state. An agent reading a shared value cannot tell why it was written, what question it was answering, or whether another agent has since recorded something that disagrees with it.

## The approach

Akashik sits between message passing and a shared database. It is a protocol where agents record observations with mandatory intent, and other agents draw on that shared memory through two reading operations.

Three primitives carry the protocol:

- `write`: record an observation, with an intent string that states why it matters.
- `attune`: receive what is relevant to your role and topic, scored and sorted by the protocol.
- `reckon`: the deeper reading operation, which surfaces relevant entries together with the conflicts among them.

The thesis is one sentence. The protocol decides what is relevant and detects disagreement; the agent decides resolution.

Akashik does not pick winners between conflicting observations. It makes the disagreement legible, so the agent can reason about it with full information.

## Who it serves

Two audiences use this SDK.

Developers building multi-agent systems adopt it as the shared-memory layer beneath their agents. It is transport-agnostic and framework-agnostic, so it sits alongside existing tools rather than replacing them.

The agents themselves are the runtime users. An agent registers a role, writes observations as it works, and attunes or reckons before it acts.

## What makes it distinct

Three properties separate Akashik from generic agent infrastructure.

Intent is mandatory on every state change. A reader can always recover why a piece of state exists, not only what it holds.

The reading surface is opinionated. `attune` is not a database query. It is a relevance ranking computed by the protocol, returned with a score and a reason for each entry.

The spec is canonical, and the SDK earns its way up the conformance levels deliberately. Capability is added when it can be implemented honestly at a given level, not all at once.

## This repository

Akashik is the protocol. The specification lives at `github.com/akashikprotocol/spec`.

This repository is the reference SDK, `@akashikprotocol/core` on npm. It is one implementation of the protocol, currently at full Level 0 plus selected Level 1 operations. Others can follow the spec to build their own implementations at any conformance level.

The design discipline that produced this SDK is recorded in [PRINCIPLES.md](../PRINCIPLES.md). How the project is governed is recorded in [GOVERNANCE.md](../GOVERNANCE.md). Where the work is going is recorded in [roadmap.md](./roadmap.md).
