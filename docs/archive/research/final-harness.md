# CodeAtlas Agent Harness v1

**Final product plan**  
**Date:** 2026-10-16  
**Status:** Proposed — implementation review required  
**Source documents:** `freebuffharness.md`, `opencode-agents.md`

## 1. Executive decision

CodeAtlas should remain an orchestrator over external AI CLIs and MCP clients. It
should not become another model-and-tool loop.

The next harness investment should strengthen the control plane around the
existing Context SDK, task ledger, MCP server, session manager, and verification
path:

1. establish a local evaluation loop;
2. harden the existing read-only MCP surface;
3. improve task continuity and handoff;
4. add governed, opt-in agent write-back only after the read path is measured.

This order matters. Memory writes and new lifecycle hooks create durable state
and security obligations. They should not be the first response to a problem
that is currently measured only through research and code inspection.

## 2. Product goal

For any supported external agent, CodeAtlas should provide a reliable harness
that makes the agent:

- start with relevant, bounded context;
- understand the task scope and verification requirements;
- use predictable, well-described tools;
- preserve decisions, failures, and verification results across handoffs;
- receive warnings about known risks before editing;
- produce evidence that the task was completed safely.

CodeAtlas owns context, policy, coordination, handoff, and verification. The
external CLI owns model reasoning, its own tool loop, and provider-specific
interaction.

## 3. Boundary: what CodeAtlas is and is not

### CodeAtlas owns

- deterministic context assembly and deny filtering;
- task classification, planning, synthesis, and sufficiency signals;
- agent launch, attach, role coordination, and task-ledger handoff;
- MCP read tools, resources, prompts, and their contracts;
- policy gates before launch and after completion;
- verification commands and result handoff;
- bounded continuity artifacts;
- usage and cost accounting;
- local evaluation and release evidence.

### External agents own

- model inference and reasoning;
- provider-native tool execution;
- provider-native conversation state;
- model-specific prompting behavior;
- provider-specific refusal and response semantics.

### Do not build in this initiative

- a second agent loop;
- a vector database or network memory service;
- automatic whole-repository uploads;
- an unbounded transcript archive;
- automatic parallel subagents for ordinary coding;
- a new package that duplicates the task ledger or Context SDK;
- a write-enabled MCP server by default.

## 4. Design principles

1. **Read-only by default.** A connected agent may inspect context without
   receiving permission to mutate project state.
2. **Local-first.** Durable artifacts remain under `.codeatlas/`; no network
   sync is required.
3. **Append-only evidence.** New findings and decisions are recorded as events;
   existing facts are superseded explicitly rather than silently overwritten.
4. **Deterministic projection.** Human- and agent-readable summaries are derived
   from validated source records.
5. **Fail closed.** Secrets, denied paths, malformed records, and over-budget
   requests are rejected or omitted with an honest diagnostic.
6. **One path per capability.** Reuse the existing SDK, task ledger, and
   Context → Agent integration instead of creating parallel implementations.
7. **Measure before defaulting on.** Every behavior change must have a local
   fixture, regression test, and rollback path.
8. **Provider neutrality.** Provider-specific behavior stays in adapters or
   explicit profiles, never scattered through the SDK.

## 5. Target harness flow

```text
Task
  |
  v
Context SDK
  - relevant evidence
  - constraints and deny filter
  - impact and freshness
  |
  v
Preflight policy
  - task scope
  - budget
  - required verification
  - optional impact warning
  |
  v
External agent
  - Claude / Codex / Gemini / OpenCode / other supported CLI
  - provider-owned model/tool loop
  |
  v
Postflight
  - changed files and diff impact
  - verification commands
  - usage/cost result
  - task-ledger handoff
  |
  v
Bounded continuity
  - decisions
  - failed attempts
  - unresolved questions
  - verification outcome
```

MCP clients use the same Context SDK and policy contracts. They must not gain a
separate database or context assembly path.

## 6. Priorities

### P0 — Evaluation foundation

Create a small offline fixture corpus before making harness behavior default-on.

Each task should have:

- a natural-language request;
- expected tools and acceptable alternatives;
- expected files or symbols;
- required verification;
- claims that can be checked deterministically;
- distractor tools or irrelevant files where useful.

Measure:

- task completion;
- tool-selection accuracy;
- argument accuracy;
- target-file and target-symbol recall;
- evidence attribution;
- verification pass rate;
- token and latency efficiency;
- retries, escalations, and scope violations;
- denied-content leakage.

The first corpus can be 30–50 tasks over a fixture repository. It is a test
suite and report, not a new benchmark product.

**Exit criteria:** it runs offline, without credentials or network access, and
produces a repeatable baseline report.

### P1 — MCP surface hardening

Harden the existing read surface before adding new write capabilities.

Required changes:

- add accurate tool annotations to canonical tools and aliases;
- make descriptions contracts: purpose, return shape, limits, and non-behavior;
- remove workflow-directing text from tool descriptions;
- move workflow guidance into protocol prompts or a compact playbook;
- make resource templates enumerable;
- provide bounded default tool-call and range-read budgets;
- sort advertised tools and resources deterministically;
- return actionable errors that state how to correct the request;
- keep the catalog lean and audit near-duplicates before adding tools.

The default MCP server remains read-only.

**Exit criteria:** schema, annotation, ordering, error, and budget tests pass;
existing clients remain compatible; no description asks an agent to bypass policy
or always call another tool.

### P1 — Preflight and postflight controls

Add small typed control points around the existing orchestration flow.

Preflight should be able to report:

- task scope and permitted paths;
- context freshness and exclusions;
- budget limits;
- required verification;
- optional graph-based impact of seed files.

Postflight should:

- run the existing approved verification path;
- capture changed files and relevant impact;
- attach failures and unresolved items to the next handoff;
- record usage using the existing tri-state model.

These controls must remain deterministic and read-only unless an explicit
operation already has approval.

**Exit criteria:** controls are exercised by launch, attach, and handoff tests;
failure output is actionable and cannot be mistaken for success.

### P2 — Continuity and handoff

Improve continuity without attempting to preserve every transcript token.

Persist a bounded task record containing:

- task objective and scope;
- decisions and their evidence;
- failed attempts and why they failed;
- unresolved questions;
- files changed or inspected;
- verification commands and results;
- a compact handoff summary;
- a clear compaction marker when information was reduced.

For interactive sessions, capture only bounded, deny-filtered output needed for
handoff. Preserve decisions and verification outcomes before conversational
detail.

The cross-agent handoff test is mandatory:

1. provider A records a decision;
2. provider B recalls it;
3. provider B corrects or supersedes it;
4. a later read returns the current decision and exposes the supersession.

**Exit criteria:** a resumed task recovers important state without loading the
full previous transcript; stale facts do not silently override newer evidence.

### P3 — Governed memory write-back

Only after P0–P2 are stable, add an opt-in project memory surface.

Storage:

- append-only, typed JSONL under `.codeatlas/memory/`;
- bounded record count and record size;
- scope, timestamp, provenance, and optional file/symbol references;
- reuse task-ledger validation and deny-filter patterns;
- no vector database, network sync, or opaque embeddings by default.

Initial event types:

- `decision`;
- `finding`;
- `failed-attempt`;
- `note`.

Write behavior:

- disabled by default;
- explicitly enabled at server startup;
- validated and deny-filtered before persistence;
- rejected on secret, malformed, oversized, or ambiguous input;
- never allowed to silently rewrite existing events.

Read behavior:

- scoped by task, path, symbol, or project;
- returns provenance and validity;
- surfaces conflicts and supersession;
- bounded by a token budget;
- never presents an unverified note as an instruction.

A deterministic projection may produce a compact memory summary, but the event
log remains the source of truth.

**Exit criteria:** write authorization, hostile-input, bounds, projection,
supersession, and cross-agent handoff tests pass.

### P3 — Point-of-action warnings

After governed memory is available, expose bounded warnings when an agent is
about to act on a relevant file or symbol:

- prior failed attempts;
- open issues;
- stale decisions;
- unresolved verification failures.

Warnings are advisory evidence, not commands. They must identify their source
and never block an edit solely because an old note exists.

**Exit criteria:** warnings are scoped, attributable, deny-filtered, and absent
when no relevant record exists.

## 7. Proposed MCP contract

Keep read and write capabilities separate.

### Read surface

Existing context, search, symbol, task, skill, resource, and explain
capabilities remain the foundation. Each tool must state:

- what it does;
- what it returns;
- required and optional inputs;
- limits and budget behavior;
- what it does not do;
- whether it changes state.

### Optional write surface

The first write capability should be narrowly named and typed, for example:

- `record_memory`: append one validated event;
- `recall_memory`: read bounded, scoped events;
- `get_memory_summary`: read a deterministic projection.

These names are a design proposal, not permission to implement them without an
ADR and explicit opt-in configuration.

## 8. Diff-aware context: a later, focused capability

The harness should eventually make changed-code impact easier to inspect, but
this is not a prerequisite for MCP hardening.

Proposed sequence:

1. map changed hunks to indexed symbols where line ranges are available;
2. add callers and dependents outside the diff;
3. distinguish cosmetic changes from structural changes where parser data is
   reliable;
4. expose a diff-scoped context build around changed symbols and impact.

Start with a deterministic fixture assertion: for a fixed commit, the expected
symbols and callers appear. Do not claim semantic diff quality until that test
exists.

All git inspection must use validated argument-array process execution and
respect repository-derived path safety.

## 9. Ownership and delegation

| Workstream | Owns | First deliverable |
|---|---|---|
| Evaluation | Offline corpus, claims, scoring, regression reports | Baseline task suite |
| MCP | Annotations, descriptions, prompts, enumeration, budgets | Read-surface hardening PR |
| Orchestration | Preflight/postflight policy points and verification handoff | Launch lifecycle contract |
| Continuity | Bounded transcript, task handoff, compaction | Cross-provider handoff test |
| Security | Write authorization, deny filtering, bounds, hostile fixtures | Threat model and security tests |
| Memory | Event schema, projection, recall, supersession | ADR-backed opt-in prototype |
| Diff intelligence | Hunk-to-symbol and impact context | Deterministic diff fixture |

Workstreams may use existing ports and packages, but must not introduce
parallel storage, direct database access, or provider-specific branches in
shared layers.

## 10. Risks and controls

| Risk | Control | Ship response |
|---|---|---|
| Memory stores poisoned or secret content | deny filter, size bounds, provenance, explicit opt-in | block write feature |
| Agent writes without user intent | disabled-by-default server flag and separate tools | keep server read-only |
| Transcript capture leaks sensitive output | bounded capture plus deny filter and tests | disable capture |
| More tools worsen discovery | keep catalog lean; measure tool selection | do not add tool |
| Tool descriptions become prompt injection | contract-only descriptions; prompts hold workflow | block MCP release |
| Compaction loses the key decision | decision-first projection and handoff fixtures | retain full bounded record |
| Verification output is truncated | preserve failures and required commands explicitly | block “success” status |
| Vendor findings do not transfer | CodeAtlas-local corpus and confidence reporting | no default-on change |
| New control points duplicate architecture | one SDK/session path and architecture review | reject parallel path |
| Diff heuristics overclaim | deterministic fixture and fallback to existing behavior | keep feature experimental |

## 11. Architecture and documentation requirements

Before implementing P3 memory write-back, create an ADR covering:

- event schema and versioning;
- authority and supersession rules;
- write authorization;
- deny filtering and privacy;
- retention and size bounds;
- projection format;
- migration and recovery behavior;
- MCP exposure and failure semantics.

Before changing a port or adding provider profiles, update the relevant
architecture documentation and dependency matrix.

Do not mark memory, prompts, transcripts, or diff intelligence implemented until
the code, tests, feature status, and user-facing docs agree.

## 12. Release gates

### Harness release gate

- existing test suite passes;
- MCP schema, annotations, descriptions, resources, and ordering are tested;
- default budgets prevent unbounded read loops;
- preflight and postflight behavior is deterministic;
- handoff preserves decisions, failures, and verification results;
- denied content is absent from packets, memory, transcripts, and traces;
- no write surface is enabled by default;
- offline evaluation baseline is reproducible;
- no material regression in task completion, tool selection, token efficiency,
  latency, or scope safety;
- rollback to the previous read-only behavior is verified.

### Current decision

**Implement P0 and P1 first.** They are bounded, measurable, and low-risk.

**Implement P2 after P0/P1 pass.** Continuity is valuable, but transcript capture
and compaction must be bounded and privacy-tested.

**Defer P3 memory write-back and P3 point-of-action warnings.** They require an
ADR, explicit authorization, and a stronger security contract.

**Do not build a native agent loop.** The orchestrator boundary is a deliberate
architecture decision and remains the correct long-term constraint for this
phase.

## 13. Research basis

The source documents cite research on event-sourced agent memory, governed
promotion, MCP tool design, tool-selection evaluation, continuity, and
compaction. The implementation decision above adopts the common principles but
treats vendor feature lists and benchmark percentages as hypotheses until
verified against CodeAtlas.

Relevant sources from the source documents include:

- [MCP client best practices](https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices)
- [MCP-Atlas](https://arxiv.org/html/2602.00933v2)
- [MCP-Bench](https://proceedings.iclr.cc/paper_files/paper/2026/file/9e4b14eb6f16fe7b5818a8d633a0606a-Paper-Conference.pdf)
- [MCPAgentBench](https://arxiv.org/html/2512.24565v5)
- [ETOM](https://aclanthology.org/2026.findings-eacl.75.pdf)
- [Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic MCP tool design guidance](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/mcp-server-dev/skills/build-mcp-server/references/tool-design.md)
- [Projectmem](https://arxiv.org/html/2606.12329v2)
- [Aider repository map](https://aider.chat/docs/repomap.html)

## Final recommendation

Treat the harness as a control-plane product, not another agent runtime:

1. measure the current system;
2. harden the read-only MCP contract;
3. add deterministic lifecycle checks and bounded continuity;
4. add memory write-back only with explicit authorization and an ADR;
5. keep all default behavior reversible and local-first.

The release bar is evidence-backed reliability and safety, not the number of
features added.

