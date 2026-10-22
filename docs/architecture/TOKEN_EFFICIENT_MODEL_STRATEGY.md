# Token-Efficient, Capability-Aware Model Strategy

> **Status: [PLANNED]** — design only. No controller, model router, validation
> loop, local reranker, new public command, or new storage schema exists yet.
> This document describes the architecture approved for future implementation by
> [ADR-026](../decisions/ADR-026-token-efficient-model-strategy.md).

CodeAtlas already saves models from rediscovering a codebase. This architecture
defines the next step: use deterministic repository intelligence and executable
validation so lower-cost models can complete well-bounded tasks reliably, while
frontier models are reserved for work that demonstrably needs them.

It complements:

- [CONTEXT.md](./CONTEXT.md) — repository indexing and deterministic context;
- [AGENT_SESSIONS.md](./AGENT_SESSIONS.md) — session lifecycle and process
  boundaries;
- [AGENT_ORCHESTRATOR.md](./AGENT_ORCHESTRATOR.md) — future unified CLI router;
- [CONTEXT_STORAGE.md](./CONTEXT_STORAGE.md) — durable local state; and
- [USAGE.md](../reference/USAGE.md) — token/cost provenance and limits.

## 1. Product boundary

CodeAtlas is not trying to make every small model equal to a frontier model.
It makes a model's task easier by converting broad repository exploration into
a bounded, evidence-backed task with an observable verification result.

The controller is responsible for context selection, scope, safety, validation,
and escalation policy. The selected model is responsible for the bounded
reasoning, code action, and explanation within that contract.

```text
User task
   │
   ▼
Task classification + repository evidence
   │         (deterministic, local)
   ▼
Retrieval strategy + sufficiency gate
   │
   ▼
WorkPacket compiler
   │
   ├── lower-cost lane ──► bounded action / patch ──► deterministic validation ─┐
   │                                                                            │
   └── frontier lane ◄──── explicit escalation policy ◄────────────────────────┘
                                        │
                                        ▼
                            task ledger + usage attribution
```

The arrows are control flow, not package imports. Consumers still access the
system through the SDK.

## 2. Current foundation

The following components already exist and are inputs to the future controller:

| Existing capability | Current owner | Planned role in this architecture |
| --- | --- | --- |
| Incremental scan, hashes, parser, symbols, graph | scanner / hashing / parser / graph | Local structural evidence and change detection |
| Deterministic search, context package, budget, deny filter | context + SDK context-integration | Candidate retrieval, evidence ranking, prompt budget |
| Digest, context modes, synthesis, sufficiency | SDK context-integration | Lower-cost lane scaffold and escalation signal |
| Summary cache | summary | Optional compact explanation, never required for indexing |
| Provider and CLI adapters | providers / agents | Provider-specific invocation and verified capabilities only |
| Sessions and task ledger | agents + SDK | Lifecycle and cross-provider task continuity |
| Usage/limits/pricing | usage | Honest cost/usage accounting and preflight constraints |

No existing component may be bypassed to query the context database directly.

## 3. WorkPacket

A future `WorkPacket` is a provider-neutral, serializable view of one bounded
attempt. It replaces a flat "here is the repository, solve it" prompt.

```text
WorkPacket
├── task
│   ├── normalized goal
│   ├── output contract
│   └── task classification
├── deterministic guidance
│   ├── plan
│   ├── synthesis conclusion + evidence chain
│   ├── permitted scope and explicit exclusions
│   └── one bounded next action
├── repository evidence
│   ├── repository digest / project instructions
│   ├── symbols and exact source ranges
│   ├── selected code excerpts / structural skeletons
│   ├── graph closure and test conventions
│   └── current diff and changed-file delta
├── execution contract
│   ├── response schema
│   ├── token/turn/candidate limits
│   ├── allowed verification actions
│   └── escalation policy
└── compact task state
    ├── prior findings
    ├── attempts and validation observations
    └── unresolved questions
```

### Stable scaffold and dynamic suffix

The renderer deliberately separates reusable content from per-attempt content:

```text
Stable scaffold                         Dynamic suffix
─────────────────────────────────────  ───────────────────────────────────
project instructions                    user task and normalized goal
tool schemas                            selected file/symbol ranges
repository digest                       current diff
static safety policy                    fresh tool/test output
stable naming/test conventions          compact task-state delta
```

This split makes prompt layout cache-friendly where a provider supports it. It
does not assume any CLI or API exposes cache controls. Adapters map the logical
sections to a provider's native cache feature when they can; otherwise they
render the same correct prompt with no cache claim.

## 4. Retrieval strategies

The existing task classifier provides a starting signal. The future controller
will choose one of a small number of deterministic strategies, not an arbitrary
model-generated search plan.

### Locate / understand

Use exact symbol or path resolution first, then concise definitions, callers,
callees, module placement, and a shortest dependency path when relevant.

### Repair

Start from issue terms, stack/error text, failing test names, and recent changed
files where available. Expand through callers/callees and matching tests only
within a bounded closure. The packet should identify a plausible fault site and
ask the model to verify or falsify it.

### Refactor

Build an impact set and a change boundary before generation. Include public
exports, dependents, tests, and cycles. Reject a lower-cost lane when the
boundary is too broad for the configured policy.

### Test / review

Prioritize affected code, existing test conventions, test-file relationships,
and acceptance criteria. For review, include the diff plus relevant contracts;
do not resend unrelated repository files.

Every strategy has the same safety invariants: deny filtering, token budget,
evidence attribution, freshness signaling, and sufficiency evaluation.

## 5. Capability-aware route policy

The policy decides **a lane**, not a vendor. A lane selects a configured model
or provider only after capability, availability, privacy, budget, and risk rules
permit it.

```text
Route inputs
├── task: category, scope, risk tags, complexity signals
├── context: sufficiency, confidence, evidence size, freshness
├── model capability: tool use, structured output, local execution,
│                     cache control, actual-usage reporting (or unknown)
├── policy: allowed providers, user preference, cost/latency/quality limits
└── execution: attempts, validation outcomes, task-ledger progress
                     │
                     ▼
             explainable RouteDecision
             ├── selected lane + provider/model when known
             ├── context mode and WorkPacket limits
             ├── validation/candidate budget
             └── reasons and possible escalation triggers
```

The first implementation is a deterministic, configuration-backed rule policy.
For example, a narrow repair with fresh, sufficient evidence may select a local
model; a public API migration may begin on the frontier lane. A trained router is
deferred until opt-in local measurements demonstrate that it outperforms the
rule policy on the project's own evaluation corpus.

Provider and CLI details never leak into this policy. Adapter facts may be
unknown; unknown must not be converted into a cache, price, or capability claim.

## 6. Validation and escalation loop

The controller makes model retries useful by providing real external feedback,
not a request to "try harder."

```text
Compile WorkPacket
       │
       ▼
Generate bounded action / candidate patch
       │
       ▼
Check response schema, allowed scope, and policy
       │
       ├── invalid ─────────────► focused retry or escalation
       │
       ▼
Run allowlisted verification
       │
       ├── pass ────────────────► record outcome and return result
       │
       └── fail ────────────────► compact redacted observation
                                      │
                                      ├── one targeted retry
                                      └── policy-triggered escalation
```

Validation is a security boundary:

- commands are selected by user-configured project policy, not model text;
- command execution uses argument arrays, timeout, bounded output, and a safe
  working directory;
- secrets, denied files, and raw environment values are excluded from packets,
  observations, durable state, and usage records;
- an interactive external CLI cannot be assumed to yield a transcript; and
- failure to validate is reported honestly, never converted into a pass.

## 7. Ownership and dependency direction

The target preserves the repository's dependency matrix.

```text
core
  └── type-only contracts:
      WorkPacket, ModelCapability, RouteDecision, RoutePolicyPort,
      ValidationPort, validation/result models

search
  └── optional relevance scorer / local hybrid-reranker implementation

providers + agents
  └── adapter-specific capability discovery and native prompt-cache mapping

usage
  └── tri-state attribution metadata; no prompts or source content

sdk
  └── composition root and controller:
      retrieval strategy → WorkPacket → route policy → session/provider
      → validator → task ledger / usage recording

cli / mcp / extension
  └── thin SDK consumers; no direct DB, provider, or process access
```

`packages/sdk` composes the controller because it already composes the Context
SDK, context integration, sessions, providers, and usage service. The future
standalone agent router may call this controller; it must not duplicate its
policy or its prompt construction.

The task ledger from ADR-025 remains the durable task continuation record. A
future schema extension may add a bounded semantic progress summary, but it will
not persist vendor-private reasoning or unrestricted full transcripts.

## 8. Measurement and evaluation

Implementation begins with measurement, not a learned route model. Each run must
be attributable without recording sensitive prompt content.

### Per-attempt measurements

- task and route decision identifiers;
- selected context mode, retrieved evidence count, estimated packet tokens, and
  stable/dynamic section attribution;
- provider-reported input/output/cache tokens when available, otherwise the
  existing actual/estimated/unknown provenance;
- latency, model/session turns, candidate count, validation result, retry count,
  and escalation reason; and
- task outcome plus safe verification evidence.

### Evaluation gates

Every new retrieval strategy, reranker, packet format, validator, or policy
change must compare with a fixed baseline on a versioned corpus:

- expected-file and expected-symbol recall;
- context sufficiency and citation/evidence accuracy;
- task completion / verification pass rate;
- token, latency, retry, and escalation distributions; and
- privacy and deny-filter regression tests.

Public benchmarks such as SWE-bench can provide external context, but they do
not replace a reproducible CodeAtlas corpus or the repository's existing testing
rules. Any future harness must remain scoped to the controller and must not
recreate the removed benchmark product surface.

## 9. Delivery sequence

1. **Observability and corpus** — define safe attempt attribution and a small,
   versioned evaluation corpus; establish the existing package as baseline.
2. **Retrieval strategies and WorkPacket** — ship deterministic task-specific
   selection, exact range/skeleton rendering, and packet contract tests.
3. **Validation controller** — add allowlisted command policy, bounded
   observations, targeted retry, and task-ledger progress integration.
4. **Rule policy** — expose explainable lane selection, hard budget/privacy/risk
   gates, and policy-triggered escalation.
5. **Optional reranking and learned routing** — only after evaluations show an
   improvement and users can control data collection and model selection.

Each phase needs its own implementation plan, tests, threat review, and
documentation updates. No public behavior is implied by this design document.

## 10. Non-goals

- Reimplementing Claude Code, Codex, Gemini CLI, OpenCode, or another agent's
  internal behavior.
- Guaranteed capability or benchmark parity between a small/free model and a
  frontier model.
- Silent cross-provider fallback, duplicate model calls, or shadow traffic.
- Unbounded autonomous exploration, raw full-repository upload, or arbitrary
  model-generated command execution.
- A database schema change or a replacement for the Context SDK.

