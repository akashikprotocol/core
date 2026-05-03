# The Akashik Protocol

### A Shared Memory and Coordination Protocol for Multi-Agent AI Systems

![Version](https://img.shields.io/badge/version-0.1.0--draft-blue)
![Status](https://img.shields.io/badge/status-Draft%20Specification-yellow)
![Author](https://img.shields.io/badge/author-Sahil%20David-lightgrey)
![Date](https://img.shields.io/badge/date-March%202026-lightgrey)
[![License: CC BY 4.0](https://img.shields.io/badge/license-CC%20BY%204.0-green)](https://creativecommons.org/licenses/by/4.0/)

---

## Abstract

The Akashik Protocol defines a standard set of operations, data types, and behavioral contracts for enabling shared memory, contextual awareness, and coordination between multiple AI agents operating within a common system.

It is transport-agnostic, framework-agnostic, and designed to sit as the missing coordination layer beneath existing communication standards. Where MCP defines how an agent accesses tools and data, and A2A defines how agents communicate with each other, the Akashik Protocol defines what agents **share**, how they **stay coordinated**, and how they **resolve contradictions** - without a central controller.

![Akashik Agent Stack](./assets/agent-stack-min.png)

---

## Table of Contents

1. [Notation and Conventions](#1-notation-and-conventions)
2. [Design Principles](#2-design-principles)
3. [Architecture](#3-architecture)
4. [Core Concepts](#4-core-concepts)
5. [Data Types](#5-data-types)
6. [Protocol Operations](#6-protocol-operations)
7. [State Machines](#7-state-machines)
8. [Error Model](#8-error-model)
9. [Conformance Levels](#9-conformance-levels)
10. [Transport Bindings](#10-transport-bindings)
11. [Security](#11-security)
12. [Future Work](#12-future-work)
13. [Appendix A: Wire Format Examples](#appendix-a-wire-format-examples)
14. [Appendix B: Protocol Comparison](#appendix-b-protocol-comparison)
15. [Appendix C: JSON Schema Reference](#appendix-c-json-schema-reference)

---

## 1. Notation and Conventions

The key words "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "NOT RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) [[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119)] [[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)] when, and only when, they appear in all capitals, as shown here.

### Informational Code Examples

This specification uses TypeScript-style interface definitions for readability. These are **informational, not normative**. The canonical data format is JSON as defined in the [JSON Schema Reference (Appendix C)](#appendix-c-json-schema-reference). Implementations MAY use any programming language.

### Terminology

| Term | Definition |
|:---|:---|
| **Field** | The shared knowledge space that all agents interact with. Holds memory units and manages relevance delivery. |
| **Agent** | An autonomous entity that reads from and writes to the Field. Each agent has an identity and a declared role. |
| **Memory Unit** | The atomic unit of knowledge. A single finding, decision, observation, or intention recorded by an agent. |
| **Scope** | A filter that determines which memory units an agent receives during attunement. |
| **Intent** | The stated purpose behind a memory unit — why it was recorded and what question it answers. |
| **Epoch** | A logical time value. Each operation advances the epoch. Used for causal ordering. |
| **Session** | A bounded period of coordinated agent activity with a defined goal. |

---

## 2. Design Principles

The Akashik Protocol is built on five design principles. These inform every operation, data type, and behavioral contract in the specification.

### 2.1 Intent Over Outcome

Every memory unit records not just what was found or decided, but **why**. The reasoning, assumptions, and confidence behind a finding are first-class citizens of the protocol. A memory unit without intent is invalid.

This ensures that any agent - or any human - can reconstruct the full reasoning chain behind any state of the system.

### 2.2 Attunement Over Search

Agents do not query a database. They declare their role, current task, and capabilities. The Field computes what is relevant and delivers it. Context finds the agent, not the other way around.

This means the `ATTUNE` operation returns a scoped, ranked view of shared memory - not raw search results. Relevance is computed by the Field, not the agent.

### 2.3 Temporal Awareness

The protocol distinguishes between what happened (past), what's true now (present), and what's planned (future). At minimum, operations are ordered using logical clocks. At higher conformance levels, three distinct temporal layers provide richer coordination.

### 2.4 Scoped Views of Shared State

Every agent sees a filtered, role-appropriate view of the underlying shared state. Scoping prevents context overload without creating isolation. Two agents with different roles, working on different tasks, receive different context from the same Field.

### 2.5 Self-Healing Coordination

Conflicts, stale state, and agent failures are expected - not exceptional. The protocol defines conflict detection, resolution strategies, and recovery mechanisms as core operations, not application-level afterthoughts.

---

## 3. Architecture

### 3.1 System Topology

A minimal Akashik deployment consists of one Field and two or more Agents.

![System Topology](./assets/system-topology.png)

### 3.2 Protocol Stack

The Akashik Protocol sits between the application layer and the communication layer. It does not replace MCP or A2A - it complements them.

![Protocol Stack](./assets/protocol-stack.png)

The **Memory Protocol** is the core specification. It defines shared memory operations that any multi-agent system can adopt independently.

The **Coordination Extension** is an optional, separate specification that adds task lifecycle management, agent-to-agent handoffs, and session management. It builds on top of the Memory Protocol. Implementations MAY adopt the Memory Protocol without the Coordination Extension.

---

## 4. Core Concepts

### 4.1 The Field

The Field is the shared knowledge space. All agents interact with the same Field. The Field is responsible for:

- Storing memory units committed by agents
- Computing relevance when an agent attunes
- Detecting conflicts between memory units
- Maintaining the event log for auditability
- Managing agent registration and scoping

The Field is a logical concept. It MAY be implemented as an in-memory store, a file-backed store, a database, or a distributed system. The protocol defines the behavioral contract, not the implementation.

### 4.2 Memory Units

A memory unit is the atomic unit of knowledge in the protocol. Every finding, decision, observation, question, or intention recorded by an agent is a memory unit.

Two properties distinguish Akashik memory units from generic data storage:

**Intent is required.** Every memory unit MUST include an `intent` field that declares why it was recorded. A memory unit without intent is invalid and MUST be rejected by the Field. This ensures that any agent examining shared memory can understand not just what was found, but what question it was answering and what task it was serving.

**Confidence is explicit.** At Level 1 and above, every committed memory unit MUST include a confidence score and the reasoning behind that score. This creates an auditable chain where the certainty of every finding is transparent.

Memory units are **immutable once committed**. A committed memory unit's content MUST NOT be modified. To update or correct information, an agent records a new memory unit with a `supersedes` or `correction` relation pointing to the original.

### 4.3 Attunement

Attunement is the mechanism by which agents receive relevant context from the Field.

Unlike traditional query-based systems, agents do not formulate search queries. Instead, an agent declares its identity (role, interests, current task) and the Field computes and delivers the most relevant memory units.

The implementation of relevance computation varies by conformance level:

- **Level 0:** Keyword-based matching against the agent's role
- **Level 1:** Keyword-based matching with epoch-aware ordering
- **Level 2+:** Semantic similarity using vector embeddings, multi-factor scoring, and token budget management

At all levels, the agent-facing operation is the same: the agent calls `ATTUNE` and receives a ranked set of relevant memory units. The intelligence is in the Field, not in the agent.

### 4.4 Agents

An agent is any autonomous entity that interacts with the Field. Agents MUST register with the Field before performing any operations. At minimum, an agent declares an identifier and a role.

The protocol does not prescribe what an agent is internally - it may be an LLM, a deterministic script, a human operator, or any other entity capable of sending protocol messages.

### 4.5 Conflicts

A conflict exists when two or more memory units contain contradictory claims about the same entity, fact, or decision. The protocol treats conflicts as expected events, not errors. Conflicts are detected automatically (at Level 2+) or declared explicitly by agents, and resolved through structured strategies.

---

## 5. Data Types

### 5.1 Message Envelope

Every protocol message MUST use this envelope structure.

```
{
  "protocol": "akashik",
  "version": "0.1.0",
  "id": "<string>",
  "operation": "<OperationType>",
  "agent_id": "<string>",
  "session_id": "<string | null>",
  "epoch": <number>,
  "payload": { ... }
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `protocol` | string | ✓ | MUST be `"akashik"` |
| `version` | string | ✓ | Protocol version. MUST be `"0.1.0"` for this specification. |
| `id` | string | ✓ | Unique message identifier. |
| `operation` | string | ✓ | One of the defined operation types. |
| `agent_id` | string | ✓ | The agent sending the message. |
| `session_id` | string or null | ✓ | The active session, or `null` if no session. |
| `epoch` | integer | ✓ | Logical clock value. Level 0 implementations MAY use `0`. |
| `payload` | object | ✓ | Operation-specific data. |

### 5.2 MemoryUnit

The atomic unit of knowledge. Immutable once committed.

```
{
  "id": "<string>",
  "mode": "draft | committed",
  "type": "<MemoryType>",
  "content": "<string>",
  "intent": {
    "purpose": "<string>",
    "task_id": "<string | null>",
    "question": "<string | null>"
  },
  "confidence": {
    "score": <number>,
    "reasoning": "<string>",
    "evidence": ["<string>"],
    "assumptions": ["<string>"]
  },
  "source": {
    "agent_id": "<string>",
    "agent_role": "<string>",
    "session_id": "<string | null>",
    "timestamp": "<ISO 8601>"
  },
  "relations": [<Relation>],
  "status": "active | draft | superseded | retracted | contested | pending_enrichment",
  "epoch": <number>
}
```

**Required fields vary by mode:**

| Field | Draft Mode | Committed Mode |
|:---|:---:|:---:|
| `type` | REQUIRED | REQUIRED |
| `content` | REQUIRED | REQUIRED |
| `intent.purpose` | REQUIRED | REQUIRED |
| `confidence.score` | OPTIONAL | REQUIRED (Level 1+) |
| `confidence.reasoning` | OPTIONAL | REQUIRED (Level 1+) |
| `relations` | OPTIONAL | OPTIONAL |
| `source` | Auto-generated | Auto-generated |
| `id` | Auto-generated | Auto-generated |
| `epoch` | Auto-generated | Auto-generated |

**Draft mode** allows lightweight, low-ceremony recording. The Field or a downstream agent MAY enrich a draft into a committed unit by adding confidence and additional metadata.

**Committed mode** enforces full validation. At Level 0, `intent.purpose` is the only required field beyond type and content. At Level 1+, `confidence.score` and `confidence.reasoning` are also required.

The Field MUST auto-generate `id`, `epoch`, `source.agent_id`, `source.agent_role`, `source.timestamp`, and `status` on every `RECORD`. Agents MUST NOT set these fields manually.

### 5.3 MemoryType

```
MemoryType = "finding" | "decision" | "observation" | "intention"
           | "assumption" | "constraint" | "question" | "contradiction"
           | "synthesis" | "correction" | "human_directive"
```

| Type | Description |
|:---|:---|
| `finding` | A discovered fact or data point |
| `decision` | A choice made by an agent or human |
| `observation` | A subjective assessment or interpretation |
| `intention` | A declared plan or next step |
| `assumption` | Something taken as true without verification |
| `constraint` | A limitation or boundary condition |
| `question` | An open question that needs answering |
| `contradiction` | An explicit flag that two findings conflict |
| `synthesis` | A combination of multiple findings into a conclusion |
| `correction` | An explicit correction of a prior memory unit |
| `human_directive` | Input from a human operator |

Implementations MAY extend this set with additional types. Implementations MUST support at minimum: `finding`, `decision`, `observation`, and `question`.

### 5.4 Relation

```
{
  "type": "<RelationType>",
  "target_id": "<string>",
  "description": "<string | null>"
}
```

```
RelationType = "supports" | "contradicts" | "depends_on" | "supersedes"
             | "caused_by" | "elaborates" | "answers" | "blocks" | "informs"
```

| Type | Description |
|:---|:---|
| `supports` | This unit provides evidence for the target |
| `contradicts` | This unit conflicts with the target |
| `depends_on` | This unit assumes the target is true |
| `supersedes` | This unit replaces the target |
| `caused_by` | This unit exists because of the target |
| `elaborates` | This unit adds detail to the target |
| `answers` | This unit answers a question posed by the target |
| `blocks` | This unit prevents progress on the target |
| `informs` | This unit provides useful context for the target |

### 5.5 Agent

```
{
  "id": "<string>",
  "role": "<string>",
  "status": "idle | working | waiting | offline | failed",
  "interests": ["<string>"],
  "current_task_id": "<string | null>"
}
```

| Field | Type | Required | Description |
|:---|:---|:---:|:---|
| `id` | string | ✓ | Unique agent identifier |
| `role` | string | ✓ | Declared role (e.g., `"researcher"`, `"strategist"`) |
| `status` | string | ✓ | Current agent state. Default: `"idle"` |
| `interests` | string[] | | Topics this agent cares about. Used in attunement scoring. |
| `current_task_id` | string or null | | Active task. Used in attunement scoring. |

### 5.6 Scope

Scope controls what an agent receives during attunement.

**Required Scope** (all conformance levels MUST support):

```
{
  "role": "<string>",
  "max_units": <number>
}
```

**Extended Scope** (Level 2+ SHOULD support):

```
{
  "role": "<string>",
  "max_units": <number>,
  "max_tokens": <number>,
  "interests": ["<string>"],
  "active_task_id": "<string | null>",
  "temporal_layers": ["past", "present", "future"],
  "relevance_threshold": <number>,
  "recency_weight": <number>,
  "since_epoch": <number | null>
}
```

| Field | Level | Description |
|:---|:---:|:---|
| `role` | 0+ | Agent's role. REQUIRED. |
| `max_units` | 0+ | Maximum memory units to return. REQUIRED. |
| `max_tokens` | 2+ | Token budget for serialized context. |
| `interests` | 2+ | Topic areas to prioritize in scoring. |
| `active_task_id` | 2+ | Prioritize memories related to this task. |
| `temporal_layers` | 2+ | Which temporal layers to include. |
| `relevance_threshold` | 2+ | Minimum relevance score to include (0.0 to 1.0). |
| `recency_weight` | 2+ | How much to prefer recent memories (0.0 to 1.0). |
| `since_epoch` | 1+ | Only return units committed after this epoch. Enables polling. |

### 5.7 Conflict

```
{
  "id": "<string>",
  "type": "factual | interpretive | strategic | priority",
  "status": "detected | resolving | resolved | escalated",
  "unit_a": "<string>",
  "unit_b": "<string>",
  "description": "<string>",
  "detected_by": "explicit | semantic | logical | temporal",
  "resolution": {
    "strategy": "<ConflictStrategy>",
    "winner_id": "<string | null>",
    "rationale": "<string>",
    "resolved_by": "<string>",
    "epoch_resolved": <number>
  }
}
```

```
ConflictStrategy = "last_write_wins" | "confidence_weighted" | "authority"
                 | "evidence_count" | "synthesis" | "human_escalation" | "vote"
```

---

## 6. Protocol Operations

### 6.0 Operation Summary

**Memory Protocol (Core):**

| Operation | Level | Purpose |
|:---|:---:|:---|
| `REGISTER` | 0+ | Agent joins the Field |
| `DEREGISTER` | 1+ | Agent leaves the Field |
| `RECORD` | 0+ | Commit a memory unit |
| `ATTUNE` | 0+ | Receive relevant context |
| `DETECT` | 1+ | Identify conflicts |
| `MERGE` | 2+ | Resolve conflicts |
| `SUBSCRIBE` | 1+ | Register for updates |
| `REPLAY` | 2+ | Reconstruct reasoning chains |
| `COMPACT` | 2+ | Archive or summarize old memory |

**Coordination Extension (Optional, Level 3):**

| Operation | Level | Purpose |
|:---|:---:|:---|
| `COORDINATE` | 3 | Manage task lifecycle |
| `HANDOFF` | 2+ | Transfer task and context between agents |
| `SESSION` | 3 | Manage session lifecycle |

---

### 6.1 REGISTER

**Purpose:** Agent joins the Field and declares its identity.

**Request payload:**

```
{
  "id": "<string>",
  "role": "<string>",
  "interests": ["<string>"],
  "required_operations": ["<string>"]
}
```

| Field | Required | Description |
|:---|:---:|:---|
| `id` | ✓ | Unique agent identifier. |
| `role` | ✓ | Agent's declared role. |
| `interests` | | Topics the agent cares about. |
| `required_operations` | | Operations the agent needs. If the Field doesn't support them, registration MUST fail. |

**Response payload:**

```
{
  "status": "registered | rejected",
  "agent": <Agent>,
  "field_capabilities": {
    "conformance_level": <number>,
    "supported_operations": ["<string>"],
    "protocol_version": "<string>",
    "persistence": <boolean>,
    "conflict_strategies": ["<string>"]
  },
  "rejection_reason": "<string | null>"
}
```

**Behavior:**

1. The Field MUST validate that the agent `id` is unique among registered agents.
2. If `required_operations` is provided and the Field does not support all of them, the Field MUST reject the registration and return the missing operations in `rejection_reason`.
3. The Field MUST return its capabilities so the agent knows what features are available.
4. The Field MUST set the agent's initial status to `"idle"`.

---

### 6.2 DEREGISTER

**Purpose:** Agent leaves the Field gracefully.

**Level:** 1+

**Request payload:**

```
{
  "agent_id": "<string>"
}
```

**Response payload:**

```
{
  "status": "ok | not_found",
  "cleanup": {
    "units_orphaned": <number>,
    "tasks_reassigned": <number>
  }
}
```

**Behavior:**

1. The Field MUST remove the agent from the registry.
2. Memory units previously recorded by this agent MUST NOT be deleted. They remain in the Field.
3. If the agent has assigned tasks (Coordination Extension), the Field SHOULD flag them for reassignment.

---

### 6.3 RECORD

**Purpose:** Commit a memory unit to the Field.

This is the only way to add knowledge to shared memory. Every write goes through RECORD.

**Request payload:**

```
{
  "mode": "draft | committed",
  "type": "<MemoryType>",
  "content": "<string>",
  "intent": {
    "purpose": "<string>",
    "task_id": "<string | null>",
    "question": "<string | null>"
  },
  "confidence": {
    "score": <number>,
    "reasoning": "<string>",
    "evidence": ["<string>"],
    "assumptions": ["<string>"]
  },
  "relations": [<Relation>]
}
```

**Required fields by mode and level:**

| Field | Draft (Level 0+) | Committed (Level 0) | Committed (Level 1+) |
|:---|:---:|:---:|:---:|
| `type` | REQUIRED | REQUIRED | REQUIRED |
| `content` | REQUIRED | REQUIRED | REQUIRED |
| `intent.purpose` | REQUIRED | REQUIRED | REQUIRED |
| `confidence.score` | — | — | REQUIRED |
| `confidence.reasoning` | — | — | REQUIRED |
| `relations` | — | — | — |

**Response payload:**

```
{
  "status": "accepted | rejected",
  "memory_unit_id": "<string>",
  "epoch": <number>,
  "conflicts_detected": ["<string>"],
  "rejection_reason": "<string | null>"
}
```

**Behavior:**

1. The Field MUST validate the payload against the required fields for the given mode and conformance level.
2. If `intent.purpose` is missing or empty, the Field MUST reject the RECORD with error code `MISSING_INTENT`.
3. If `confidence.score` is required and missing, the Field MUST reject with `MISSING_CONFIDENCE`.
4. If `confidence.score` is present, it MUST be a number between 0.0 and 1.0 inclusive.
5. The Field MUST generate `id`, `epoch`, `source`, and `status` for the memory unit. Agents MUST NOT provide these.
6. For draft mode, the Field MUST set `status` to `"draft"`.
7. For committed mode, the Field MUST set `status` to `"active"`.
8. The Field MUST append the operation to the event log (Level 1+).
9. If any `relations` include a `contradicts` type, the Field MUST create a Conflict object (Level 1+).
10. If the Field supports semantic conflict detection (Level 2+), it SHOULD run detection against existing memory units and return any detected conflicts in `conflicts_detected`.
11. If the Field supports subscriptions, it SHOULD evaluate the new unit against active agent scopes and push notifications to matching agents.

**Partial Failure:**

- If the event log write succeeds but enrichment (embedding generation) fails, the Field MUST commit the unit with status `"pending_enrichment"` and include a warning in the response.
- If the event log write succeeds but conflict detection times out, the Field MUST commit the unit and return `"conflicts_detected": []` with a `"conflict_detection": "deferred"` flag.

---

### 6.4 ATTUNE

**Purpose:** Receive a contextually relevant, scoped view of shared memory.

The agent does not provide a search query. It declares who it is and what it needs. The Field computes relevance and returns ranked results.

**Request payload:**

```
{
  "scope": <Scope>,
  "context_hint": "<string | null>",
  "format": "full | summary | ids_only",
  "since_epoch": <number | null>
}
```

| Field | Required | Description |
|:---|:---:|:---|
| `scope` | ✓ | The agent's scope filter (at minimum: `role` and `max_units`). |
| `context_hint` | | Free text describing what the agent is about to do. Improves relevance at Level 2+. |
| `format` | | Response format. Default: `"full"`. |
| `since_epoch` | | Only return units committed after this epoch. Enables polling-based subscriptions at Level 1+. |

**Response payload:**

```
{
  "status": "ok",
  "record": [<ScopedMemoryUnit>],
  "conflicts": [<Conflict>],
  "context_budget": {
    "units_returned": <number>,
    "units_available": <number>,
    "tokens_used": <number | null>,
    "tokens_budget": <number | null>
  },
  "epoch": <number>
}
```

```
ScopedMemoryUnit = {
  "memory_unit": <MemoryUnit>,
  "relevance_score": <number>,
  "relevance_reason": "<string>",
  "format": "full | summary"
}
```

**Behavior:**

1. The Field MUST exclude memory units recorded by the requesting agent, unless the scope explicitly requests them.
2. The Field MUST exclude memory units with status `"retracted"` or `"superseded"`.
3. The Field MUST score each candidate memory unit for relevance to the requesting agent.
4. The Field MUST sort results by relevance score in descending order.
5. The Field MUST truncate results to respect `scope.max_units`.
6. At Level 2+, the Field SHOULD also respect `scope.max_tokens` by estimating token counts and either including full content or summaries.
7. If `since_epoch` is provided, the Field MUST only return memory units committed at or after that epoch.
8. The Field MUST include unresolved conflicts relevant to the requesting agent in the `conflicts` array.
9. Each returned unit MUST include a `relevance_score` (0.0 to 1.0) and a human-readable `relevance_reason`.

**Relevance Scoring:**

The protocol does not prescribe a specific scoring algorithm. Implementations MUST produce a relevance score between 0.0 and 1.0 for each candidate. The following factors are RECOMMENDED:

- **Recency:** More recent memory units SHOULD score higher.
- **Role alignment:** Memory units related to the agent's role SHOULD score higher.
- **Type importance:** Decisions and contradictions SHOULD score higher than observations.
- **Source diversity:** Results SHOULD include memory units from multiple agents where possible.

At Level 2+, the following additional factors are RECOMMENDED:

- **Semantic similarity:** Using vector embeddings to measure content relevance.
- **Task relevance:** Memory units serving the same or dependent tasks SHOULD score higher.
- **Relation proximity:** Memory units connected via relations to the agent's current context SHOULD score higher.
- **Confidence weighting:** Higher-confidence units SHOULD score higher.

---

### 6.5 DETECT

**Purpose:** Identify conflicts between memory units.

**Level:** 1+

**Request payload:**

```
{
  "mode": "check | scan | list",
  "target_id": "<string | null>",
  "filter": {
    "status": ["<string>"],
    "types": ["<string>"],
    "involving_agents": ["<string>"]
  }
}
```

| Mode | Description |
|:---|:---|
| `check` | Check a specific memory unit against the Field for contradictions. Requires `target_id`. |
| `scan` | Run conflict detection across all memory units in scope. |
| `list` | Return all known conflicts matching the filter. |

**Response payload:**

```
{
  "status": "ok",
  "conflicts": [<Conflict>],
  "scan_coverage": {
    "units_scanned": <number>,
    "new_conflicts_found": <number>
  }
}
```

**Behavior:**

At **Level 1**, the Field MUST support `list` mode and MUST detect explicit conflicts (when a RECORD includes a `contradicts` relation). The Field MAY support `check` and `scan` modes.

At **Level 2+**, the Field MUST support all three modes and MUST implement at least one automatic detection method beyond explicit relations. Automatic detection methods include:

- **Semantic detection:** Memory units with high embedding similarity that contain opposing claims.
- **Logical detection:** A finding's assumptions contradict another finding's content.
- **Temporal detection:** A newer finding contradicts an established finding of higher confidence.

The protocol does not prescribe specific thresholds or algorithms for automatic detection. These are implementation decisions documented in the Reference Architecture guide.

---

### 6.6 MERGE

**Purpose:** Resolve a detected conflict.

**Level:** 2+

**Request payload:**

```
{
  "conflict_id": "<string>",
  "strategy": "<ConflictStrategy>",
  "resolution": {
    "winner_id": "<string | null>",
    "synthesis": "<string | null>",
    "rationale": "<string>"
  }
}
```

| Field | Required | Description |
|:---|:---:|:---|
| `conflict_id` | ✓ | The conflict to resolve. |
| `strategy` | ✓ | Which resolution strategy to apply. |
| `resolution.rationale` | ✓ | Why this resolution was chosen. |
| `resolution.winner_id` | | For `confidence_weighted`, `authority`, `evidence_count`: the prevailing unit. |
| `resolution.synthesis` | | For `synthesis`: new content that reconciles both units. |

**Response payload:**

```
{
  "status": "resolved | escalated | pending_vote",
  "conflict": <Conflict>,
  "side_effects": {
    "superseded_units": ["<string>"],
    "new_unit_id": "<string | null>",
    "notified_agents": ["<string>"]
  }
}
```

**Behavior:**

1. The Field MUST validate that the conflict exists and is in `"detected"` or `"resolving"` status.
2. If `strategy` is `"synthesis"`, a new memory unit MUST be created from `resolution.synthesis` with relations pointing to both original units.
3. The losing unit (or both originals, in synthesis) MUST have its status set to `"superseded"`.
4. The conflict status MUST be updated to `"resolved"` with the full resolution details.
5. The Field MUST notify agents who recorded the affected units.

**Required strategies by level:**

| Level | Minimum Required Strategies |
|:---:|:---|
| 2 | `last_write_wins`, `confidence_weighted`, `human_escalation` |
| 3 | All seven strategies |

| Strategy | Description |
|:---|:---|
| `last_write_wins` | Most recent memory unit prevails. |
| `confidence_weighted` | Higher confidence score prevails. |
| `authority` | Specified agent/role has final say. |
| `evidence_count` | More supporting evidence prevails. |
| `synthesis` | Create a new unit reconciling both. |
| `human_escalation` | Flag for human review. |
| `vote` | Multiple agents vote (requires quorum). |

---

### 6.7 SUBSCRIBE

**Purpose:** Register for updates when relevant changes occur in the Field.

**Level:** 1+ (poll-based). Level 2+ (push-based).

**Request payload:**

```
{
  "action": "subscribe | unsubscribe | list",
  "subscription": {
    "id": "<string | null>",
    "events": ["<SubscriptionEvent>"],
    "min_relevance": <number | null>,
    "debounce_ms": <number | null>
  }
}
```

```
SubscriptionEvent = "memory.recorded" | "memory.superseded" | "memory.contested"
                  | "conflict.detected" | "conflict.resolved"
                  | "task.state_changed" | "task.assigned" | "task.completed"
                  | "handoff.incoming"
                  | "agent.joined" | "agent.failed"
                  | "session.paused" | "session.ended"
```

**Push notification format (Level 2+):**

```
{
  "subscription_id": "<string>",
  "event": "<SubscriptionEvent>",
  "epoch": <number>,
  "relevance_score": <number>,
  "summary": "<string>",
  "memory_unit_id": "<string | null>",
  "conflict_id": "<string | null>",
  "requires_action": <boolean>
}
```

**Level 1 alternative - polling:**

At Level 1, implementations that do not support push notifications MUST support the `since_epoch` parameter on ATTUNE. An agent polls for updates by calling ATTUNE with `since_epoch` set to the epoch returned in its last ATTUNE response. This provides eventual consistency without requiring a persistent connection.

---

### 6.8 REPLAY

**Purpose:** Reconstruct the full reasoning chain for a task, decision, or memory unit.

**Level:** 2+

**Request payload:**

```
{
  "target_type": "task | memory_unit | decision | conflict | session",
  "target_id": "<string>",
  "depth": "summary | detailed | full_trace"
}
```

**Response payload:**

```
{
  "status": "ok",
  "timeline": [<ReplayEvent>],
  "summary": "<string>",
  "agents_involved": ["<string>"],
  "total_events": <number>
}
```

```
ReplayEvent = {
  "epoch": <number>,
  "event_type": "<string>",
  "agent_id": "<string>",
  "description": "<string>",
  "memory_unit_id": "<string | null>",
  "task_id": "<string | null>"
}
```

**Behavior:**

1. The Field MUST reconstruct the event timeline by reading from the append-only event log.
2. At `"summary"` depth, the Field MUST return a human-readable summary and the list of involved agents.
3. At `"full_trace"` depth, the Field MUST return every event in the causal chain.

---

### 6.9 COMPACT

**Purpose:** Archive, summarize, or purge aged memory units.

**Level:** 2+

**Request payload:**

```
{
  "strategy": "summarize | archive | purge",
  "filter": {
    "max_age_epochs": <number | null>,
    "session_id": "<string | null>",
    "types": ["<MemoryType>"],
    "status": ["<string>"]
  }
}
```

| Strategy | Description |
|:---|:---|
| `summarize` | Create synthesis memory units from matching originals, then archive the originals. |
| `archive` | Move matching units to cold storage. They remain in the event log but are excluded from ATTUNE. |
| `purge` | Permanently delete matching units from the active store. The event log MUST still retain a record of their existence. |

**Response payload:**

```
{
  "status": "ok",
  "units_affected": <number>,
  "synthesis_units_created": <number>,
  "storage_reclaimed_bytes": <number | null>
}
```

**Behavior:**

1. COMPACT MUST NOT delete entries from the append-only event log, regardless of strategy.
2. For `summarize`, the Field MUST create new memory units of type `"synthesis"` with relations pointing to the originals.
3. For `archive`, archived units MUST be excluded from ATTUNE results unless the agent explicitly requests archived content.
4. For `purge`, the event log MUST retain a tombstone record (unit ID, deletion timestamp, reason).

---

## 7. State Machines

### 7.1 Conflict Lifecycle

All conformance levels that support DETECT MUST implement this state machine.

![Conflict Lifecycle](./assets/conflict-lifecycle.png)

| Transition | Trigger | Conditions |
|:---|:---|:---|
| detected → resolving | Agent or Field initiates resolution | Strategy must be specified |
| detected → escalated | Auto-resolution not possible | No deterministic strategy applies |
| resolving → resolved | Strategy applied successfully | Rationale required |
| resolving → escalated | Strategy fails or times out | — |
| escalated → resolved | Human operator decides | Authority level 10 required |

### 7.2 Agent Lifecycle

![Agent Lifecycle](./assets/agent-lifecycle.png)

---

## 8. Error Model

### 8.1 Error Response Format

```
{
  "code": "<ErrorCode>",
  "message": "<string>",
  "operation": "<OperationType>",
  "recoverable": <boolean>,
  "suggested_action": "<string | null>"
}
```

### 8.2 Error Codes

**Validation Errors:**

| Code | Description | Recoverable |
|:---|:---|:---:|
| `MISSING_INTENT` | RECORD submitted without `intent.purpose` | Yes — resubmit with intent |
| `MISSING_CONFIDENCE` | Committed RECORD at Level 1+ without confidence | Yes — resubmit with confidence |
| `INVALID_CONFIDENCE` | Confidence score outside 0.0–1.0 range | Yes — correct and resubmit |
| `INVALID_TYPE` | Unknown MemoryType | Yes — use a supported type |
| `AGENT_NOT_REGISTERED` | Operation from an unregistered agent | Yes — call REGISTER first |
| `AGENT_ID_TAKEN` | REGISTER with a duplicate agent ID | Yes — use a different ID |
| `CONFLICT_NOT_FOUND` | MERGE references a nonexistent conflict | No |
| `UNIT_NOT_FOUND` | DETECT check references a nonexistent unit | No |
| `INVALID_TRANSITION` | State machine violation | Yes — check current state |
| `UNSUPPORTED_OPERATION` | Operation not supported at this conformance level | No |

**Operational Errors:**

| Code | Description | Recoverable |
|:---|:---|:---:|
| `ENRICHMENT_FAILED` | Embedding generation or enrichment failed | Yes — unit committed as `pending_enrichment` |
| `DETECTION_TIMEOUT` | Conflict detection timed out | Yes — detection deferred |
| `MERGE_FAILED` | Conflict resolution failed | Yes — try different strategy |
| `REPLAY_TOO_LARGE` | Reasoning chain too large to reconstruct | Yes — use `summary` depth |
| `STORAGE_FULL` | Persistence store at capacity | No — run COMPACT or expand storage |

**System Errors:**

| Code | Description | Recoverable |
|:---|:---|:---:|
| `EPOCH_OVERFLOW` | Logical clock overflow | No — requires system restart with checkpoint |
| `INTERNAL_ERROR` | Unexpected failure | No |

---

## 9. Conformance Levels

Implementations declare conformance at one of four levels. Each level is a strict superset of the previous.

### Level 0: Starter

**The minimal viable implementation. A developer can adopt this in an afternoon.**

An implementation conforms to Level 0 if it:

1. Implements `REGISTER` with `id` and `role` fields.
2. Implements `RECORD` in both `draft` and `committed` modes.
3. Validates that `intent.purpose` is present and non-empty on every RECORD.
4. Rejects RECORD with `MISSING_INTENT` if intent is absent.
5. Auto-generates `id`, `epoch`, `source`, and `status` on every memory unit.
6. Implements `ATTUNE` with Required Scope (`role`, `max_units`).
7. Returns memory units scored and sorted by relevance (algorithm is implementation-defined).
8. Excludes the requesting agent's own memory units from ATTUNE results by default.
9. Excludes retracted and superseded memory units from ATTUNE results.
10. Returns `relevance_score` and `relevance_reason` for each result.
11. Uses the standard message envelope on all messages.

**Level 0 MAY omit:**
- Persistence (in-memory only is acceptable)
- Logical clocks (epoch MAY be a simple counter or `0`)
- Conflict detection
- Subscriptions
- The Coordination Extension
- Authentication

### Level 1: Core

**Memory persists. Events are ordered. Contradictions get flagged.**

An implementation conforms to Level 1 if it meets all Level 0 requirements AND:

1. Persists memory units to durable storage that survives process restarts.
2. Maintains an append-only event log of all operations.
3. Implements Lamport logical clocks: each operation increments the epoch; incoming messages update the local clock to `max(local, received) + 1`.
4. Requires `confidence.score` and `confidence.reasoning` on committed RECORD operations.
5. Implements `DEREGISTER`.
6. Implements `DETECT` in `list` mode.
7. Creates a Conflict object when a RECORD includes a `contradicts` relation.
8. Implements `ATTUNE` with `since_epoch` parameter for polling-based subscriptions.
9. Returns unresolved conflicts in the ATTUNE response.
10. Implements `REGISTER` with capability exchange (Field returns `field_capabilities`).

### Level 2: Standard

**Relevance gets smart. Conflicts get resolved. Agents get notified.**

An implementation conforms to Level 2 if it meets all Level 1 requirements AND:

1. Computes vector embeddings for memory unit content.
2. Implements semantic relevance scoring in ATTUNE using embeddings.
3. Supports Extended Scope fields: `max_tokens`, `interests`, `active_task_id`, `relevance_threshold`.
4. Implements token budget management in ATTUNE (truncation, summarization).
5. Implements `DETECT` in all three modes (`check`, `scan`, `list`) with at least one automatic detection method.
6. Implements `MERGE` with at least three strategies: `last_write_wins`, `confidence_weighted`, `human_escalation`.
7. Implements `SUBSCRIBE` with push notifications (WebSocket, SSE, or equivalent).
8. Implements `HANDOFF` with structured context packaging.
9. Implements `REPLAY` at all three depths.
10. Implements `COMPACT` with at least `archive` strategy.

### Level 3: Full

**Production-grade orchestration with coordination, security, and full audit trails.**

An implementation conforms to Level 3 if it meets all Level 2 requirements AND:

1. Implements the Coordination Extension: `COORDINATE`, `SESSION`.
2. Implements the full task state machine with all transitions.
3. Implements `MERGE` with all seven conflict resolution strategies.
4. Supports agent authentication (at least token-based).
5. Enforces authority hierarchy for privileged operations.
6. Implements memory unit visibility rules (session scoping, role-based filtering).
7. Implements `COMPACT` with all three strategies.
8. Implements at least two transport bindings.

---

## 10. Transport Bindings

The Akashik Protocol is transport-agnostic. Operations MAY be carried over any communication layer. This specification defines bindings for common transports.

### 10.1 Native SDK

Direct API calls in the host language. Lowest latency, full feature support.

```javascript
const field = new Field();
const agent = await field.register({ id: 'researcher', role: 'researcher' });

const unit = await agent.record({
  type: 'finding',
  content: 'Market growing at 23% CAGR',
  intent: { purpose: 'Validate market size' }
});

const context = await agent.attune({ max_units: 10 });
```

### 10.2 MCP Server Binding

Exposes Akashik operations as MCP tools, enabling any MCP-compatible agent to use the protocol.

| MCP Tool | Maps To |
|:---|:---|
| `akashik_register` | REGISTER |
| `akashik_record` | RECORD |
| `akashik_attune` | ATTUNE |
| `akashik_detect` | DETECT |
| `akashik_merge` | MERGE |
| `akashik_replay` | REPLAY |
| `akashik_compact` | COMPACT |

**Limitation:** MCP's request-response model cannot support real-time SUBSCRIBE push notifications. MCP-connected agents MUST use polling via ATTUNE with `since_epoch`.

### 10.3 HTTP REST Binding

```
POST /v1/register         → REGISTER
POST /v1/deregister       → DEREGISTER
POST /v1/record           → RECORD
POST /v1/attune           → ATTUNE
POST /v1/detect           → DETECT
POST /v1/merge            → MERGE
POST /v1/replay           → REPLAY
POST /v1/compact          → COMPACT
POST /v1/subscribe        → SUBSCRIBE (returns WebSocket URL for push)

GET  /v1/field/status     → Field overview
GET  /v1/agents           → Registered agents
GET  /v1/conflicts        → Active conflicts
```

All request and response bodies MUST use `Content-Type: application/json` and conform to the JSON Schema definitions in Appendix C.

---

## 11. Security

### 11.1 Conformance Level Requirements

| Level | Security Requirement |
|:---:|:---|
| 0 | No authentication required. Suitable for single-user, local deployments. |
| 1 | Authentication RECOMMENDED. Agent identity SHOULD be verified. |
| 2 | Token-based authentication REQUIRED. |
| 3 | Full authentication REQUIRED (token, certificate, or OAuth). Authority hierarchy enforced. |

### 11.2 Authority Hierarchy

At Level 3, operations are gated by authority level:

| Level | Role | Capabilities |
|:---:|:---|:---|
| 10 | Human Operator | Override any decision, resolve any conflict |
| 8 | Session Creator | Cancel tasks, pause sessions, set policies |
| 6 | Senior Agent | Merge conflicts, create tasks for other agents |
| 4 | Standard Agent | Record, attune, coordinate own tasks |
| 2 | Observer Agent | Attune (read only), subscribe |
| 0 | Audit Agent | Replay (read history only) |

### 11.3 Memory Unit Visibility

At Level 3, not all agents can see all memory units. Visibility is determined by:

1. **Session membership:** Agents MUST only see units from their active session.
2. **Role-based rules:** Configurable per session.
3. **Authority level:** Lower-authority agents MAY be restricted from certain memory types.

---

## 12. Future Work

The following areas are planned for future specification versions. They are documented here to signal direction, not commitment.

**Cross-Session Memory:** A mechanism for memory units to persist and be accessible across sessions. The current specification scopes all memory to a single Field instance.

**Temporal Layers:** Full specification of three distinct temporal layers — Past Record (immutable event log), Present Record (mutable coordination state), Future Record (planned work as a directed acyclic graph). Currently, temporal awareness is limited to epoch ordering.

**Embedding Standardization:** Formal requirements for embedding interoperability, including dimensionality ranges, similarity metrics, and negotiation during REGISTER.

**Conformance Test Suite:** A standalone test suite that any implementation can run to verify conformance at each level.

**Akashik Enhancement Proposals (AEPs):** A formal process for community-driven protocol evolution, modeled after MCP's SEP process.

---

## Appendix A: Wire Format Examples

### A.1 REGISTER → RECORD → ATTUNE Flow

**Step 1: Agent registers**

```json
{
  "protocol": "akashik",
  "version": "0.1.0",
  "id": "msg-001",
  "operation": "REGISTER",
  "agent_id": "researcher-01",
  "session_id": null,
  "epoch": 0,
  "payload": {
    "id": "researcher-01",
    "role": "market_researcher",
    "interests": ["market size", "competitors", "growth trends"]
  }
}
```

**Response:**

```json
{
  "status": "registered",
  "agent": {
    "id": "researcher-01",
    "role": "market_researcher",
    "status": "idle",
    "interests": ["market size", "competitors", "growth trends"]
  },
  "field_capabilities": {
    "conformance_level": 1,
    "supported_operations": ["REGISTER", "DEREGISTER", "RECORD", "ATTUNE", "DETECT", "SUBSCRIBE"],
    "protocol_version": "0.1.0",
    "persistence": true,
    "conflict_strategies": []
  }
}
```

**Step 2: Agent records a finding**

```json
{
  "protocol": "akashik",
  "version": "0.1.0",
  "id": "msg-002",
  "operation": "RECORD",
  "agent_id": "researcher-01",
  "session_id": null,
  "epoch": 1,
  "payload": {
    "mode": "committed",
    "type": "finding",
    "content": "European SaaS market for SMB HR tools is growing at 23% CAGR, expected to reach $4.2B by 2027. Primary growth driver is regulatory compliance automation post-EU AI Act.",
    "intent": {
      "purpose": "Validate market size assumption for go-to-market strategy",
      "task_id": "task-market-sizing",
      "question": "Is the European HR SaaS market large enough to justify a dedicated go-to-market?"
    },
    "confidence": {
      "score": 0.82,
      "reasoning": "Based on three independent analyst reports with consistent estimates. Slight uncertainty on AI Act impact timeline.",
      "evidence": ["https://example.com/report-a", "https://example.com/report-b"],
      "assumptions": ["EU AI Act enforcement begins Q3 2026", "No major EU recession in 2026-2027"]
    },
    "relations": [
      { "type": "answers", "target_id": "mem-question-001" }
    ]
  }
}
```

**Response:**

```json
{
  "status": "accepted",
  "memory_unit_id": "mem-002",
  "epoch": 2,
  "conflicts_detected": []
}
```

**Step 3: Another agent attunes**

```json
{
  "protocol": "akashik",
  "version": "0.1.0",
  "id": "msg-003",
  "operation": "ATTUNE",
  "agent_id": "strategist-01",
  "session_id": null,
  "epoch": 3,
  "payload": {
    "scope": {
      "role": "strategist",
      "max_units": 10
    },
    "context_hint": "About to draft competitive positioning section"
  }
}
```

**Response:**

```json
{
  "status": "ok",
  "record": [
    {
      "memory_unit": {
        "id": "mem-002",
        "mode": "committed",
        "type": "finding",
        "content": "European SaaS market for SMB HR tools is growing at 23% CAGR, expected to reach $4.2B by 2027. Primary growth driver is regulatory compliance automation post-EU AI Act.",
        "intent": {
          "purpose": "Validate market size assumption for go-to-market strategy",
          "task_id": "task-market-sizing",
          "question": "Is the European HR SaaS market large enough to justify a dedicated go-to-market?"
        },
        "confidence": {
          "score": 0.82,
          "reasoning": "Based on three independent analyst reports with consistent estimates. Slight uncertainty on AI Act impact timeline.",
          "evidence": ["https://example.com/report-a", "https://example.com/report-b"],
          "assumptions": ["EU AI Act enforcement begins Q3 2026", "No major EU recession in 2026-2027"]
        },
        "source": {
          "agent_id": "researcher-01",
          "agent_role": "market_researcher",
          "session_id": null,
          "timestamp": "2026-03-01T10:30:00Z"
        },
        "relations": [
          { "type": "answers", "target_id": "mem-question-001" }
        ],
        "status": "active",
        "epoch": 2
      },
      "relevance_score": 0.85,
      "relevance_reason": "Recent finding from market_researcher. Market sizing is relevant to strategy.",
      "format": "full"
    }
  ],
  "conflicts": [],
  "context_budget": {
    "units_returned": 1,
    "units_available": 1,
    "tokens_used": null,
    "tokens_budget": null
  },
  "epoch": 3
}
```

### A.2 Conflict Detection (Level 1)

**Agent records a finding that contradicts an existing one:**

```json
{
  "protocol": "akashik",
  "version": "0.1.0",
  "id": "msg-010",
  "operation": "RECORD",
  "agent_id": "researcher-02",
  "session_id": null,
  "epoch": 10,
  "payload": {
    "mode": "committed",
    "type": "finding",
    "content": "European SaaS market growth is decelerating to 14% CAGR due to enterprise budget cuts in Q4 2026.",
    "intent": {
      "purpose": "Update market growth projection with latest data",
      "question": "Has the market growth trajectory changed?"
    },
    "confidence": {
      "score": 0.75,
      "reasoning": "Based on a single Q4 earnings report from a major player. May not represent the full market.",
      "assumptions": ["Q4 trends are indicative of 2027 trajectory"]
    },
    "relations": [
      {
        "type": "contradicts",
        "target_id": "mem-002",
        "description": "Original estimate was 23% CAGR; new data suggests 14%"
      }
    ]
  }
}
```

**Response (conflict auto-created from explicit relation):**

```json
{
  "status": "accepted",
  "memory_unit_id": "mem-010",
  "epoch": 11,
  "conflicts_detected": ["conflict-001"]
}
```

**Strategist's next ATTUNE now includes the conflict:**

```json
{
  "conflicts": [
    {
      "id": "conflict-001",
      "type": "factual",
      "status": "detected",
      "unit_a": "mem-002",
      "unit_b": "mem-010",
      "description": "Conflicting market growth estimates: 23% CAGR vs 14% CAGR",
      "detected_by": "explicit"
    }
  ]
}
```

---

## Appendix B: Protocol Comparison

| Capability | MCP | A2A | Akashik |
|:---|:---:|:---:|:---:|
| **Primary purpose** | Agent ↔ Tool | Agent ↔ Agent | Shared Memory & Coordination |
| **State management** | None | Minimal | Full (scoped, temporal) |
| **Memory persistence** | None | None | Event-sourced + configurable store |
| **Conflict detection** | None | None | Explicit (L1) + Automatic (L2) |
| **Conflict resolution** | None | None | 7 strategies |
| **Semantic awareness** | None | None | Embedding-based relevance (L2+) |
| **Context scoping** | None | None | Role, task, interest, budget-aware |
| **Proactive delivery** | None | Notifications | Attunement model + push subscriptions |
| **Audit trail** | None | Minimal | Full reasoning chain replay |
| **Intent tracking** | None | None | Required on every write |
| **Relationship graph** | None | None | 9 relation types |

These protocols are complementary, not competing. The Akashik Protocol is designed to work alongside MCP and A2A, not replace them.

---

## Appendix C: JSON Schema Reference

### C.1 Message Envelope

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://akashikprotocol.com/schema/0.1.0/envelope.json",
  "type": "object",
  "required": ["protocol", "version", "id", "operation", "agent_id", "session_id", "epoch", "payload"],
  "properties": {
    "protocol": { "type": "string", "const": "akashik" },
    "version": { "type": "string", "const": "0.1.0" },
    "id": { "type": "string", "minLength": 1 },
    "operation": {
      "type": "string",
      "enum": ["REGISTER", "DEREGISTER", "RECORD", "ATTUNE", "DETECT", "MERGE", "SUBSCRIBE", "REPLAY", "COMPACT", "COORDINATE", "HANDOFF", "SESSION"]
    },
    "agent_id": { "type": "string", "minLength": 1 },
    "session_id": { "type": ["string", "null"] },
    "epoch": { "type": "integer", "minimum": 0 },
    "payload": { "type": "object" }
  },
  "additionalProperties": false
}
```

### C.2 MemoryUnit

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://akashikprotocol.com/schema/0.1.0/memory-unit.json",
  "type": "object",
  "required": ["id", "mode", "type", "content", "intent", "source", "status", "epoch"],
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "mode": { "type": "string", "enum": ["draft", "committed"] },
    "type": {
      "type": "string",
      "enum": ["finding", "decision", "observation", "intention", "assumption", "constraint", "question", "contradiction", "synthesis", "correction", "human_directive"]
    },
    "content": { "type": "string", "minLength": 1 },
    "intent": {
      "type": "object",
      "required": ["purpose"],
      "properties": {
        "purpose": { "type": "string", "minLength": 1 },
        "task_id": { "type": ["string", "null"] },
        "question": { "type": ["string", "null"] }
      }
    },
    "confidence": {
      "type": "object",
      "properties": {
        "score": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
        "reasoning": { "type": "string", "minLength": 1 },
        "evidence": { "type": "array", "items": { "type": "string" } },
        "assumptions": { "type": "array", "items": { "type": "string" } }
      }
    },
    "source": {
      "type": "object",
      "required": ["agent_id", "agent_role", "timestamp"],
      "properties": {
        "agent_id": { "type": "string" },
        "agent_role": { "type": "string" },
        "session_id": { "type": ["string", "null"] },
        "timestamp": { "type": "string", "format": "date-time" }
      }
    },
    "relations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["type", "target_id"],
        "properties": {
          "type": {
            "type": "string",
            "enum": ["supports", "contradicts", "depends_on", "supersedes", "caused_by", "elaborates", "answers", "blocks", "informs"]
          },
          "target_id": { "type": "string" },
          "description": { "type": ["string", "null"] }
        }
      }
    },
    "status": {
      "type": "string",
      "enum": ["active", "draft", "superseded", "retracted", "contested", "pending_enrichment"]
    },
    "epoch": { "type": "integer", "minimum": 0 }
  }
}
```

### C.3 Scope

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://akashikprotocol.com/schema/0.1.0/scope.json",
  "type": "object",
  "required": ["role", "max_units"],
  "properties": {
    "role": { "type": "string", "minLength": 1 },
    "max_units": { "type": "integer", "minimum": 1 },
    "max_tokens": { "type": "integer", "minimum": 1 },
    "interests": { "type": "array", "items": { "type": "string" } },
    "active_task_id": { "type": ["string", "null"] },
    "temporal_layers": {
      "type": "array",
      "items": { "type": "string", "enum": ["past", "present", "future"] }
    },
    "relevance_threshold": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
    "recency_weight": { "type": "number", "minimum": 0.0, "maximum": 1.0 },
    "since_epoch": { "type": ["integer", "null"], "minimum": 0 }
  }
}
```

### C.4 Conflict

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://akashikprotocol.com/schema/0.1.0/conflict.json",
  "type": "object",
  "required": ["id", "type", "status", "unit_a", "unit_b", "description", "detected_by"],
  "properties": {
    "id": { "type": "string", "minLength": 1 },
    "type": { "type": "string", "enum": ["factual", "interpretive", "strategic", "priority"] },
    "status": { "type": "string", "enum": ["detected", "resolving", "resolved", "escalated"] },
    "unit_a": { "type": "string" },
    "unit_b": { "type": "string" },
    "description": { "type": "string" },
    "detected_by": { "type": "string", "enum": ["explicit", "semantic", "logical", "temporal"] },
    "resolution": {
      "type": "object",
      "properties": {
        "strategy": {
          "type": "string",
          "enum": ["last_write_wins", "confidence_weighted", "authority", "evidence_count", "synthesis", "human_escalation", "vote"]
        },
        "winner_id": { "type": ["string", "null"] },
        "rationale": { "type": "string" },
        "resolved_by": { "type": "string" },
        "epoch_resolved": { "type": "integer" }
      }
    }
  }
}
```

---

## Acknowledgments

The Akashik Protocol draws its name and conceptual model from the Akashic Records - the Vedantic concept of a universal field of knowledge where every thought, intention, and event is recorded and accessible through **attunement**, not search. This philosophy directly informs the protocol's design: intent-first memory, attunement over query, scoped views of shared truth.

---

## License

This specification is released under [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).

© 2026 Sahil David <sahildavid.dev@gmail.com>.

---

*This specification is a living document. Version 0.1.0-draft represents the initial public release. Feedback, issues, and contributions are welcome at [github.com/AkashikProtocol](https://github.com/AkashikProtocol).*