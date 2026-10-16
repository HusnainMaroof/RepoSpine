# Modular Control Plane Implementation Plan

**Project:** CodeAtlas  
**Date:** 2026-10-16  
**Status:** Proposed implementation plan  
**Scope:** Local-first modular control plane around external AI agents  
**Explicit exclusion:** CLI harness work is not included.

## 1. Goal

Implement a provider-neutral control plane that coordinates:

    task → policy → context plan → WorkPacket → external session
         → observation → verification → task handoff

CodeAtlas owns deterministic context, policy, budgets, task state, verification,
and evidence. External agents own model reasoning, provider-native tools, and
provider-native interaction.

## 2. Non-goals

Do not implement in this work:

- new CLI harness commands or interactive CLI UX;
- a native model/tool loop;
- an agent router or slash-command surface;
- microservices or remote workers;
- project-wide memory write-back;
- a vector database or mandatory embeddings;
- an automatic multi-agent swarm;
- provider-specific retrieval logic;
- new direct database access from consumers;
- broad repository uploads to external providers.

Existing CLI, MCP, extension, and session consumers must remain compatible.

## 3. Existing foundation

Extend these existing seams:

- createContextSDK as the only consumer read façade;
- createContextIntegration in packages/sdk/src/context-integration;
- deterministic ContextPackage assembly;
- budgets, staleness, deny filtering, summaries, hierarchy, and graph traversal;
- SessionPort and createSessionManager;
- external agent adapters behind AgentPort;
- VerifierPort and the SDK-owned verifier;
- task ledger and handoff projection;
- ProviderPort adapters;
- SDK composition root;
- MCP and extension consumers;
- usage accounting and structured results.

No new control-plane module may query SQLite, storage, search, or providers
directly. All composition belongs in the SDK.

## 4. Target architecture

### Components

1. Task contract: objective, category, scope, output, expected verification.
2. Context compiler: candidates, evidence roles, graph neighborhood,
   multi-resolution selection, budgets, provenance, WorkPacket.
3. Policy controller: scope, freshness, budgets, process restrictions,
   approvals, and state transitions.
4. Session adapter: launch, attach, wait, terminate, and handoff through
   SessionPort.
5. Observation recorder: action result, changed files, failures, and next state.
6. Verification controller: focused checks, project checks, impact checks, and
   completion eligibility.
7. Task state projection: current state, decisions, failures, changed files,
   verification, next action, and handoff.
8. Evaluation plane: offline fixtures, scripted sessions, traces, graders, and
   regression reports.

### Data flow

    ContextRequest
        ↓
    ContextPlan
        ↓
    WorkPacket
        ↓
    SessionPort
        ↓
    ActionObservation
        ↓
    VerificationResult
        ↓
    TaskEvent
        ↓
    HandoffState / next ContextRequest

## 5. Core contracts

Add only stable, provider-neutral contracts to packages/core.

### ContextRequest

- task text;
- repository identity;
- optional scope paths;
- context mode;
- token/item budget;
- freshness requirement;
- optional capability hint;
- required output type.

### EvidenceRef

- stable evidence id;
- path or non-file source;
- symbol id or line range;
- evidence role;
- selection reason;
- confidence;
- freshness;
- trust classification;
- deferred-read capability.

### ContextPlan

- task contract;
- selected seeds;
- evidence references;
- missing/deferred references;
- expected verification;
- budget decision;
- insufficiency reason;
- plan version.

### WorkPacket

- task contract;
- trusted constraints;
- repository orientation;
- evidence map;
- selected evidence;
- omissions and deferred reads;
- verification contract;
- final response contract.

WorkPacket is serializable and provider-independent. Rendered prompt text is a
projection at the delivery edge, not the domain object.

### ActionRequest

- task id;
- session id;
- action/tool/process name;
- typed arguments;
- requested paths;
- evidence references;
- approval level.

### ActionObservation

- action id;
- accepted/denied status;
- timestamps;
- result status;
- affected paths;
- bounded output reference;
- failure category;
- next-state hint.

### VerificationResult

- check id;
- check type;
- command/tool identity;
- status;
- affected scope;
- evidence;
- failure category;
- completion eligibility.

### HandoffState

- objective;
- current state;
- scope;
- decisions;
- attempted changes;
- failures;
- changed files;
- verification results;
- unresolved questions;
- next action;
- detailed artifact references.

## 6. Implementation phases

### Phase 0 — Architecture contract and baseline

**Owner:** Architecture and evaluation

Work:

1. Write an ADR for control-plane ownership and the WorkPacket boundary.
2. Confirm reuse of ContextPackage, SessionPort, VerifierPort, task-ledger
   types, and usage events.
3. Define the first WorkPacket schema without provider fields.
4. Define task states:
   planned, exploring, evidence-confirmed, editing, verifying, blocked,
   complete, handed-off.
5. Create golden packages from current behavior.
6. Record baseline evidence, token, session, verification, and outcome metrics.

Likely areas:

- docs/decisions;
- packages/core/src/ports;
- packages/core/src/entities;
- packages/sdk/src/context-integration;
- evaluation fixtures.

Exit criteria:

- ADR approved;
- no consumer bypass;
- WorkPacket fields are testable;
- current behavior has golden fixtures;
- baseline runs without a live provider or network.

### Phase 1 — Context compiler and WorkPacket

**Owner:** Context architecture

Work:

1. Add a plan builder around existing assembly.
2. Assign evidence roles: target, definition, caller, callee, test, constraint,
   summary, alternative, and background.
3. Preserve path, symbol/range, reason, rank/tier, traversal, and freshness.
4. Add representations for pointer, outline, symbol/range body, enclosing
   structure, and full-file fallback.
5. Add deferred-read references.
6. Suppress duplicates between symbol, file, and summary items.
7. Report retained, shrunk, deferred, and dropped budget decisions.
8. Produce WorkPacket without changing provider adapters.
9. Keep the current renderer compatible during rollout.

Tests:

- serialization and determinism;
- evidence-role assignment;
- provenance;
- range slicing;
- duplicate suppression;
- budget behavior;
- stale and denied evidence;
- hostile repository text;
- compatibility rendering.

Exit criteria:

- identical inputs produce identical packets;
- no denied content appears;
- high-value evidence survives budget pressure;
- omitted items remain actionable;
- existing consumers still work.

### Phase 2 — Canonical SDK delivery

**Owner:** SDK and context integration

Work:

1. Add WorkPacket construction to ContextIntegration.
2. Make launch and attach use the packet projection path.
3. Keep provider formatting inside adapters.
4. Render task, trusted constraints, context state, repository orientation,
   evidence, deferred evidence, verification, and response contract separately.
5. Add packet id/hash correlation across context, session, usage, verification,
   and handoff.
6. Keep compatibility mode for the current renderer.
7. Ensure CLI, MCP, and extension consumers remain SDK-only.

Exit criteria:

- one canonical package-to-delivery path;
- all Context → Agent entry points agree on the packet contract;
- rollback is one configuration change;
- provider adapters receive equivalent packet semantics.

### Phase 3 — Policy and lifecycle controller

**Owner:** SDK/control plane and security

Add typed decisions:

- allowed;
- allowed-with-warning;
- requires-approval;
- denied;
- unavailable.

Preflight checks:

- task scope;
- repository freshness;
- context sufficiency;
- budget;
- requested agent;
- risk class.

Lifecycle checks:

- no completion before required verification;
- no edit outside scope without an explicit decision;
- no resume from blocked state without new evidence or override;
- independent path and argument validation;
- actionable structured policy failures.

Tests:

- scope escape;
- path traversal;
- denied process/action;
- stale index;
- insufficient context;
- missing verification;
- blocked-to-resume;
- approval-required risk.

Exit criteria:

- policy is enforced server-side;
- model text cannot override a deny;
- transitions are deterministic;
- denials are attributable.

### Phase 4 — Observation and verification loop

**Owner:** Verifier and SDK/control plane

Work:

1. Normalize external session, process, tool, changed-file, timeout, and
   cancellation results.
2. Build verification plans from task category, changed symbols, project policy,
   and prior failures.
3. Run focused checks before broad checks.
4. Convert failures into targeted next-context requests.
5. Record completion only when required checks pass or a human explicitly accepts
   a limitation.
6. Include verification evidence in handoff state.

Exit criteria:

- failed verification produces targeted follow-up context;
- full transcript replay is not required;
- agent prose cannot alone produce success;
- every completion has verification evidence.

### Phase 5 — Task events and continuity

**Owner:** Session and task-ledger owner

Extend the existing task ledger rather than creating a second store.

Event types:

- task-created;
- context-built;
- evidence-confirmed;
- action-requested;
- action-observed;
- verification-started;
- verification-failed;
- verification-passed;
- decision-recorded;
- handoff-created;
- compacted;
- completed;
- blocked.

Work:

1. validate event schema, sizes, ids, and paths;
2. build a deterministic projection;
3. preserve decisions, failures, scope, and verification before raw output;
4. add bounded compaction with an honest marker;
5. test provider A writes, provider B reads, provider B supersedes, and a later
   projection returns current state.

Constraints:

- no project-wide memory system;
- no automatic promotion of model prose to policy;
- no network sync;
- no unbounded transcript storage.

Exit criteria:

- a new session resumes from the projection;
- stale decisions are visible;
- compaction preserves required state;
- the existing task ledger remains the continuity system.

### Phase 6 — Evaluation and trace plane

**Owner:** Evaluation and release

Create 40–60 offline tasks covering lookup, explanation, bug localization,
targeted fixes, refactors, parser changes, security review, stale-index
recovery, and handoff/resume.

Record:

- ContextPlan;
- WorkPacket;
- actions;
- observations;
- verification;
- final task state.

Grade:

- evidence recall;
- attribution;
- action correctness;
- unnecessary calls;
- verification pass rate;
- scope violations;
- tokens;
- latency;
- cost;
- completion.

Run ablations:

- current renderer;
- WorkPacket;
- range-aware delivery;
- graph neighborhood;
- deferred reads;
- verifier feedback;
- handoff projection.

Exit criteria:

- baseline is reproducible;
- regressions are visible;
- default-on behavior has measured benefit or neutral cost;
- evaluation requires no credentials or network.

## 7. Ownership

### Core/domain

Owns WorkPacket, EvidenceRef, TaskState, ActionRequest, ActionObservation,
VerificationResult, HandoffState, and event types.

Must not own persistence, prompt wording, process execution, or provider flags.

### SDK/control plane

Owns context compilation, task lifecycle, policy coordination, orchestration,
handoff projection, and composition.

Must not bypass Context SDK or spawn processes directly.

### Context/retrieval

Owns candidates, evidence graph, ranges, multi-resolution selection, budgets,
and sufficiency.

Must not call external providers in the deterministic path.

### Agents/session

Owns external CLI adapters, session lifecycle, output capture, attach, wait,
and termination.

Must not decide repository truth or bypass policy.

### Verification/evaluation

Owns checks, graders, traces, baselines, and release reports.

Must not silently mutate source repositories during grading.

### Security

Owns trust zones, deny filtering, approvals, path/process policy, hostile
fixtures, and privacy review.

Must review any future write-enabled memory or tool surface.

## 8. Dependency order

    Phase 0: ADR + baseline
        ↓
    Phase 1: ContextPlan + WorkPacket
        ↓
    Phase 2: canonical delivery
        ↓
    Phase 3: lifecycle policy
        ↓
    Phase 4: observation + verification
        ↓
    Phase 5: events + continuity
        ↓
    Phase 6: evaluation default-on decision

Evaluation fixtures may begin after Phase 0. Policy contract design may begin
during Phase 2, but enforcement waits for stable WorkPacket and task states.

## 9. Files and package boundaries

Likely implementation areas:

- packages/core/src/entities;
- packages/core/src/ports;
- packages/sdk/src/context-integration;
- packages/sdk/src/orchestrator;
- packages/verifier;
- packages/agents/src;
- docs/decisions;
- package tests and fixture repositories.

Do not modify for this plan unless compatibility requires it:

- CLI commands and harness UX;
- database schema;
- provider adapters;
- extension UI;
- toolkit installer/configurator;
- browser/benchmark systems;
- unrelated parser or storage behavior.

Architecture checks:

- feature packages import only core and shared;
- CLI, MCP, and extension consume SDK;
- no consumer opens context.db;
- no control-plane module spawns directly;
- no provider branch outside adapters;
- no shell execution from model/repository-derived strings.

## 10. Risks and mitigations

### WorkPacket becomes a god object

Keep plan, packet, action, observation, verification, and handoff contracts
separate. Compose them instead of merging responsibilities.

### Duplicate context systems appear

Extend ContextPackage and the task ledger. Add one canonical delivery path and
architecture tests for bypasses.

### Control plane becomes a hidden native loop

The controller may schedule and verify, but must not simulate a provider’s
internal reasoning loop. SessionPort remains the agent boundary.

### Verification blocks useful work

Use risk-based checks and explicit human-approved limitations. Never silently
claim completion.

### Events become another memory database

Keep events task-scoped, bounded, append-only, and projected from the existing
ledger. Defer project-wide memory.

### Packet increases token cost

Reserve a small contract budget, use multi-resolution evidence, defer lower-value
bodies, and compare token cost with outcome.

### Provider behavior diverges

Preserve one provider-neutral packet and log adapter projection. Adapters must
not silently select different evidence.

### Changes land without proof

Every phase needs deterministic fixtures, tests, and an exit gate. Default-on
requires evaluation evidence.

## 11. Testing plan

Unit tests:

- contract validation;
- deterministic plan/packet ids;
- evidence roles;
- range and pointer projection;
- budget allocation;
- policy decisions;
- state transitions;
- event projection;
- verification classification.

Integration tests:

- Context SDK → Context Integration → WorkPacket;
- WorkPacket → SessionPort;
- session observation → verifier;
- verifier → task ledger;
- task ledger → handoff;
- deny filter across packet, observation, and handoff.

End-to-end fixtures:

- bounded external-agent task with a fake session;
- failed test → targeted next packet;
- cross-provider handoff;
- stale index;
- denied path;
- out-of-scope action;
- timeout/cancellation;
- incomplete verification.

## 12. Release gates

### Architecture

- ADR approved;
- ownership and dependency docs updated;
- no parallel context/session/memory system;
- ports remain provider-neutral.

### Safety

- deny-filter tests pass;
- path/process validation passes;
- model text cannot override policy;
- no secrets in packets, events, traces, or handoffs;
- high-risk actions require approval.

### Determinism

- same input produces same ContextPlan and WorkPacket;
- event projection is reproducible;
- verification classification is stable;
- packet ids correlate lifecycle records.

### Reliability

- verification failure produces targeted context;
- completion requires verification evidence;
- handoff/resume retains decisions and failures;
- compaction boundaries are tested.

### Performance

- package token budget is bounded;
- latency is measured;
- external-agent calls do not materially increase;
- high-value evidence recall does not regress.

### Default-on

The new path becomes default only when existing tests, integration tests,
contract tests, offline evaluation, and rollback verification all pass.

## 13. Definition of done

- provider-neutral WorkPacket exists;
- Context SDK is the only context read path;
- external agents receive packets through SessionPort;
- policy is enforced outside prompt prose;
- action observations are normalized;
- verification determines completion;
- task handoff is structured and bounded;
- existing task ledger remains the continuity system;
- deterministic tests cover lifecycle transitions;
- offline evaluation compares old and new paths;
- no CLI harness work was added;
- no native agent loop was introduced;
- no new database or memory system was introduced;
- release gates pass and rollback is documented.

## 14. CTO implementation decision

**Approved direction:** implement the modular local control plane.

First slice:

1. Phase 0 ADR and baseline;
2. WorkPacket and EvidenceRef contracts;
3. context compiler adapter around current ContextPackage;
4. one canonical SDK delivery path;
5. deterministic tests and compatibility mode.

Do not begin with a router, slash commands, CLI harness, memory write-back,
embeddings, multi-agent orchestration, or microservices.

The first proof is:

> Given the same repository and task, CodeAtlas produces a traceable WorkPacket,
> delivers it through SessionPort, turns a verification failure into a targeted
> next packet, and preserves the handoff in the task ledger.

## 15. Documentation updates

Before implementation:

- add the architecture ADR;
- update docs/architecture/ARCHITECTURE.md;
- update docs/architecture/MODULES.md;
- update docs/architecture/DEPENDENCIES.md if ownership changes;
- update docs/reference/CONTEXT_SDK.md;
- update docs/architecture/AGENT_SESSIONS.md;
- update docs/architecture/AGENT_ORCHESTRATOR.md only for non-CLI ownership;
- update docs/FEATURE_STATUS.md only after code exists;
- add the plan and test strategy to development documentation.

## 16. Planning references

- docs/architecture/ARCHITECTURE.md
- docs/architecture/MODULES.md
- docs/architecture/DEPENDENCIES.md
- docs/architecture/CONTEXT.md
- docs/reference/CONTEXT_SDK.md
- docs/decisions/ADR-007.md
- docs/decisions/ADR-008.md
- docs/decisions/ADR-018-verification-command-policy.md
- docs/decisions/ADR-025-task-ledger-handoff.md
- docs/decisions/ADR-026-token-efficient-model-strategy.md
- packages/sdk/src/context-integration
- packages/sdk/src/orchestrator
- packages/agents/src/session-manager.ts
- packages/verifier

