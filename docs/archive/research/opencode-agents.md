# Opencode Research — Strengthening CodeAtlas for AI Agents

## Agent memory, MCP surface hardening, continuity, and eval loops

> **Date:** 2026-10-15 · **Worktree:** `moreresearch` · **Agent:** OpenCode · **Status:** Research findings & recommendation (proposal — no code changed)
>
> **Companion to [`opencode.md`](./opencode.md)**, which covers *prompt-level*
> strength (containers, chunking, ordering). This document covers the other
> half: making CodeAtlas a stronger **agent-facing system** — what an AI agent
> (Claude Code, Codex, Cursor, any MCP client) can *do* with CodeAtlas, what it
> can *remember* across sessions, and how we would *prove* improvements.
>
> **Short answer:** CodeAtlas's read surface is already ahead of most context
> servers, but an agent today **cannot record anything**, interactive sessions
> leave **no transcript** for handoff, the MCP surface misses cheap 2026
> hardening (tool annotations, prompts capability, default budgets), and there
> is **no eval loop** to measure any of it — which also blocks the ADR-026
> model router (it requires an opt-in evaluation corpus that does not exist).

---

## 1. What the research says

### 1.1 Agent memory has converged on a design

Every serious 2026 agent-memory system implements the same shape, in different
packaging:

| System | Key idea | Source |
|---|---|---|
| **projectmem** (Univ. of Utah, 2026) | Append-only JSONL log of typed events (issue/attempt/fix/decision/note); deterministic projection to `summary.md`; **Memory-as-Governance** — a `precheck(file)` returns prior failed attempts/open issues *at the point of edit* | <https://arxiv.org/html/2606.12329v2> |
| **agent-memory-engine** | Memory tree (constraints/architecture/decisions/incidents) with evidence links; candidate staging → confidence-gated promotion; protected types never auto-archived; post-task `reflect_and_write` | <https://github.com/uudam42/agent-memory-engine> |
| **interlock** | Authority order (owner instruction > verified observation > docs > repo state > agent report > inference); supersession semantics; `bootstrap`/`recall`/`observe`/`handoff` verbs; token budget enforced as a test failure, not best effort | <https://docs.rs/crate/interlock-memory/latest/source/docs/ARCHITECTURE.md> |
| **Hyphae** | Five verbs (`store`/`journal`/`recall`/`forget`/`status`); journal (model self-reflection) rendered as history, never as authority; proactive recall via host lifecycle hooks; fail-closed PII rejection | <https://hyphae.dev/docs/agent-memory-and-mcp/> |
| **Meshnote** | Readable markdown over MCP; a **promotion contract** (write only verified, scoped, evidence-linked facts); a cross-agent **handoff gate** (write with agent A, read with agent B, correct, re-read) | <https://meshnote.io/blog/memory-for-ai-coding-agents> |

The consensus principles:

1. **Append-only, typed events** — never mutable state the agent overwrites.
2. **Deterministic projection** — the summary the agent reads is a pure
   function of the log; always regenerable.
3. **Governed writes** — promotion is gated (candidate → verified), secrets
   redacted fail-closed, bounds on size and count.
4. **Scoped recall with provenance** — every recalled item carries source,
   scope, and validity; conflicts are surfaced, not silently mixed.
5. **Point-of-action consultation** — memory is injected when it matters
   (before an edit, in the package for the current task), not only when the
   agent remembers to query.

### 1.2 MCP tool surface hardening (2026 spec + reviews)

- **Tool annotations are now table stakes.** `readOnlyHint`,
  `destructiveHint`, `idempotentHint`, `title` drive host auto-approval
  behavior; unset means "host assumes worst case" → a prompt for every call.
  Anthropic's directory review criteria make them pass/fail, require read and
  write tools to be *separate*, and treat description text that directs agent
  behavior ("always call X first") as **prompt injection**.
  <https://github.com/anthropics/claude-plugins-official/blob/main/plugins/mcp-server-dev/skills/build-mcp-server/references/tool-design.md>
- **Descriptions are the contract.** Say what it does, what it returns, and
  what it *doesn't* do; disambiguate siblings ("if you have an email, use
  `find_user_by_email`").
- **Tool counts:** 1–15 is the sweet spot; 15–30 workable with an audit for
  near-duplicates; 30+ switch to search-and-execute (meta-tool facade).
  MCP-GRANITE (2026) found a **~4-tool consolidated interface beat fine-grained
  primitives by 16.4% and a monolithic tool by 33.6%** task completion —
  sometimes the right move is collapsing tools, not adding them.
  <https://arxiv.org/abs/2609.24161>
- **Progressive discovery** (MCP client best practices, 2026-07-28 spec): when
  definitions exceed ~1–5% of the window, expose `search_tools` + on-demand
  schema loading; also `tools/list` must be deterministic (stable order helps
  prompt caches) and carries `ttlMs`/`cacheScope` hints.
  <https://modelcontextprotocol.io/docs/2026-07-28/develop/clients/client-best-practices>
- **Errors are prompts.** "query requires ≥2 terms; refine and retry" lets the
  model self-correct; "no results" makes it guess or loop.
- **A `get_docs` meta-tool** (on-demand usage guide per tool family) beats
  stuffing workflow instructions into every description.
  <https://timariyeh.com/writing-a-good-mcp-server/>
- **Programmatic tool calling / code mode** (Cloudflare: 2,500 endpoints → 2
  tools, 99.9% context reduction) is the horizon pattern for large catalogs —
  not urgent at 18 tools, but the scaling story.

### 1.3 Eval loops for tool-using agents

- **MCP-Atlas** (NUS, 2026): 1,000 tasks over real MCP servers; **claims-based
  rubric** (atomic verifiable facts → partial credit, 78% human agreement)
  beats holistic LLM-as-judge; systematic **distractor tools** per task expose
  discovery failures — frontier models pass <50%.
  <https://arxiv.org/html/2602.00933v2>
- **MCP-Bench** (ICLR 2026): fuzzy instruction variants + rule-based checks
  (schema validity, dependency order) + rubric judge with prompt shuffling.
  <https://proceedings.iclr.cc/paper_files/paper/2026/file/9e4b14eb6f16fe7b5818a8d633a0606a-Paper-Conference.pdf>
- **MCPAgentBench**: Task Finish Score / Efficiency-Finish / token-efficiency
  metrics over golden tool sequences. <https://arxiv.org/html/2512.24565v5>
- **ETOM** (EACL 2026 findings): 5-level curriculum from single-tool to
  cross-server orchestration + out-of-scope robustness; "equal function sets"
  ground truth to handle functional overlap without judge bias.
  <https://aclanthology.org/2026.findings-eacl.75.pdf>
- Common finding: **primary failures are tool selection and task
  understanding**, not model reasoning — i.e., exactly the surface CodeAtlas
  curates.

### 1.4 Continuity

Anthropic's context-engineering guidance: compaction at 70–80% window,
structured note-taking that survives resets, sub-agent isolation returning
1–2k token summaries. The cross-agent handoff gate (Meshnote §1.1) is the
minimal test of continuity: *write with one provider, read with another,
correct, re-read* — CodeAtlas's task ledger is a prototype of exactly this,
minus transcripts and memory.

---

## 2. CodeAtlas reality — code-verified gap table

Verified against this tree (`ctx/moreresearch` @ `8d46ddd`; main @ `1d1d447`).

| # | Gap | Evidence |
|---|---|---|
| 1 | **No agent write-back.** An MCP-only agent cannot record findings, decisions, or failed attempts. `list_tasks`/`get_task`/`continue_task` are read-only; no handler saves a ledger; ledgers are written only by the CLI launch/handoff path | `packages/mcp/src/handlers.ts:944,961,1002`; `packages/sdk/src/context-integration/index.ts:379` |
| 2 | **No durable memory beyond the task ledger.** Session state is in-memory maps pruned after N terminal sessions; the only persisted run-state is `.codeatlas/tasks/*.json` (32 KiB output, 50-session cap) | `packages/agents/src/session-manager.ts:74-78,446`; `task-ledger.ts:24-36` |
| 3 | **No point-of-action governance.** Nothing surfaces prior failed attempts / open issues when an agent reads a file — the projectmem "precheck" design point | absent from `read_file_range` handler (`handlers.ts:~750-790`) |
| 4 | **No tool annotations on the main server** (`readOnlyHint` etc.) — hosts assume worst case and prompt every call. The ChatGPT plugin adapter already declares them | `packages/mcp/src/server.ts:110-119` (title/description/schemas only) vs `apps/chatgpt-plugin/src/server.ts:82` |
| 5 | **Descriptions carry behavioral instructions** ("DISCIPLINE: call 1-2 times…", "FIRST CHOICE") — works today, but conflicts with the emerging directory-review rule treating behavior-directing description text as injection; the field moves this into prompts/`get_docs` | `packages/mcp/src/tools.ts:229-230,459-462` |
| 6 | **MCP prompts capability: planned, never built** — no `registerPrompt` anywhere; "how to use these tools" lives only in free-text descriptions | `docs/FEATURE_STATUS.md:45` ("prompts remain planned"); grep: zero `registerPrompt` in `packages/mcp/` |
| 7 | **Resource templates non-enumerable** — agents cannot discover symbol/skill/task URIs via `resources/list` | `packages/mcp/src/resources.ts:65,76,88` (`{ list: undefined }`) |
| 8 | **Tool-call budget defaults to unlimited** — engages only when the operator sets env vars; no default protection against read-flush loops | `packages/mcp/src/budget.ts:143-159` (env keys, unset ⇒ undefined ⇒ unlimited) |
| 9 | **No interactive transcript** — `stdio:"inherit"` sessions contribute only task + files-touched to handoff; the honest line tells the next model not to invent prior replies | `packages/sdk/src/context-integration/handoff.ts:77-82`; ADR-025 |
| 10 | **Tool-result "compression" is truncation** — 50K-char cap with drop-then-halve; no summarization of prior results | `packages/mcp/src/handlers.ts:108-137` |
| 11 | **No agent eval loop** — `atlas evaluate` is an artifact report, not tool-selection/agent-quality eval; ADR-026's learned router is gated on a nonexistent "opt-in evaluation corpus" | `apps/cli/src/commands/evaluate.ts:23-119`; `docs/decisions/ADR-026:138` |
| 12 | **No skill recommendation on launch/attach/handoff/ask** — `recommendSkillsForTask` runs only in `find_relevant_context` and `atlas context build` | `packages/sdk/src/skills/index.ts:187-213`; callers: `handlers.ts:168`, `apps/cli/src/commands/context.ts:302` |

**The shape of the hole:** CodeAtlas is an excellent *read* engine with no
*write* path, no *memory*, and no *measurement*. Agents can ask "what is
here?" but cannot answer "what did we learn, what failed, and did the last
change work?"

---

## 3. Recommendations (phased)

### Tier A — Agent memory & write-back *(biggest capability gap)*

1. **`.codeatlas/memory/` — append-only typed event log.** Events:
   `decision | finding | failed-attempt | note`, each with scope, provenance,
   timestamp, and optional file/symbol refs. Plain JSONL (grep-able,
   diff-able, git-native) — no vector DB. Reuse the task-ledger's untrusted-
   load validation, size bounds, and deny-filter patterns
   (`task-ledger.ts:357-516`, `deny.ts`) rather than a second framework.
2. **Deterministic summary projection** — regenerate a compact
   `memory-summary.md` (or inject into packages) as a pure function of the
   log; newest-first, open items surface first, bounded.
3. **Governed MCP write tools** — `record_memory` (typed, deny-filtered,
   size-bounded, opt-in via a `--allow-write`-equivalent startup flag so the
   default surface stays read-only), plus `recall_memory`. Writes go through
   the same secret deny-filter as reads.
4. **Governance precheck** — `read_file_range` (and package assembly) returns
   a `memoryWarnings` array: prior failed attempts, open issues, and stale
   notes for the target files. Memory-as-Governance at the point of action.
5. **Cross-agent handoff gate as a test** — record a decision with the
   `claude` adapter, recall it with `codex`, correct it, re-read it; assert
   supersession (old wording must not win).

### Tier B — MCP surface hardening *(cheap, high leverage)*

6. **Tool annotations everywhere** — `readOnlyHint: true`,
   `idempotentHint: true`, `openWorldHint: false` on all 14 canonical tools +
   aliases (mirror the ChatGPT plugin). Immediate host auto-approval win.
7. **Description-as-contract cleanup** — each description: what it does, what
   it returns, what it *doesn't* do, and sibling disambiguation. Move the
   behavioral discipline text ("call 1-2 times", stop-conditions) into the
   new MCP prompts / playbook (Tier B.8 + opencode.md Tier 1).
8. **MCP prompts capability** (already planned — `FEATURE_STATUS.md:45`) —
   ship 3–4 prompts: `explore-task` (find → inspect → range-read discipline),
   `continue-task`, `export-and-continue`, `review-change`. This is where
   "teach the agent what to do" belongs protocol-natively.
9. **Enumerability** — implement `resources/templates/list` (or `list`
   callbacks) for `symbol`/`skills`/`task` templates.
10. **Default tool-call budget** — a sane built-in default (e.g. 200 calls /
    50 range-reads per session), env-overridable both ways; keep the
    read-flush protection on by default.
11. **Deterministic tool ordering + cache-friendly registration** — sort the
    advertised list; align with the 2026-07-28 spec guidance.
12. **Keep the catalog lean** — 18 names is healthy; before crossing ~30,
    collapse near-duplicates (MCP-GRANITE evidence) and/or add a
    `search_tools` facade via the existing `runTool` sub-surface seam
    (`server.ts:146-154`).

### Tier C — Continuity

13. **Interactive transcript capture** — tee `stdio:"inherit"` session output
    to a bounded file so `renderHandoffSection` can include real prior output
    instead of the "transcript not available" line; respects existing 2000-token
    handoff cap and deny-filter.
14. **Task-output compaction** — before the 32 KiB ledger cap truncates,
    summarize deterministically (head + decisions + tail), preserving the
    honest "compacted" marker.
15. **Skill recommendation everywhere** — call `recommendSkillsForTask` in
    `launch`/`attach`/`handoff`/`ask` (it already exists and is used in two
    places).

### Tier D — Eval loop *(unblocks ADR-026)*

16. **Golden tool-selection dataset** — 30–50 tasks over a fixture repo, each
    with an expected tool sequence (claims-based, MCP-Atlas style), plus
    distractor-insensitive scoring (tool F1 + argument accuracy + token
    efficiency). Runs offline against the in-process `ContextToolSource`
    (`tool-bridge.ts`) — no network, no credentials.
17. **Prompt/package snapshot tests** (from opencode.md Tier 4) feed the same
    corpus: rendered package per task is a frozen golden.
18. **Report in `atlas doctor`** — tool-selection score + token-efficiency
    trend, so regressions surface without a separate benchmark product
    (keeps the AGENTS.md "no benchmark package this phase" boundary: this is
    a test suite + doctor check, not a benchmark service).

### Explicitly not recommended

- **No second memory system** — extend the ledger's patterns (validation,
  bounds, deny-filter, plain-text persistence); do not add a parallel store
  framework.
- **No vector DB / embeddings** by default — lexical + structured recall
  first; the `RelevanceScorer` seam already exists if evidence ever demands it.
- **No network memory sync** — local-first, like everything under
  `.codeatlas/`.
- **No mid-session prompt channel** — ADR-025 rejected it for good reasons;
  keep sessions provider-immutable.

---

## 4. Relationship to existing docs

- **Companion to [`opencode.md`](./opencode.md)** (prompt-level strength:
  containers, chunking, ordering). Together they cover "context in" and
  "agent behavior around the context."
- **Extends ADR-025** (task ledger) rather than replacing it — Tier A is the
  generalization from task-scoped output to project-scoped memory.
- **Unblocks ADR-026** (`TOKEN_EFFICIENT_MODEL_STRATEGY.md`): Tier D is the
  "opt-in evaluation corpus" the ADR requires before any learned router.
- **MCP prompts** already planned in `FEATURE_STATUS.md:45` / ADR-004
  follow-ups — Tier B.8 delivers the planned item.
- No schema change, no new package, no dependency-direction change; a new ADR
  is needed only when Tier A's write surface lands (memory format + governed
  write flag).

---

## 6. Sources

| Topic | Source |
|---|---|
| Memory-as-Governance, event-sourced agent memory | projectmem — arxiv.org/html/2606.12329v2 |
| Candidate staging / promotion / protected types | agent-memory-engine — github.com/uudam42/agent-memory-engine |
| Authority order, supersession, bootstrap/recall | interlock — docs.rs/crate/interlock-memory |
| Five-verb memory, journal separation, proactive hooks | Hyphae — hyphae.dev/docs/agent-memory-and-mcp/ |
| Promotion contract, cross-agent handoff gate | Meshnote — meshnote.io/blog/memory-for-ai-coding-agents |
| Tool annotations, description-as-contract, review criteria | Anthropic build-mcp-server plugin — github.com/anthropics/claude-plugins-official |
| Progressive discovery, cache hints, programmatic calling | MCP client best practices — modelcontextprotocol.io/docs/2026-07-28 |
| Tool design tradeoffs, lazy schemas, agent-as-tool | AWS — aws.amazon.com/blogs/machine-learning/mcp-tool-design-practical-approaches-and-tradeoffs/ |
| `get_docs` meta-tool, naming, error-as-prompt | timariyeh.com/writing-a-good-mcp-server/ |
| Granularity: ~4 consolidated tools optimal | MCP-GRANITE — arxiv.org/abs/2609.24161 |
| Claims-based rubric, distractors, discovery failures | MCP-Atlas — arxiv.org/html/2602.00933v2 |
| Fuzzy tasks + rule checks + shuffled rubric judge | MCP-Bench — ICLR 2026 proceedings |
| TFS / efficiency / token metrics | MCPAgentBench — arxiv.org/html/2512.24565v5 |
| 5-level orchestration curriculum, equal-function sets | ETOM — aclanthology.org/2026.findings-eacl.75.pdf |
| Compaction / note-taking / sub-agents | Anthropic — anthropic.com/engineering/effective-context-engineering-for-ai-agents |
