# ADR-026: Token-efficient, capability-aware model strategy

Status:     Proposed
Date:       2026-10-08

## Context

CodeAtlas already performs the expensive repository work locally and
deterministically: incremental indexing, symbols, dependency graph, digest,
context packages, task classification, planning, sufficiency checks, synthesis,
usage accounting, and cross-provider task handoff. These capabilities are a
stronger foundation for cost and quality than sending a raw repository to every
model.

The remaining product problem is how to use that foundation so that:

- every provider receives only the evidence it needs;
- small, local, and lower-cost models receive enough deterministic structure to
  succeed on bounded coding tasks;
- a frontier model is used only when an observable signal says it is likely to
  improve the result; and
- the system measures verified task outcomes, rather than optimizing a token
  count or a model benchmark in isolation.

This must work for API-backed providers and externally installed coding CLIs.
They do not expose identical model controls, cache semantics, transcripts, or
usage data. In particular, CodeAtlas cannot assume a CLI exposes a vendor's
prompt cache or a reliable model id.

Research that informs this decision:

- Prompt caches reward an exact, stable prefix; OpenAI requires a matching
  rendered prefix, Anthropic recommends placing static tools/instructions/context
  first, and Gemini recommends stable common content early in the request.
  ([OpenAI](https://developers.openai.com/api/docs/guides/prompt-caching),
  [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
  [Gemini](https://ai.google.dev/gemini-api/docs/caching))
- Repository-level generation benefits from iterative retrieval, and retrieval
  quality improves with contextualization and reranking.
  ([RepoCoder](https://arxiv.org/abs/2303.12570),
  [Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval))
- A bounded localization → repair → validation workflow can be competitive with
  a broad autonomous loop; executable validation and candidate selection can
  improve code generation across model sizes.
  ([Agentless](https://arxiv.org/abs/2407.01489),
  [S*](https://arxiv.org/abs/2502.14382))
- Model routing can reduce cost, but learned routing needs task-outcome data and
  calibration rather than a provider-name heuristic.
  ([RouteLLM](https://mlanthology.org/iclr/2025/ong2025iclr-routellm/))

## Decision

CodeAtlas will evolve toward a **provider-neutral context compiler and
verification controller**. It will assemble a structured, budgeted work packet;
choose a model lane through an explainable policy; validate results with
deterministic evidence; and escalate only when configured evidence warrants it.

### 1. Keep deterministic context as the first decision-maker

`ContextPackage`, the repository digest, deterministic synthesis, task
classification, planning, graph closure, and sufficiency checks remain the
default source of task understanding. Models consume their output; they do not
replace the index or decide which repository files CodeAtlas is allowed to send.

The controller will add task-aware retrieval strategies gradually:

- **locate / understand** — concise symbols, definitions, and dependency paths;
- **repair** — failure-adjacent files, tests, callers, and a narrow edit scope;
- **refactor** — impact closure plus an explicit change boundary; and
- **test / review** — affected behavior, existing test conventions, and the
  verification contract.

Every strategy stays deny-filtered, budgeted, explainable, and sufficiency-gated.

### 2. Introduce a provider-neutral `WorkPacket`

The SDK will eventually render one structured work packet, rather than ask each
model to rediscover a task from a flat prompt. It will contain only the
information appropriate to the task:

- normalized goal and output contract;
- task classification, deterministic plan, and engine conclusion with evidence;
- permitted and excluded file scope;
- precise source ranges, summaries, graph evidence, current diff, and task
  ledger progress when available;
- one bounded next action and a structured response contract;
- approved verification commands, limits, and escalation policy; and
- a compact state summary after each attempt.

The packet has two logical sections:

1. **Stable scaffold** — project instructions, tool schema, repository digest,
   safety policy, and static conventions.
2. **Dynamic suffix** — task, selected evidence, current diff, tool results,
   and the current compact task state.

Provider adapters may map this split to vendor cache controls when available.
The generic packet must still be correct when no cache control exists.

### 3. Treat smaller models as bounded executors, not autonomous explorers

The lower-cost lane is appropriate for scoped localization, narrow edits,
targeted test generation, mechanical refactors, review against explicit rules,
and structured analysis. It receives synthesis-led context and a bounded next
action so it verifies an engine conclusion rather than traverses an unfamiliar
repository unaided.

This is not a claim of universal parity with frontier models. Ambiguous design,
novel algorithms, large cross-cutting changes, high-risk security work, and
debugging without observable checks remain escalation candidates.

### 4. Validate before escalating

The controller will prefer deterministic feedback over a model's confidence:

1. assemble `WorkPacket`;
2. obtain one or more bounded candidate actions or patches;
3. run allowlisted, sandboxed verification appropriate to the task;
4. feed a compact, redacted failure observation into one focused retry; and
5. escalate only when a policy trigger fires.

Initial escalation triggers are explicit: context insufficiency after one
focused expansion; invalid structured output; repeated tool/action loop;
multiple candidate failures with different causes; an impact set above the
configured scope; or a security, migration, public-API, or policy boundary.

The controller must never execute model- or repository-authored shell text.
Verification commands come from user-configured project policy and are executed
with argument arrays, timeouts, output bounds, and existing security controls.

### 5. Start routing with explainable rules and opt-in measurement

The first policy is a configuration-backed rule set over task characteristics,
repository risk, capability availability, configured price/limit information,
and observed verification state. It returns an attributable route decision,
including why it selected a lane or escalated.

CodeAtlas will not ship a trained router until it has an opt-in evaluation corpus
and outcome telemetry. Counterfactual or shadow evaluation must not duplicate a
user's external model call without explicit user consent.

Model capability is represented as data, not provider-name conditionals. API
and CLI adapters report only facts they can verify, such as whether a model id,
actual token usage, structured output, tool calls, prompt-cache controls, or
local execution are available. Unknown stays unknown.

### 6. Extend existing ownership; do not create a parallel agent system

- `packages/core` will own type-only contracts for work packets, capability
  facts, route decisions, validation requests/results, and policy ports.
- `packages/search` will remain the retrieval seam; an optional local hybrid or
  reranker scorer must implement the existing relevance-scoring direction rather
  than bypass the Context SDK.
- `packages/providers` and `packages/agents` will own provider/CLI-specific
  capability and cache mapping. No provider switch belongs in the controller.
- `packages/usage` will extend tri-state usage accounting with safe attribution
  metadata. It will never store prompts, secrets, or raw source content.
- `packages/sdk` will compose retrieval strategies, the work-packet renderer,
  rule policy, validator, and task controller. It remains the only consumer
  façade used by CLI, MCP, and the extension.
- `.codeatlas/tasks/` remains the durable task-state owner (ADR-025). It may
  gain bounded, schema-versioned semantic progress; it must not become a store
  for full vendor transcripts.

The existing session manager remains provider-immutable (ADR-007). A route or
escalation starts a new session on the same task ledger; it does not mutate a
running CLI process.

### 7. Gate implementation with evaluation

No optimization is considered successful merely because its prompt is shorter.
Each phase must compare against an explicit baseline on a versioned, local
evaluation corpus using:

- expected file/symbol recall and evidence attribution;
- verification pass rate and task success rate;
- input/output tokens, cache-hit tokens when reported, latency, retries, and
  escalation rate; and
- privacy/security invariants (no denied content or secrets in packets, traces,
  or durable state).

External public benchmarks may inform design, but production claims require a
reproducible CodeAtlas harness and task corpus. The removed benchmark subsystem
(ADR-023) must not be restored as an unscoped product surface.

## Alternatives

### Always use a frontier model

Rejected. It makes predictable scoped work unnecessarily expensive, does not
improve context selection, and provides no reasoned escalation boundary.

### Send a compressed whole repository to every model

Rejected. Generic prompt compression can discard code evidence or hide source
provenance. Correct retrieval, structural skeletons, and scoped deltas come
before optional compression.

### Learn a router before collecting CodeAtlas outcomes

Rejected. Public preference data does not capture this repository's task mix,
installed models, validation commands, risk policy, or user quality threshold.
An explainable policy plus measurement is the safer first stage.

### Rebuild a general autonomous agent/router first

Rejected. The standalone agent router remains planned. A bounded SDK controller
can serve CLI, MCP, editor, and future router consumers without duplicating
agent behavior or expanding the process-execution surface prematurely.

### Persist full CLI transcripts and model reasoning

Rejected. External CLIs do not reliably expose them; they can contain secrets
and provider-specific content. Bounded, redacted task state and captured output
when explicitly available are sufficient for continuity.

## Consequences

- CodeAtlas gains a coherent path from its existing context engine to verified,
  cost-aware model use without promising that all small models equal frontier
  models.
- The first implementation work is observability and evaluation, not a learned
  router or a new provider-specific feature.
- New public commands, MCP tools, storage fields, dependency additions, and
  default verification commands require separate implementation ADR amendments
  and review.
- This ADR creates **no runtime behavior or API**. All capabilities above remain
  **[PLANNED]** until code, tests, security review, and documentation land.

