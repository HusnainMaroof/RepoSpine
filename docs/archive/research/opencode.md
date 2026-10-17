# Opencode Research — Strengthening CodeAtlas Context for AI Models

## Prompt middleware, context containers, and evidence-aligned chunking

> **Date:** 2026-10-14 · **Worktree:** `moreresearch` · **Agent:** OpenCode · **Status:** Research findings & recommendation (proposal — no code changed)
>
> **The core question:** People assume "big context window = smarter model". In
> practice long, flat input dumps make models forget the task, mix instructions
> with evidence, and hallucinate. Can CodeAtlas add a *prompt middleware* layer
> that packages context into typed **containers**, breaks long evidence into
> **small pieces**, and explicitly **teaches the model what to do** with each
> piece?
>
> **Short answer: YES — and the research is specific about the mechanism.** The
> wins come from (a) typed delimiters that separate instructions from evidence,
> (b) edge placement (start/end of context), (c) symbol-level chunking of
> *evidence* (not instructions), (d) progressive disclosure / just-in-time
> pointers, and (e) compression before injection. This document maps those
> findings onto CodeAtlas's existing pipeline, lists code-verified gaps, and
> proposes a phased plan.

---

## 1. What the research says

### 1.1 Context rot — more tokens ≠ better answers

- **Chroma, "Context Rot"** (18 frontier models: GPT-4.1, Claude 4, Gemini 2.5,
  Qwen3) — every model became less reliable as input length grew, *well before*
  the window was full, even on trivially simple retrieval tasks.
  <https://research.trychroma.com/context-rot>
- Larger windows raise the ceiling at which degradation sets in; they do not
  remove it. Anthropic's framing: aim for "the smallest possible set of
  high-signal tokens."
- **Distractor content harms accuracy even when the correct answer is present
  in the context.** Compression beats completeness.

### 1.2 Lost in the middle — position matters as much as content

- **Liu et al., "Lost in the Middle" (TACL 2024)** — U-shaped attention curve:
  information at the **beginning and end** of context is used; information in
  the middle is underweighted (30%+ accuracy drops from positioning alone).
  <https://arxiv.org/abs/2307.03172>
- **Anthropic long-context guidance (20k+ tokens):** place longform documents at
  the top, the query/instructions *after* them — reported **up to 30% better
  quality** in tests. <https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags>
- **OpenAI GPT-4.1 guidance:** instructions above the context, *or repeated at
  both ends*; conflicting instructions resolve in favor of the one **closer to
  the end** of the prompt.
- Consequence: ordering is **provider-dependent**. One fixed string layout
  cannot be optimal for both — this is an argument for provider profiles.

### 1.3 Containers — typed delimiters, not prose

- **Anthropic prompting docs:** wrap each content *type* in its own tag
  (`<instructions>`, `<documents>`, `<file path=... lines=...>`,
  `<source>`) so the model never confuses **evidence with instructions**. This
  is simultaneously an accuracy win and a **prompt-injection defense**:
  delimited retrieved text is far less likely to be obeyed as an instruction.
- **Anthropic engineering blog, "Effective context engineering for AI agents":**
  organize prompts into distinct sections (`<background_information>`,
  `<task>`, tool guidance, output description) using XML tags or markdown
  headers; aim for the minimal set of information that fully outlines expected
  behavior.
  <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>
- Consensus across the ecosystem: prompts are **compiler output**, not
  handwritten text (Claude Code's layered system prompt with static/dynamic
  cache zones; section-builder/middleware libraries such as promptloom,
  promptype, LangChain `SummarizationMiddleware`/`ContextEditingMiddleware`).

### 1.4 Chunking — validated for long *evidence*, not for slicing instructions

- **"When Does Divide and Conquer Work for Long Context Tasks?" (arXiv
  2506.16411)** decomposes long-context failure into *task noise* (cross-chunk
  dependence), *model noise* (confusion growing superlinearly with input
  length), and *aggregator noise* (bad stitching of partial results).
  <https://arxiv.org/html/2506.16411v1>
  - Chunking wins when cross-chunk dependency is mild.
  - The **aggregator prompt is decisive**: a structured merge instruction
    recovers most of what naive chunking loses.
  - Weak model + chunking can beat a strong model + single-shot on large
    inputs — directly relevant to CodeAtlas's token-efficient model strategy
    (ADR-026).
- **Cursor's indexing architecture** (independent corroboration): AST-based
  semantic units (function/class boundaries), never arbitrary token windows —
  because token-split chunks carry broken semantic signals. Each unit keeps
  path + line-range attribution.
- **Honest nuance:** the evidence supports chunking *retrieved code/docs* into
  symbol-aligned slices with cite markers. It does **not** support chopping
  instructions into fragments; instructions should stay short, whole, and
  placed at the edges.

### 1.5 Progressive disclosure / just-in-time pointers

- **Anthropic Agent Skills**: three loading levels — metadata always loaded,
  body on trigger, references on demand. "Progressive disclosure is the core
  design principle that makes Skills flexible and scalable."
  <https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills>
- **2026 empirical reports:** progressive disclosure saves up to **81.7%** of
  tokens vs eager loading, improves skill-retrieval quality and reliability;
  **flat (one-level) disclosure beats hierarchical (recursive)** — "one level is
  enough." (<https://arxiv.org/html/2609.35692v1>,
  <https://arxiv.org/pdf/2607.17598.pdf>)
- Generalized: **just-in-time retrieval** — hand the model *pointers* (paths +
  line ranges + one-line reasons), let it fetch on demand, instead of
  pre-loading everything. Anthropic's own Claude Code hybrid: CLAUDE.md dropped
  in up front, glob/grep for everything else.

### 1.6 Long-horizon coherence — compaction and structured note-taking

- **Compaction:** near 70–80% of window capacity, summarize history preserving
  *decisions, constraints, unresolved items*; discard raw tool outputs and
  exhausted dead ends.
- **Structured note-taking:** an external, typed, dated notes file
  (`## Decision: 2026-10-10: chose X because Y`) that survives context resets —
  prose journals are hard to query, typed entries are not.
- **Sub-agent isolation:** deep exploration in a clean context, return only a
  1–2k token distilled summary to the orchestrator.

### 1.7 Instruction placement research (academic)

- **"Instruction Position Matters" (ACL Findings 2024)** — shifting task
  instructions *after* the input mitigates "instruction forgetting" on long
  inputs; up to +9.7 BLEU zero-shot, hallucination rate 4.8% → 1.7%.
  <https://aclanthology.org/2024.findings-acl.693/>
- **"Fantastically Ordered Prompts" (ACL 2022)** — ordering of in-context
  material alone can separate near-SOTA from random-guess performance.

---

## 2. CodeAtlas reality — code-verified gap table

All references verified against this tree at commit `47233bd`.

| # | Gap | Evidence |
|---|---|---|
| 1 | **No container/typing layer.** The rendered prompt is flat `# Task` → `## title` → **raw, unfenced** content — markdown-heavy file content bleeds into the surrounding structure, and evidence is indistinguishable from instructions | `packages/sdk/src/context-integration/render.ts:99-120` (`item.content` emitted raw, no fence) |
| 2 | **Task sits at the top, never repeated at the end.** Violates the strongest finding (edge placement; last instruction wins conflicts). No provider-aware ordering anywhere | `render.ts:28-29` — `# Task` first, `# Budget` last |
| 3 | **File items are whole-file blobs.** The only reduction is head-truncation at the per-item cap. The symbol-range slicer **exists but is wired to nothing but tests** | `assemble.ts:958` `fileItem()` embeds entire file; `hierarchy.ts:96` `sliceContentByRanges` used only by `packages/sdk/tests/hierarchy.test.ts` |
| 4 | **Static budgets, chars÷4 tokenizer.** Nothing derives a budget from the target model's context window | `budget.ts:5-9` (`20 / 2000 / 12000` fixed defaults); `packages/shared/src/token-estimation.ts:10` (`Math.ceil(len/4)`) |
| 5 | **No central prompt middleware.** Templates are scattered string constants across packages, and the same package has two divergent renderings (unfenced vs fenced) | `render.ts`, `slice.ts:238,275,302`, `briefing.ts:22`, `critic.ts:27`, `packages/summary/src/prompts.ts:35,48`, `handoff.ts`, skills `loader.ts` |
| 6 | **No "how to use this context" playbook.** Sufficiency is *computed* but the model is never given a binding contract: cite-before-conclude, don't infer unopened code, when to escalate via search | `sufficiency.ts:86` `evaluateSufficiency()`; not rendered as an instruction block in `render.ts` |
| 7 | **Budget only drops from the tail** — never shrinks a low-priority item to keep a high-priority one; `budgetExceeded` is reported but essentials still ship oversized | `budget.ts:31-93` |
| 8 | **No cross-item content dedup** — a file, its summary, and the digest can repeat the same facts (only id-level dedup exists) | assembly pipeline in `assemble.ts` |
| 9 | **MCP tool results are JSON blobs** (50K-char cap), not LLM-shaped markdown — except `continue_task` | `packages/mcp/src/handlers.ts:109` `MAX_OUTPUT_CHARS = 50_000` |
| 10 | **Two parallel "build context" paths** — `ContextBuilderService` is registered in the container but the real assembly pipeline bypasses it | `container.ts:62` vs `assemble.ts:154,197` (uses `ContextSDK` directly) |

**The key insight:** CodeAtlas's *data model is already structured* — every
`ContextPackageItem` carries `kind`, `tier`, `source`, `reason`, `ranges`,
`tokens`, `truncated`; the package carries `budget`, `exclusions`, `staleness`,
`synthesis`. **The renderer throws that structure away at the last mile.** That
is the highest-leverage fix.

---

## 3. Recommendations (phased)

### Tier 1 — Prompt middleware + containers *(the core ask)*

1. **`PromptComposer` — one module owning all prompt assembly**, replacing the
   scattered templates. Emits typed, delimited blocks:

   ```
   <task>…</task>
   <context_constraints>  ← staleness / truncation / exclusions / budget
   <evidence>
     <file path="…" lines="120-180" tier="critical"> ```fenced code``` </file>
   </evidence>
   <playbook>              ← how to consume the evidence (see 3.)
   <task_reminder>…</task_reminder>   ← edge placement, last thing read
   ```

2. **Provider-aware ordering profiles — decision: profile-switchable default.**
   - `markdown` (default): existing style, but fenced items + sandwich order.
   - `xml`: Anthropic-recommended tags, docs-first/query-last.
   - OpenAI-style: instructions repeated at both ends.
   Keyed off the existing provider adapters (`packages/providers`) — never
   `if (provider === …)` outside adapters (AGENTS.md §4.6).

3. **The playbook block** — a fixed, token-cheap contract teaching the model
   *what to do* with the pieces: quote/point at evidence before concluding;
   trust excerpts over the synthesis if they contradict; never speculate about
   code not shown (Anthropic's documented anti-hallucination block); when
   sufficiency says `refine`, call search/read tools rather than guessing.

### Tier 2 — Evidence-aligned chunking

4. **Wire `sliceContentByRanges`** (`hierarchy.ts:96`): file items emit
   symbol-aligned slices with `@@ L… @@` cite markers instead of whole-file
   blobs — plus an aggregator instruction explaining how to reconcile slices
   (the research says the aggregator prompt is decisive).
5. **Progressive disclosure / JIT pointers:** lower tiers render as brief
   pointers (`path:start-end` + reason) with an explicit "read these ranges
   next" list; full content only for `critical`. Brief mode and
   `read_file_range` already exist — connect them with instructions.
6. **Shrink-then-drop budgeting** + cross-item content dedup.

### Tier 3 — Model awareness & scale

7. **Model-window-aware budgets:** small context-window table per
   provider/model; budget = window − reserved output − static prefix; keep
   chars÷4 as the documented fallback.
8. **Compaction + structured ledger for sessions:** extend the ADR-025 task
   ledger into typed, dated notes an agent re-reads on a fresh context.
9. **MCP markdown shaping:** LLM-readable `content[]` + keep
   `structuredContent` JSON for machines; default tool-call budget.

### Tier 4 — Proof

10. **Golden prompt snapshot tests** — freeze rendered prompts per scenario so
    every composer change is reviewable (a test, not a benchmark package).

### Explicitly *not* recommended

- Chopping instructions into arbitrary small fragments (research supports
  chunking *evidence*, not instructions).
- A second Skill system, second registry, or new config framework — extend the
  one loader / one package model (AGENTS.md §4.3).

---

## 4. Relationship to existing docs

- Complements [`docs/architecture/TOKEN_EFFICIENT_MODEL_STRATEGY.md`](docs/architecture/TOKEN_EFFICIENT_MODEL_STRATEGY.md)
  (ADR-026): the chunking + aggregator findings here are directly usable by
  that plan's controller (weaker models succeed when evidence arrives
  pre-structured).
- Fits under [`docs/architecture/CONTEXT.md`](docs/architecture/CONTEXT.md)
  (repository understanding) and the Context → Agent integration ADR-008
  (delivery): Tier 1 changes only the *rendering seam*
  (`render.ts` → `PromptComposer`), not assembly, ranking, or storage.
- No schema change, no new package, no dependency-direction change — so no new
  ADR is required until implementation begins (then one ADR covering the
  composer seam + provider profiles).

---

## 5. Sources

| Topic | Source |
|---|---|
| Context rot (18 models) | Chroma, *Context Rot* — research.trychroma.com/context-rot |
| Lost in the middle | Liu et al., TACL 2024 — arxiv.org/abs/2307.03172 |
| XML containers, query-last, +30% | Anthropic prompting docs — docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/use-xml-tags |
| Context engineering for agents | Anthropic — anthropic.com/engineering/effective-context-engineering-for-ai-agents |
| Chunking theory (3 noise types) | arxiv.org/html/2506.16411v1 |
| Instruction placement | ACL Findings 2024 — aclanthology.org/2024.findings-acl.693/ |
| Progressive disclosure (81.7% savings) | arxiv.org/html/2609.35692v1 |
| Flat vs hierarchical disclosure | arxiv.org/pdf/2607.17598.pdf |
| Agent Skills 3-level loading | anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills |
| Compaction / note-taking / sub-agents | Anthropic context-engineering essay (above) |
| AST-level retrieval in practice | Cursor indexing analyses (architecturallyspeaking.substack.com, bito.ai/blog) |
| Vendor ordering split (OpenAI vs Anthropic) | prompt-architects.com/blog/610-does-instruction-order-change-the-output-yes |
