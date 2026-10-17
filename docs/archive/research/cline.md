# Cline Research — Strengthening CodeAtlas for AI Models
## Deep research on context engineering / "prompt middleware" for long-context LLMs

> **Date:** 2026-10-14 · **Worktree:** `doresearch` · **Status:** Research findings (no code changes yet)
>
> **The core question:** People assume "big context window = better", but in practice
> AI models forget, get confused, or lose the task when given long, flat input dumps.
> Can CodeAtlas add a "prompt middleware" layer — container-style structured prompts,
> context broken into small chunks, with explicit instructions telling the AI what to
> do with each piece — to make AI models perform measurably better?

**Short answer: YES — and the research strongly supports it.** Long context degrades
model performance ("context rot", "lost in the middle"), so the winning strategy is
*curated, structured, progressively disclosed* context — not more tokens. CodeAtlas
already implements a surprising amount of this; this document maps what exists,
what the research says, and the concrete gaps worth building.

---

## 1. Why "long input = better" is a myth (the research)

### 1.1 Context Rot (Chroma research, July 2025)
Source: https://research.trychroma.com/context-rot

Tested **18 LLMs** (GPT-4.1, Claude 4, Gemini 2.5, Qwen3) — key findings:

- Model performance **degrades as input length grows**, even on deliberately simple
  tasks. Performance is **not uniform** across the context window.
- **Needle–question similarity matters:** retrieval is easy when needle and question
  share wording; with *semantic* (non-literal) matches, accuracy drops sharply.
  → Implication: CodeAtlas must serve context whose wording connects to the task,
  not just lexically matching hits.
- **Distractors hurt a lot:** irrelevant context near the needle suppresses correct
  recall. Even a haystack with *structural* similarity (a table of similar rows)
  degrades accuracy. → Never pad context "to fill space"; every item must justify itself.
- **Haystack structure matters:** similar-looking repeated entries cause confusion
  (models conflate nearby entities). → In prompts, distinguish similar files/symbols
  explicitly (path + role annotation), don't just dump parallel code blocks.
- Non-uniform degradation means **position and density matter**, not just length.

### 1.2 Lost in the Middle (Liu et al., TACL 2023)
Source: https://arxiv.org/abs/2307.03172

- Performance is **U-shaped**: highest when relevant info is at the **beginning or
  end** of context, significantly worse when it's buried in the **middle** — even
  for long-context-native models.
- **Design implication:** put the task + instructions first, most critical context
  last (recency), avoid the middle as a graveyard for important material. Repeat or
  re-anchor critical items.

### 1.3 Failure modes of too much context (Drew Breunig, via LangChain)
Source: https://blog.langchain.com/context-engineering-for-agents/

- **Context Poisoning** — a hallucination lands in context and gets reused as fact.
- **Context Distraction** — context overwhelms what the model learned in training.
- **Context Confusion** — superfluous context changes the response.
- **Context Clash** — parts of the context contradict each other.

### 1.4 Anthropic: context is a *finite* resource ("attention budget")
Source: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

Core principles:

- **Attention budget:** context must be treated as a scarce resource with
  diminishing marginal returns; find the *smallest* set of high-signal tokens.
- **Just-in-time retrieval:** don't pre-load everything; let the agent pull what it
  needs when it needs it (tools + narrow context beats a giant prompt).
- **Structure instructions explicitly:** hierarchical (high-level structure before
  detail), linear in the model's execution order, and **explicit** ("give only the
  information needed, exactly when needed").
- **The sandwich:** context follows `Instructions → Data → Reminders`; code samples
  must sit **close to the task** they inform, never exiled to a distant system prompt.
- **Compaction:** summarize old turns when nearing limits (keep decisions/outcomes,
  drop chit-chat). Claude Code / Codex both ship this.
- **Structured note-taking:** agent writes durable memory (scratchpads, task state)
  to *its own* file, then summarizes — dramatically improves multi-session coherence.
- **Sub-agents / parallel foraging:** run separate contexts for exploration vs.
  final answer; only the distilled answer enters the main context.
- **Fine-tuned context:** for narrow repeated tasks, distill the successful context
  into a *fine-tune* — the most token-efficient context is none at all (long-term idea).
- **Token-efficient tools:** tool descriptions consume the attention budget every
  call — keep schemas lean, results compact; sandbox execution isolates bulky data.
- **Write your context down** (files > memory): the best agents lean on the
  environment (files, notes, screenshots) instead of stuffing the window.

### 1.5 LangChain: the four operations on context
Source: https://blog.langchain.com/context-engineering-for-agents/

Every context-engineering system does one or more of: **Write** (persist context
outside the window), **Select** (retrieve the right bits), **Compress** (summarize /
truncate to signal), **Isolate** (keep things out until needed — sub-agents,
sandboxed state, staged tool output).

Failure-mode catalog (Drew Breunig, cited in the same post): **Context Poisoning**
(a hallucination lands in context and is reused as fact), **Context Distraction**
(context overwhelms what the model learned in training), **Context Confusion**
(superfluous context changes the response), **Context Clash** (context parts
contradict each other).

### 1.6 Progressive Disclosure (arXiv 2607.17598, July 2026)
Source: https://arxiv.org/html/2607.17598v1

First controlled study of the Agent-Skills "progressive disclosure" pattern:

- Giving an agent a **navigation outline (index) + on-demand deepening** beats both
  "load everything" and classical RAG **when tasks span many documents/files**.
- **One level of hierarchy is enough** — a second, deeper routing level *never
  helped* and sometimes broke accuracy outright. Keep index → content at ONE level.
- Raw whole-document navigation collapses at corpus scale; one-level disclosure
  degrades much more slowly and pulls ahead.
- The gain is harness-dependent: largest when navigation is weak — i.e. it helps
  **small/weak models** most, which is exactly CodeAtlas's "small-model
  intelligence" thesis (ADR-014/015/016/017).
- "Depth does not pay, and can hurt" — resist building outline-of-outline trees.

### 1.7 KV-cache-safe prompt structure (NVIDIA, 2025)
Source: https://developer.nvidia.com/blog/structuring-applications-to-secure-the-kv-cache/

- Real application prompts are assembled as
  `system prompt + user prompt + volatile data (date, fetched context)`.
- **Prefix caching** only pays off when the shared prefix is byte-stable: put
  **stable content first** (system instructions, tool definitions), **volatile
  content last** (dates, retrieved context, user input). Re-ordering or injecting
  volatile tokens early invalidates the whole cache — cost + latency on every call.
- A session identifier early in the prompt partitions caches (also a side-channel
  mitigation).
- → For CodeAtlas: the rendered package must have a **stable prefix → volatile
  context** ordering across turns, never re-ordered randomly per call.

### 1.8 OpenAI prompt-engineering guidance (2026)
Source: https://platform.openai.com/docs/guides/prompt-engineering

- Use **XML-style section delimiters** and strict separation of instructions vs. data.
- For agentic runs: **plan first**, decompose into subtasks, reflect after each tool
  call, use a TODO/progress tool, "keep going until completely resolved".
- Give concrete **tool-use examples** in the prompt for reliability.
- For large codebases: inject *separate named instruction categories* (Principles /
  Structure / Agent-Instructions …) — i.e. the "container" idea: **named buckets of
  guidance, each with a stated purpose**.

### 1.9 Ecosystem convergence: Agent Skills
Claude Code Skills = folder + `SKILL.md` loaded on demand; Simon Willison called
them "maybe a bigger deal than MCP". The ecosystem has converged on **small,
discoverable, on-demand instruction units** instead of one mega-prompt. CodeAtlas's
13 built-in Skills already implement exactly this pattern.

---

## 2. Codebase scan — what CodeAtlas already has (verified in code)

Scanned `packages/sdk/src/context-integration/` (the Context → Agent layer,
ADR-008) plus `packages/context/` and docs. **Important correction:** the
codebase's `container.ts` is a *dependency-injection* container (services) — the
prompt **"container" concept does not exist yet** as a dedicated abstraction.

| Module (`packages/sdk/src/context-integration/`) | What it does | Research concept |
|---|---|---|
| `assemble.ts` | Builds the budgeted, deny-filtered, tiered `ContextPackage` | Select |
| `budget.ts` | `DEFAULT_CONTEXT_BUDGET` = 20 items / 2k tok per item / **12k total**; per-item truncation, tail-drop, essentials protected | Attention budget |
| `hierarchy.ts` | Tier order (`critical → important → unranked → supporting → optional`), **symbol outlines**, line-range slicing | Progressive disclosure / outline-index |
| `digest.ts` | Deterministic repo architecture digest, content-hash cached | Compress (deterministic!) |
| `sufficiency.ts` | 4 deterministic predicates → "enough context?" + `refine` hints; never silently answer from nothing | Retrieval loop / validation |
| `planner.ts` + `plan-guard.ts` | Deterministic `TaskPlan` (≤8 steps, impact set, verification) + plan annotation checks | Plan-first decomposition |
| `synthesis.ts` | ADR-017: engine pre-reasons **for weak models** → conclusion + evidence chain to *verify* | Small-model scaffolding |
| `briefing.ts` | AI briefing from the package (cached, usage-tracked) | Compress |
| `critic.ts` (+ `@prof-bilal/atlas-verifier`) | Checklist review of an answer against cited paths/claims | Anti context-poisoning |
| `task-ledger.ts` | Persistent `.codeatlas/tasks/<id>.json` across sessions (progress, sessions, files touched) | Structured note-taking |
| `handoff.ts` | Bounded handoff prompt for session-to-session continuation | Compaction / handoff |
| `staleness.ts` | Detects index drift and warns the model | Context quality guard |
| `deny.ts` | Security deny-filter on paths | Isolate (privacy) |
| `instructions.ts` | Injects `AGENTS.md`/`CLAUDE.md`/README (capped, allowlisted) | Stable instruction prefix |
| `slice.ts` / `entities.ts` / `classifier.ts` | Scoped slices, entity extraction, task classification | Select |
| `render.ts` | Final output: `# Task` → ⚠️ staleness/truncation → engine analysis → `## item` blocks with `> tier · lines` | **The current "flat" prompt** |
| `packages/context/context-builder.service.ts` | Deterministic rank + task-category rerank (ADR-001) | Select |

Also verified: **13 built-in Skills**, `atlas context launch/attach` with
`--skill` injection, `createContextIntegration()`, staleness warnings, and the
explicit "context truncated — call search/read tools" fallback note.

**Bottom line:** CodeAtlas already implements ~70% of the published
context-engineering playbook — *deterministically*, which is ahead of most of the
field. The missing pieces are chiefly the **format/structure layer** (how the final
prompt is chunked and instructed), **mid-session management**, and **evaluation**.

---

## 3. Gap analysis — what to add (mapped to the research)

| # | Gap | Research basis | Priority |
|---|---|---|---|
| G1 | **Prompt container format**: `render.ts` emits flat `# Task` + `## item` markdown with no per-chunk purpose instructions ("what to do with this") | Anthropic sandwich/hierarchy, OpenAI XML sections — *the user's exact idea* | **HIGH** |
| G2 | **Instruction placement/ordering**: no U-shaped-attention rules (critical info at ends), no stable-prefix ordering for KV/prompt cache | Lost in the Middle; NVIDIA KV cache | **HIGH** |
| G3 | **One-level progressive disclosure in the prompt**: outlines exist (`hierarchy.ts`) but the rendered package lacks an explicit "index now, content on demand via `read_file_range`" contract | arXiv 2607.17598 (**one level only!**) | **HIGH** |
| G4 | **Distractor control**: budget drops by rank/tail only; no density/similarity check (parallel near-duplicate blocks confuse models) | Chroma context rot | MED |
| G5 | **Task-aware per-item reason lines**: items get `tier · lines`, but reasons are generic, not "why *this* matters to *your task*" | Needle–question similarity | MED |
| G6 | **Within-session compaction**: `handoff.ts` covers session boundaries; no compaction of long tool-output history mid-session | Anthropic compaction | MED |
| G7 | **Tool-output compression for MCP consumers**: no staged/summarized tool results | Anthropic token-efficient tools | MED |
| G8 | **In-prompt verification loop**: critic runs *after* an answer; no prompt section telling the model to verify each claim against cited lines as it writes | OpenAI reflection; Anthropic verify | MED |
| G9 | **Context-quality eval harness**: nothing measures answer quality vs. context length/structure (context-rot style A/B) | Chroma, NoLiMa, LongMemEval | MED |
| G10 | **Trajectory / few-shot memory**: task ledger stores state, but no curated library of successful prior *task → context → outcome* examples | Anthropic note-taking; OpenAI few-shot | LOW |
| G11 | **Redundancy pruning in `applyBudget`** (MMR-style: score − λ·redundancy) | Distractor findings | LOW |
| G12 | **Fine-tune distillation export** from ledger/usage logs | Anthropic "fine-tuned context" | FUTURE |

---

## 4. Concrete proposal — the "Prompt Middleware" (Context Container) layer

### 4.1 Concept

A deterministic pipeline between *assembly* and *rendering* — this is the user's
"middleware of prompt / containers / chunks + teach the AI what to do" idea:

```text
assemble (existing) → budget (existing) → [NEW: middleware stages] → render (restructured)
   1. ORDER      — stable prefix (instructions) → task → critical → supporting → reminders
   2. ANNOTATE   — per-container purpose line: "USE THIS TO: …"
   3. CHUNK      — group items into named containers with delimiters
   4. OUTLINE    — 1-level index + "call read_file_range for depth"
   5. PRUNE      — redundancy/distractor pass within budget
   6. EMBED-CHECK— assert budget + sufficiency still hold (fail loud)
```

All stages **deterministic and pure** — consistent with ADR-001 (deterministic
before AI), the existing sufficiency gate, and every other module in the layer.
No new package needed: new pure modules live beside the others in
`packages/sdk/src/context-integration/`.

### 4.2 The container prompt format (addresses G1 + G2 + G3)

```text
<task>                       ← FIRST: primacy position (Lost in the Middle)
  one-line goal, success criteria, existing planner steps
</task>

<instructions>               ← stable, cache-friendly prefix (AGENTS.md + rules)
  HOW TO USE THIS CONTEXT: each container below states its purpose.
  Work through them in order. Do NOT read everything — depth is on demand,
  use the on-demand block at the end when you need more.   ← "teach the AI"
</instructions>

<context id="overview" depth="index">      ← ONE-level outline (arXiv: one level!)
  repo digest + symbol outlines; for full content call
  read_file_range(path, lines) — the ranges are listed per symbol.
</context>

<context id="critical" purpose="why you need this for THIS task">
  items with task-specific reason lines, path + role annotations
  (distinguishes parallel/similar files — distractor defense)
</context>

<context id="supporting" purpose="...">...</context>

<on-demand>                   ← LAST: recency position for retrieval map
  To go deeper: atlas search tools, read_file_range, get_dependencies.
  Staleness/truncation warnings live here (they already exist in render.ts).
  If anything contradicts an excerpt, trust the excerpt.
</on-demand>
```

Design rules (each research-derived):

1. **Task first, retrieval map last, nothing critical buried in the middle** —
   U-shaped attention (Lost in the Middle).
2. **Every container carries a `purpose` line — the "teach AI what to do"**
   (Anthropic explicit structure; OpenAI named instruction buckets).
3. **Exactly one outline level** — proven: deeper routing never helps, sometimes
   hurts (arXiv 2607.17598).
4. **Stable prefix → volatile tail** — preserves prompt/KV cache across turns
   (NVIDIA). Instructions/task skeleton are byte-stable; retrieved code is volatile.
5. **Keep existing ⚠️ staleness/truncation/exclusion warnings** — they are the
   anti-poisoning/anti-stale guards already proven in `render.ts`.
6. **Distinguish similar items** — every chunk shows path + tier + line range +
   task reason so parallel code blocks don't blur together (Chroma haystack
   structure finding).

### 4.3 Where it lives (architecture-safe)

- New pure modules under `packages/sdk/src/context-integration/` — e.g.
  `containers.ts` (chunk grouping + purpose lines), `ordering.ts` (stable-prefix
  ordering rules). The SDK owns composition; **no new package, no dependency-matrix
  change**.
- `render.ts` evolves **behind the same provider-independent API**
  (`renderContextPackage`), so CLI / MCP / VS Code extension are unaffected
  consumers.
- Reuse, never rebuild: `hierarchy.ts` outlines, `budget.ts` records,
  `sufficiency.ts` verdicts, `planner.ts` steps, `digest.ts`, staleness warnings.
- If a `core` port must change, that requires a documented ADR + human review
  (AGENTS.md §4.2).

### 4.4 Suggested build order

1. **G1 + G2 + G3** — container renderer: ordering, purpose lines, one-level
   outline + on-demand contract. Biggest leverage; pure `render.ts` + new pure
   module work; unit-testable with snapshot tests of rendered prompts.
2. **G5 + G4/G11** — task-aware reason lines and redundancy pruning inside
   `applyBudget` (distractor defense).
3. **G8** — verification-loop section generated from the existing `critic`
   checklist (verify as you write, not just after).
4. **G6 + G7** — within-session compaction and MCP tool-output caps.
5. **G9** — a context-rot-style eval harness: same questions, A/B flat vs.
   container rendering, across model sizes (also proves the value externally).
6. **G10 + G12** — trajectory few-shot library from task ledgers; fine-tune
   dataset export (future).

---

## 5. Sources

1. Anthropic — *Effective context engineering for AI agents* (2025-09-29)
   https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
2. Chroma — *Context Rot: How Increasing Input Tokens Impacts LLM Performance* (2025-07-14)
   https://research.trychroma.com/context-rot
3. Liu et al. — *Lost in the Middle: How Language Models Use Long Contexts* (TACL 2023)
   https://arxiv.org/abs/2307.03172
4. LangChain — *Context Engineering for Agents* (2025-07-02)
   https://blog.langchain.com/context-engineering-for-agents/
5. He et al. — *Is Progressive Disclosure All You Need for Long-Context Agents?*
   (arXiv 2607.17598, 2026-07-20) https://arxiv.org/html/2607.17598v1
6. NVIDIA — *Structuring Applications to Secure the KV Cache* (2025-04-29)
   https://developer.nvidia.com/blog/structuring-applications-to-secure-the-kv-cache/
7. OpenAI — *Prompt engineering guide* (2026)
   https://platform.openai.com/docs/guides/prompt-engineering
8. CodeAtlas internal (scanned 2026-10-14): `docs/CURRENT_STATE.md`,
   `docs/architecture/CONTEXT.md`, `docs/reference/CONTEXT_SDK.md`,
   `docs/architecture/DEPENDENCIES.md`, `packages/sdk/src/context-integration/*`,
   `packages/context/src/context-builder.service.ts`, `packages/sdk/src/container.ts`

