# CodeAtlas AI Architecture Research

**Architecture review and recommendation**  
**Date:** 2026-10-16  
**Status:** Research report — proposed target architecture  
**Scope:** Architecture for stronger repository-level AI, context delivery, agent orchestration, verification, memory, and evaluation

---

## 1. Executive decision

The best architecture for CodeAtlas is a **local-first modular control plane** built
on the repository’s existing clean architecture.

It should combine:

- hexagonal/ports-and-adapters boundaries;
- a deterministic context compiler;
- an evidence graph and multi-resolution delivery model;
- external-agent adapters behind SessionPort;
- a task state machine backed by append-only events;
- policy and verification gates around actions;
- traceable evaluation as a first-class subsystem.

It should remain a **modular monolith** for this phase. The modules should be
independently owned and replaceable, but they should run in one local process
where practical and share the existing SDK composition root.

The architecture should not become:

- a second native agent loop;
- a distributed set of microservices;
- a giant prompt template;
- an ungoverned memory database;
- a provider-specific orchestration framework;
- a collection of autonomous subagents with no deterministic controller.

### Recommended shape

    User / CLI / IDE / MCP client
                 |
                 v
        Application control plane
        task -> policy -> context -> session -> verify
                 |
       +---------+----------+
       |                    |
       v                    v
    Context compiler     Agent session adapters
       |                    |
       v                    v
    SDK ports            External AI CLIs / MCP
       |
       v
    Indexed repository state

    Cross-cutting:
    event log • traces • budgets • deny filter • approvals • evaluation

This architecture makes CodeAtlas stronger by improving the environment in which
models operate, while preserving the model/provider boundary.

---

## 2. The architecture question

There are five plausible directions:

1. **Native agent runtime:** CodeAtlas owns the model loop, tools, memory, and
   provider calls.
2. **Thin context server:** CodeAtlas only indexes and serves retrieval results.
3. **Free-form multi-agent swarm:** specialist agents coordinate through prompts
   and shared files.
4. **Distributed control-plane services:** context, routing, sessions, memory,
   verification, and evaluation become network services.
5. **Modular control plane:** CodeAtlas owns deterministic coordination and
   verification, while external agents retain their own model/tool loops.

The fifth is the best fit.

The architecture must maximize reliability without assuming that one vendor,
one model, or one agent runtime will remain dominant. It must also preserve the
current CodeAtlas rules:

- consumers read context through createContextSDK;
- feature packages depend inward on core and shared;
- provider-specific behavior stays in adapters;
- repository state is local and privacy-preserving;
- shell/process execution is controlled;
- planned features do not get smuggled into the implemented surface.

---

## 3. Research evidence

### 3.1 Agent architecture is a workflow problem, not only a model problem

Anthropic distinguishes workflows—predefined code paths combining model calls and
tools—from agents that dynamically decide their own process. Their guidance is
to use the simplest architecture that meets the task, adding agentic freedom
when fixed workflows are insufficient.

For CodeAtlas this means:

- deterministic stages should stay deterministic;
- the model should decide only where language judgment adds value;
- free-form autonomy should be bounded by tools, scope, budgets, and verification.

Source:

- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)

### 3.2 Context engineering requires a controller

Anthropic frames context engineering as curating the complete state available to
the model: instructions, tools, external data, message history, and prior
actions. The target is the smallest high-signal context that supports the next
decision.

That favors a controller with explicit context assembly and lifecycle events,
not a single prompt string.

Source:

- [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### 3.3 Stable interfaces outlive agent implementations

Anthropic’s managed-agent architecture separates session, harness, and sandbox
interfaces so implementations can change independently. OpenAI’s Agents SDK
similarly separates agents, runners, tools, handoffs, guardrails, sessions,
tracing, and usage.

The architectural lesson is not to copy either SDK. It is to preserve stable
interfaces at the boundaries where CodeAtlas already has them:

- Context SDK;
- AgentPort;
- SessionPort;
- ProviderPort;
- VerifierPort;
- Tool registry;
- task ledger.

Sources:

- [Anthropic: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents)
- [OpenAI Agents SDK quickstart](https://openai.github.io/openai-agents-python/quickstart/)
- [OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-python/tracing/)

### 3.4 Verification belongs in the architecture, not the prompt

Recent architecture research proposes verification as a separate layer with
deterministic control over acceptance and memory writes. Anthropic’s evaluation
guidance likewise emphasizes grading the resulting environment state rather than
trusting the agent’s final prose.

For CodeAtlas, a verifier is not just a test runner. It is the boundary that
decides whether a task may advance from editing to complete.

Sources:

- [Verification as an Architectural Layer for LLM Agents](https://arxiv.org/abs/2609.31937)
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### 3.5 Tools and handoffs are interfaces

OpenAI’s documentation distinguishes handoffs from manager-controlled agents-as-
tools. Anthropic describes tools as contracts between deterministic software
and non-deterministic agents.

This supports a clear CodeAtlas rule:

- external agent sessions remain provider-owned;
- CodeAtlas owns the manager/control-plane decisions;
- handoffs carry typed, bounded state;
- tool calls are validated and observable;
- policy is enforced around tools, not only described in prompts.

Sources:

- [OpenAI: Agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [OpenAI: Guardrails](https://openai.github.io/openai-agents-python/guardrails/)
- [Anthropic: Writing effective tools](https://www.anthropic.com/engineering/writing-tools-for-agents)

---

## 4. Architecture options

### Option A — CodeAtlas becomes a native agent runtime

CodeAtlas would own:

- model calls;
- conversation loop;
- tool definitions;
- approvals;
- memory;
- compaction;
- provider routing;
- sandbox execution;
- verification.

**Advantages**

- maximum control over context and tool calls;
- one place for telemetry and policy;
- easier to implement uniform evaluation;
- can make local models first-class.

**Disadvantages**

- duplicates mature external coding agents;
- creates a large provider and model compatibility burden;
- makes CodeAtlas responsible for every tool-loop failure;
- expands security scope dramatically;
- conflicts with the existing ADR-026 and Direction B boundary;
- risks turning the context engine into an agent product before its evaluation
  foundation is ready.

**Decision:** reject as the default architecture. Keep the existing narrow
provider/tool-loop seams available for future experiments, but do not make a
native loop the product center.

### Option B — Thin retrieval server

CodeAtlas would only index repositories and expose search/read tools.

**Advantages**

- small surface;
- easy to reason about;
- low security and lifecycle complexity;
- compatible with any external agent.

**Disadvantages**

- cannot guarantee verification;
- cannot preserve task continuity reliably;
- cannot enforce context budgets across a run;
- cannot coordinate launch, handoff, or failure recovery;
- leaves the most valuable control-plane behavior to every consumer.

**Decision:** insufficient. CodeAtlas has already grown beyond a passive index
and should use its session, task, usage, and verifier foundations.

### Option C — Free-form multi-agent swarm

A planner, researcher, coder, reviewer, and memory agent would communicate
through prompts, files, or a shared message bus.

**Advantages**

- can parallelize independent research;
- specialist prompts can be tuned separately;
- evaluator separation may catch some self-confirming errors;
- flexible for long or ambiguous tasks.

**Disadvantages**

- multiplies tokens, latency, and failure modes;
- creates conflicts over shared repository state;
- makes evaluation harder;
- encourages agents to generate more context and more artifacts;
- can hide responsibility for the final decision;
- requires deterministic coordination before it becomes safe.

**Decision:** use evaluator or specialist phases only as opt-in workflows around
a single controlled task. Do not make a swarm the base architecture.

### Option D — Distributed microservices

Separate network services would own context, routing, sessions, memory,
verification, tools, and evaluation.

**Advantages**

- independent deployment and scaling;
- clear runtime isolation;
- remote workers and shared team infrastructure;
- natural service-level telemetry.

**Disadvantages**

- unnecessary operational complexity for a local developer tool;
- increases privacy and secret-handling surface;
- introduces network failure and version-skew problems;
- weakens the local-first model;
- makes atomic repository/task transitions harder;
- risks splitting one architecture rule across many repositories.

**Decision:** defer. Preserve ports so services can be introduced later if a
real product requirement demands them.

### Option E — Modular local control plane

A single composition root coordinates explicit modules:

- task intake;
- policy;
- context compilation;
- session adapter;
- observation;
- verification;
- task state;
- telemetry/evaluation.

**Advantages**

- fits current repository architecture;
- preserves local-first privacy;
- makes deterministic logic testable without a provider;
- supports external agents and future local loops;
- allows modules to be extracted later;
- keeps security gates close to side effects;
- provides one place for release policy.

**Disadvantages**

- requires discipline to avoid a “god orchestrator”;
- synchronous local composition can tempt cross-module shortcuts;
- the control plane must define state and event contracts carefully;
- provider differences still require adapter work.

**Decision:** recommended.

---

## 5. Recommended architecture in detail

### 5.1 Layer 1 — Domain contracts

Keep packages/core as the contract center. Add only concepts that are stable
across providers and transports.

Candidate domain concepts:

- Task;
- TaskScope;
- TaskState;
- EvidenceRef;
- EvidenceRole;
- ContextPlan;
- WorkPacket;
- ActionRequest;
- ActionObservation;
- VerificationResult;
- HandoffState;
- PolicyDecision;
- RunEvent;
- CapabilityProfile.

Core must not know:

- SQLite;
- filesystem implementation;
- HTTP;
- a specific CLI;
- a specific model;
- MCP transport;
- prompt wording.

A WorkPacket should be serializable and provider-neutral. It should contain
structured data first and rendered text only at the delivery edge.

### 5.2 Layer 2 — Deterministic context compiler

The context compiler belongs in the existing SDK context-integration boundary,
not in providers or consumers.

It should perform:

1. task normalization;
2. scope extraction;
3. retrieval candidate generation;
4. evidence-role assignment;
5. graph-neighborhood selection;
6. multi-resolution representation choice;
7. deduplication;
8. budget allocation;
9. trust/provenance annotation;
10. WorkPacket construction;
11. provider-neutral rendering or adapter projection.

The compiler should be pure where possible:

    ContextRequest + ContextSDK snapshot + policy
        → ContextPlan / WorkPacket

This makes it straightforward to test with fixtures and to compare alternative
strategies without launching a model.

### 5.3 Layer 3 — Agent session boundary

Keep SessionPort as the boundary to external CLIs and interactive sessions.

SessionPort should expose lifecycle operations such as:

- create;
- launch;
- attach;
- observe;
- wait;
- interrupt;
- terminate;
- handoff;
- close.

The session manager should not assemble context directly from the database.
It receives a WorkPacket or rendered provider-neutral payload from the SDK.

Provider adapters may translate the packet to provider-specific launch arguments,
but they must not change repository selection or security policy.

### 5.4 Layer 4 — Action and policy control

Actions should pass through a policy controller before they affect the
repository or an external process.

The controller should evaluate:

- task scope;
- path authorization;
- process command policy;
- approval requirements;
- context freshness;
- budget;
- agent capability;
- risk class;
- current task state.

Policy decisions should be typed:

- allowed;
- allowed-with-warning;
- requires-approval;
- denied;
- unavailable.

The model must never be able to override a denied decision by writing a
different instruction into the context.

### 5.5 Layer 5 — Observation and verification

Every meaningful action should produce an observation:

- action id;
- session id;
- timestamp;
- affected paths;
- stdout/stderr classification;
- exit status;
- tests/build/lint result;
- freshness impact;
- next-state recommendation.

Verification should be layered:

- precondition checks;
- focused checks;
- repository checks;
- package/build checks;
- impact checks;
- final claims verification.

The verifier writes a VerificationResult. It does not declare success based on
agent text.

### 5.6 Layer 6 — Event-sourced task state

Do not make a mutable “current memory” file the source of truth.

Use an append-only task event stream with typed, bounded events:

- task-created;
- scope-set;
- context-built;
- evidence-confirmed;
- action-requested;
- action-observed;
- verification-started;
- verification-failed;
- verification-passed;
- decision-recorded;
- handoff-created;
- task-compacted;
- task-completed;
- task-blocked.

A deterministic projection produces:

- current task summary;
- next action;
- open questions;
- files changed;
- verification status;
- compact handoff;
- audit view.

This reuses the principles already present in the task ledger while giving
long-running work a clearer state machine.

### 5.7 Layer 7 — Trace and evaluation plane

Telemetry should be local and privacy-aware by default.

Record:

- context plan hash;
- packet size and sections;
- retrieval candidates and selected evidence;
- tool calls and outcomes;
- model/provider identifiers when explicitly configured;
- costs and token states;
- verification results;
- task outcome;
- escalation reason;
- redaction/exclusion events.

The evaluation runner should consume these traces but remain separate from the
production control path. It should be possible to run the deterministic parts
with a scripted/fake provider.

---

## 6. The key object model

The architecture should make the following distinctions explicit.

### ContextRequest

What the caller asks for:

- task;
- repository;
- scope;
- desired output;
- mode;
- budget;
- capability hint;
- freshness requirement.

### ContextPlan

What CodeAtlas intends to provide:

- selected seeds;
- evidence roles;
- deferred references;
- required constraints;
- expected verification;
- confidence and insufficiency reasons.

### WorkPacket

What the agent receives:

- task contract;
- trusted instructions;
- untrusted evidence;
- provenance;
- missing/stale/truncated state;
- next-step affordances;
- verification contract.

### ActionRequest

What the agent wants to do:

- action type;
- tool or process;
- typed arguments;
- requested paths;
- reason/evidence references;
- approval requirement.

### ActionObservation

What actually happened:

- accepted/denied;
- process/tool result;
- changed paths;
- errors;
- output references;
- state transition.

### VerificationResult

What the repository proves:

- check id;
- command/tool;
- status;
- affected scope;
- evidence;
- failure category;
- completion eligibility.

### HandoffState

What the next session needs:

- objective;
- current state;
- decisions;
- failed attempts;
- changed files;
- verification results;
- unresolved questions;
- next action;
- references to detailed artifacts.

These objects let the system pass compact structured state between modules
instead of copying a long transcript into every prompt.

---

## 7. Runtime flows

### 7.1 Bounded single-agent task

    user task
      → create Task
      → build ContextPlan
      → compile WorkPacket
      → launch external Session
      → agent calls tools / edits
      → observe actions
      → run Verification
      → complete or return targeted failure
      → project HandoffState

This should be the default.

### 7.2 Evidence-insufficient task

    WorkPacket
      → agent identifies missing evidence
      → scoped read/search request
      → policy checks request
      → Context SDK returns bounded expansion
      → packet delta or next-turn context
      → continue

No full repository replay is required.

### 7.3 Verification failure

    agent action
      → focused verification fails
      → classify failure
      → preserve failure + affected symbols
      → build targeted repair context
      → retry within budget
      → escalate or block after policy threshold

A failure should shrink the next context to the affected path, not append the
entire failed transcript.

### 7.4 High-risk task

    task classified high risk
      → stricter scope and approval policy
      → stronger context requirements
      → action approval
      → independent verification
      → explicit release decision

High risk includes security-sensitive files, migrations, public API changes,
destructive commands, and broad impact graphs.

### 7.5 Optional evaluator workflow

    primary agent completes a bounded unit
      → deterministic checks
      → evaluator receives artifact + rubric + evidence
      → evaluator produces findings
      → primary agent receives compact findings
      → reverify

The evaluator is a workflow plugin, not a permanent second brain.

---

## 8. Context architecture inside this design

### 8.1 Three representations

Keep three separate representations:

1. **Index representation:** optimized for search and graph construction.
2. **Evidence representation:** optimized for human/model comprehension.
3. **Prompt representation:** optimized for the selected provider transport.

This avoids forcing one chunk format to satisfy all three jobs.

### 8.2 Evidence graph, not flat ranked list

Each selected item should be connected to a task seed and assigned a role:

- target;
- definition;
- caller;
- callee;
- test;
- constraint;
- summary;
- alternative;
- background.

The WorkPacket can then state:

    Target: path/file.ts, symbol X
    Caller: path/routes.ts, function Y
    Test: path/file.test.ts, case Z
    Constraint: AGENTS.md
    Deferred: path/other.ts:L20-L60

That is more useful than a list of scores alone.

### 8.3 Budget allocation

Use a utility budget with protected reservations:

- contract and policy budget;
- provenance budget;
- answer-bearing evidence budget;
- relationship/test budget;
- optional background budget;
- deferred-pointer budget.

Allocation policy:

1. keep the task contract;
2. keep at least one complete target unit;
3. keep the smallest contract/test pair when available;
4. preserve provenance;
5. shrink low-priority bodies to outlines or pointers;
6. drop background last;
7. report omissions.

### 8.4 Adaptive expansion

Expansion should be driven by explicit signals:

- low sufficiency;
- contradictory evidence;
- unresolved symbol;
- missing caller or test;
- verification failure;
- stale index;
- scope crossing.

Do not expand merely because tokens remain.

### 8.5 Provider projection

The core WorkPacket remains neutral. A provider adapter may choose:

- message roles;
- XML-like or JSON-like section boundaries;
- launch arguments;
- context injection location;
- model capability settings.

The adapter must not choose different repository evidence silently. If a
provider needs a different projection, log the projection and preserve the
same underlying WorkPacket id.

---

## 9. Why not microservices now

Microservices would be justified by one of these concrete needs:

- remote shared repositories;
- multi-user hosted execution;
- independent scaling of expensive model workloads;
- strict tenant isolation;
- external orchestration integrations;
- a team boundary that cannot share a release unit.

The current CodeAtlas problem is different: it needs coherent local transitions
between context, session, action, verification, and task state.

A local modular control plane gives:

- atomic local file and task operations;
- lower latency;
- less privacy exposure;
- simpler testing;
- one versioned architecture;
- easier offline use.

Ports should still be designed so that context, verification, or session workers
can be extracted later. Extraction is easier from a modular monolith than
coordination is from premature services.

---

## 10. Why not a native agent loop now

A native loop is not wrong in principle. It is wrong as the next architectural
center because CodeAtlas has not yet exhausted the value of its existing
deterministic advantages.

Build the native loop only if evaluation shows that external agents cannot
provide a needed capability, such as:

- a local provider with no usable CLI;
- a provider-neutral tool approval loop;
- a specialized offline repair workflow;
- deterministic context deltas unavailable to external CLIs;
- a product requirement for a first-party agent runtime.

If that day arrives, implement it behind SessionPort or a new explicit
ChatAgentPort. Do not make consumers depend on a concrete loop.

---

## 11. Security architecture

The architecture must treat the model as an untrusted decision-maker, not as a
security boundary.

### Trust zones

1. **Trusted policy:** system rules, user request, approved project policy.
2. **Indexed repository data:** source, comments, docs, tests, summaries.
3. **Agent proposal:** model-generated tool/action request.
4. **Policy decision:** deterministic validation and approval.
5. **Execution result:** external process/tool observation.
6. **Derived memory:** only facts that pass verification/provenance rules.

### Required controls

- deny filter before context delivery and trace persistence;
- path-safe repository references;
- argument-array process execution;
- no shell string built from model/repository content;
- approval for destructive or high-risk actions;
- separate read and write tools;
- independent server-side authorization;
- bounded output and transcript capture;
- audit event for denied and approved actions;
- no automatic promotion of agent prose to policy;
- verification before durable completion or memory promotion.

OpenAI’s prompt-injection guidance reinforces that filtering alone is not
enough; the architecture must constrain the impact of manipulation.

Source:

- [OpenAI: Designing AI agents to resist prompt injection](https://openai.com/index/designing-agents-to-resist-prompt-injection/)

---

## 12. Evaluation architecture

The evaluation system must test the full control plane.

### Components

- task corpus;
- clean repository fixture per trial;
- scripted provider/session adapter;
- context-plan recorder;
- tool/action recorder;
- verifier;
- deterministic graders;
- optional rubric grader;
- trace and cost reporter.

### Metrics

**Context**

- candidate recall;
- selected evidence recall;
- role coverage;
- duplicate rate;
- packet tokens;
- deferred reads;
- staleness correctness.

**Agent interaction**

- tool selection accuracy;
- argument accuracy;
- unnecessary calls;
- retry loops;
- action denial rate;
- handoff completeness.

**Outcome**

- tests passed;
- build/typecheck status;
- changed-file correctness;
- scope violations;
- task completion;
- failure honesty;
- cost and latency.

### Architecture ablations

Compare:

- current renderer;
- structured WorkPacket;
- symbol/range delivery;
- graph-neighborhood delivery;
- adaptive expansion;
- hybrid candidate retrieval;
- verifier feedback;
- compact handoff;
- optional evaluator.

Do not evaluate only final answer text. Grade the repository state and the
trace.

OpenAI’s Agents SDK demonstrates the value of deterministic provider-neutral
workflow testing and traces; CodeAtlas should apply that principle within its
own SDK and privacy model.

Sources:

- [OpenAI Agents SDK testing](https://openai.github.io/openai-agents-python/testing/)
- [OpenAI Agents SDK usage](https://openai.github.io/openai-agents-python/usage/)
- [Anthropic: Demystifying evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

---

## 13. Architecture roadmap

### Phase 0 — Preserve and formalize existing seams

- confirm Context SDK, SessionPort, ProviderPort, and VerifierPort ownership;
- define WorkPacket and EvidenceRef in core only if stable;
- add architecture tests preventing consumer/database bypass;
- document state and event ownership.

**Gate:** no new parallel context or session path.

### Phase 1 — Context compiler

- ContextPlan;
- evidence roles;
- multi-resolution representations;
- structured rendering;
- pointer-based deferred reads;
- budget utility report.

**Gate:** deterministic fixture output and no privacy regression.

### Phase 2 — Control-plane lifecycle

- typed TaskState;
- preflight policy;
- action observation;
- postflight verification;
- structured failure-to-next-context flow.

**Gate:** a failed task can continue with a targeted packet rather than a full
transcript replay.

### Phase 3 — Evaluation and trace plane

- isolated task runner;
- scripted sessions;
- trace schema;
- retrieval/delivery/outcome metrics;
- ablation reports.

**Gate:** baseline is reproducible offline.

### Phase 4 — Continuity

- append-only task events;
- deterministic projection;
- compact handoff;
- reset policy;
- cross-provider resume.

**Gate:** decisions and failures survive a new session without stale history.

### Phase 5 — Optional advanced capabilities

Only after measured need:

- semantic retrieval adapter;
- contextual indexing metadata;
- evaluator workflow;
- model capability routing;
- governed project memory;
- remote worker/service extraction.

**Gate:** each capability has an ADR, threat model, metric, and rollback path.

---

## 14. ADRs required before implementation

The architecture recommendation itself should be approved as an ADR before
cross-package implementation.

Follow-up ADRs should cover:

1. WorkPacket and EvidenceRef contracts;
2. task state machine and event projection;
3. policy/action/verification lifecycle;
4. trace and evaluation schema;
5. semantic retrieval adapter, if adopted;
6. governed memory, if adopted;
7. provider capability profiles, if routing is adopted;
8. remote service extraction, only if required.

Do not create an ADR for a purely internal renderer refactor that preserves
existing contracts. Do create one when ownership, ports, persistence, or
security behavior changes.

---

## 15. Ownership and delegation

### Core/domain owner

Owns stable types and ports:

- WorkPacket;
- EvidenceRef;
- TaskState;
- ActionRequest;
- VerificationResult;
- HandoffState.

Must not own persistence, prompt wording, provider flags, or process spawning.

### SDK/control-plane owner

Owns:

- context compiler;
- task lifecycle;
- policy coordination;
- orchestration;
- handoff projection;
- composition.

Must not bypass Context SDK or spawn processes directly.

### Context/retrieval owner

Owns:

- candidate generation;
- evidence graph;
- multi-resolution selection;
- budgets;
- relevance and sufficiency.

Must not call external providers in the deterministic path.

### Agents/session owner

Owns:

- external CLI adapters;
- session lifecycle;
- output capture;
- attach/wait/terminate behavior.

Must not decide repository truth or bypass policy.

### Verification/evaluation owner

Owns:

- checks;
- graders;
- traces;
- baseline;
- release reports.

Must not silently mutate source repositories during grading.

### Security owner

Owns:

- trust zones;
- deny filter;
- approvals;
- path/process policy;
- hostile-input fixtures;
- privacy review.

Must be involved before any write-enabled memory or tool surface ships.

---

## 16. Release decision

### Architecture ship bar

The recommended architecture is ready for implementation when:

- the modular control-plane boundary is documented;
- core contracts are provider-neutral;
- one canonical Context SDK read path remains;
- one canonical SessionPort delivery path remains;
- verification is an explicit lifecycle stage;
- task state ownership is explicit;
- policy is enforced outside model prose;
- evaluation can run without a live provider;
- no new package duplicates existing context, task, or session systems.

### Current CTO decision

**Adopt Option E: modular local control plane.**

Implement first:

1. WorkPacket/evidence contract;
2. context compiler and multi-resolution delivery;
3. lifecycle policy and verification;
4. offline evaluation and traces;
5. event-based handoff/continuity.

Defer:

- native agent loop;
- microservices;
- free-form multi-agent swarm;
- vector database;
- learned routing;
- automatic memory promotion.

The architecture is strong because it improves the model’s operating environment
without pretending that CodeAtlas must replace every external agent.

---

## 17. Final architecture statement

CodeAtlas should become the **context compiler, policy controller, session
coordinator, and verification authority** around external AI agents.

The model remains the adaptive reasoning component. CodeAtlas remains the
deterministic evidence and control component.

The durable architecture is:

    clean domain contracts
      + deterministic context compiler
      + provider/session adapters
      + policy and verification loop
      + append-only task state
      + local evaluation traces

That design is small enough to ship locally, strong enough to support long
repository tasks, and modular enough to evolve if CodeAtlas later becomes a
first-party agent runtime or a hosted control plane.

---

## 18. Research sources

### Agent architecture and workflows

- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [OpenAI Agents SDK quickstart](https://openai.github.io/openai-agents-python/quickstart/)
- [OpenAI agent orchestration](https://openai.github.io/openai-agents-python/multi_agent/)
- [Architectures for Building Agentic AI](https://arxiv.org/abs/2512.09458)

### Sessions, handoffs, and observability

- [Anthropic: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents)
- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [OpenAI Agents SDK handoffs](https://openai.github.io/openai-agents-python/handoffs/)
- [OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-python/tracing/)
- [OpenAI Agents SDK testing](https://openai.github.io/openai-agents-python/testing/)

### Tools, guardrails, and verification

- [Anthropic: Writing effective tools](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Anthropic: Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)
- [OpenAI Agents SDK guardrails](https://openai.github.io/openai-agents-python/guardrails/)
- [Verification as an Architectural Layer for LLM Agents](https://arxiv.org/abs/2609.31937)
- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### CodeAtlas architecture references

- docs/architecture/ARCHITECTURE.md
- docs/architecture/MODULES.md
- docs/architecture/DEPENDENCIES.md
- docs/architecture/CONTEXT.md
- docs/architecture/AGENT_SESSIONS.md
- docs/architecture/AGENT_ORCHESTRATOR.md
- docs/reference/CONTEXT_SDK.md
- docs/decisions/ADR-007.md
- docs/decisions/ADR-008.md
- docs/decisions/ADR-025-task-ledger-handoff.md
- docs/decisions/ADR-026-token-efficient-model-strategy.md

