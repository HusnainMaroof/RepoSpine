# Antigravity Research — Prompt Middleware, Context Containers & Cognitive Chunking
## Deep research on solving "Lost in the Middle", Context Rot, and Cognitive Overload in Large-Context Models

> **Date:** 2026-10-14 · **Worktree:** `researching` · **Agent:** Antigravity · **Status:** Research findings & technical specification (proposal)
>
> **The Core Problem:** There is a common belief that expanding context windows and feeding massive input prompts makes AI models smarter. In practice, models suffer from severe attention degradation: they forget instructions, hallucinate details, and get confused when critical evidence is buried in large context dumps.
>
> **The Core Question:** Can CodeAtlas introduce a **Prompt Middleware** layer that breaks context into isolated **Context Containers**, scaffolds prompts into cognitive chunks, and "teaches" the model step-by-step how to reason—producing measurably stronger results across frontier and smaller local models alike?
>
> **The Short Answer:** **YES.** The empirical research (Liu et al., Chroma, Anthropic, Agentless) overwhelmingly confirms that context structure, boundary isolation, and attention anchoring matter far more than sheer token capacity. CodeAtlas's deterministic engine is uniquely positioned to act as a **provider-neutral context compiler and prompt middleware pipeline**.

---

## 1. Why Long Input Fails: The Empirical Research

### 1.1 The "Lost in the Middle" Phenomenon (Liu et al., Stanford / UC Berkeley)
*Source: https://arxiv.org/abs/2307.03172*

Transformer self-attention exhibits an inherent **U-shaped performance curve**:
- **Primacy Bias:** Tokens at the very beginning of the prompt ($0\%-10\%$) enjoy the highest attention weights and recall fidelity.
- **Recency Bias:** Tokens at the very end of the prompt (the final $10\%-15\%$ before token generation starts) remain fresh in active memory, exerting strong influence over initial generation.
- **The Middle Dead Zone:** Information placed in the middle of long contexts ($20\%-80\%$) suffers a **$30\%-50\%$ drop in recall and comprehension**, even on models boasting 128k–2M token windows.

**Direct Implication for CodeAtlas:**
When CodeAtlas renders a context package via `renderContextPackage()`, the user's task and staleness warnings sit at the very top, followed by thousands of lines of raw source code, and a token budget summary at the end. The critical operational task and instructions sit far away from the model's generation trigger. The model's attention on the original instruction is severely diluted by the time it finishes reading the code excerpts.

### 1.2 Context Rot & Attention Dilution (Chroma Research, July 2025)
*Source: https://research.trychroma.com/context-rot*

In an empirical evaluation of 18 LLMs (GPT-4.1, Claude 4, Gemini 2.5, Qwen3):
- Accuracy drops non-linearly as token length increases, even on simple retrieval tasks.
- **Distractors hurt disproportionately:** Irrelevant or loosely related code files placed near the target evidence actively suppress recall.
- **Structural confusion:** Similar-looking code blocks (e.g. multiple services with identical method names) cause the model to conflate implementations unless they are strictly separated by explicit boundary metadata.

### 1.3 Instruction Density Decay (IFScale, arXiv 2507.11538)
- As the volume of instructions and background context grows, instruction-following adherence drops sharply. Even top frontier models degrade to ~68% adherence under heavy instruction density.
- Models strongly favor instructions that appear *earlier* (primacy) or are *re-anchored immediately prior to output* (recency). Instructions nestled in the middle are frequently ignored.

### 1.4 Anthropic Context Engineering & Prompt Sandwiches
*Source: Anthropic Engineering Guidelines for AI Agents*

Anthropic's long-context prompting research establishes three non-negotiables:
1. **XML Boundary Tags:** Hard semantic delimiters (`<documents>`, `<context>`, `<instructions>`, `<scratchpad>`) prevent code text from bleeding into operational rules.
2. **The Prompt Sandwich:** Placing system identity at the top, reference context in the middle, and **repeating operational constraints, checklists, and output schemas at the absolute bottom**.
3. **Cognitive Scratchpads:** Directing the model to perform structured reasoning inside `<scratchpad>` tags before emitting code or tool calls prevents knee-jerk errors.

---

## 2. What CodeAtlas Already Has (Foundational Strengths)

CodeAtlas has already built the hardest parts deterministically—avoiding the trap of relying on raw AI exploration:
- **`ContextBuilderService` & `ContextSDK`**: Deterministic hybrid search, PageRank symbol scoring, dependency graph closure.
- **Deterministic Synthesis (`synthesis.ts`)**: Pre-computes architecture conclusions and evidence chains from the graph without AI (ADR-017).
- **Task Classification (`classifier.ts`)**: Categorizes tasks into `debug`, `security`, `refactor`, `feature`, `test`, `review`, and `explain`.
- **Heuristic Planner (`planner.ts`)**: Generates category-specific plan steps (`PlanStep[]`) and verification strategies.
- **Hierarchy & Outlines (`hierarchy.ts`)**: Extracts symbol outlines and line ranges (ADR-014).
- **Budgeting & Deny Filtering (`budget.ts`, `deny.ts`)**: Tiered token caps, truncation, and secret scrubbing.
- **Deterministic Critic (`critic.ts`)**: Rule-based checklist verification.
- **Architectural Vision (`ADR-026`)**: Proposes a provider-neutral `WorkPacket` with a stable scaffold and dynamic suffix.

### The Missing Piece
What is missing is the **delivery mechanism**: how this rich, deterministic context is formatted, bounded, and staged for model consumption. Right now, `renderContextPackage()` flattens everything into a single Markdown text stream with generic `##` headings. There is no middleware to enforce semantic containment, eliminate the U-curve dip, or guide the model through phased cognitive steps.

---

## 3. The Architecture: Prompt Middleware & Context Containers

To solve these issues, CodeAtlas should implement a **Prompt Middleware Pipeline** composed of four synergistic subsystems:

```
┌────────────────────────────────────────────────────────────────────────┐
│ ContextPackage (from assembleContextPackage)                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ PROMPT MIDDLEWARE PIPELINE                                             │
│                                                                        │
│  1. Containerizer Middleware                                           │
│     Wraps files/symbols into <context_container> with XML & CDATA      │
│                                                                        │
│  2. Strategic Relevance Ordering Middleware                            │
│     Re-orders items: Tier 1 at outer boundaries, digests in middle     │
│                                                                        │
│  3. Cognitive Step Scaffolder Middleware                               │
│     Generates <cognitive_execution_guide> (Locate → Hypothesize → Act)│
│                                                                        │
│  4. Dual-Anchor Sandwich Middleware                                    │
│     Primacy Anchor (Top) + Evidence (Mid) + Recency Anchor (Bottom)    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Final Rendered Containerized Prompt / WorkPacket                       │
│ (Fed to Claude / Gemini / Codex / Ollama via SessionPort)              │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Context Containers (`<context_container>`)
Instead of markdown headers that clash with code comments or READMEs, context items are isolated in semantic XML containers:

```xml
<context_container id="item-3" kind="symbol_slice" path="packages/core/src/auth.ts" lines="45-88" tier="1" score="84.2">
<![CDATA[
export function verifySessionToken(token: string): Result<Session> {
  // Method implementation...
}
]]>
<provenance source="search_match" reason="exact symbol match for verifySessionToken" />
</context_container>
```

**Benefits:**
- **Zero Syntax Collision:** CDATA isolation prevents JSX, HTML, or markdown inside user code from breaking prompt formatting.
- **Explicit Metadata:** Models parse XML attributes natively, knowing the exact file path, line range, and tier without inferring from surrounding text.
- **Anti-Injection Boundary:** Code containing malicious prompt injection strings cannot break out of its XML container.

### 3.2 Dual-Anchor Prompt Sandwiching (Combating "Lost in the Middle")
The prompt is constructed as a sandwich to guarantee that the U-shaped attention curve works *for* the model rather than against it:

1. **Top Anchor (Primacy Zone — First 10%):**
   - `<system_role>`: Core identity, persona, and non-negotiable repository policy.
   - `<task_objective>`: Clear statement of the user's primary goal.
   - `<repository_digest>`: High-level architectural orientation.

2. **The Middle Filling (Evidence Zone — 20% to 80%):**
   - `<repository_evidence>`: Containerized source code excerpts and symbol outlines.
   - `<engine_synthesis>`: CodeAtlas's deterministic conclusion and evidence chain.

3. **Bottom Anchor (Recency Zone — Final 15% before response):**
   - `<cognitive_execution_guide>`: Step-by-step instructions telling the AI what to do.
   - `<scratchpad_instruction>`: Explicit instruction to reason inside `<scratchpad>` tags first.
   - `<operational_constraints>`: Deny rules, coding conventions, and negative constraints.
   - `<task_reanchor>`: Repetition of the core task immediately before output generation begins.

### 3.3 Strategic Relevance Ordering
Traditional retrievers sort results purely descending: `[Score 95, 90, 80, ..., 20]`. In a long prompt, the items ranked 4th through 10th end up directly in the "dead middle."

**Strategic U-Curve Layout:**
The middleware sorts evidence so that highest-relevance items sit near the **borders** of the evidence block:
- **Top of evidence block:** Item 1 (Highest seed/target)
- **Bottom of evidence block:** Item 2 & Item 3 (Immediate dependencies / critical callers)
- **Middle of evidence block:** Tier 2 / Tier 3 summaries, structural outlines, and background digests.

This ensures that the most critical evidence is processed either during the primacy window or during the recency window.

### 3.4 Cognitive Step Scaffolding ("Teaching the AI in Chunks")
Rather than dumping 20 files and expecting the model to solve everything in one unstructured leap, the prompt middleware injects an explicit cognitive scaffold derived from `planner.ts`:

```xml
<cognitive_execution_guide>
Follow this 4-phase reasoning protocol:
Phase 1 [Locate & Verify]:
- Review the cited boundaries in <context_container>.
- Confirm which container directly touches the failure path.

Phase 2 [Hypothesize in Scratchpad]:
- Open a <scratchpad> block.
- Analyze why the current implementation fails.
- Trace downstream impact using the evidence chain.

Phase 3 [Minimal Targeted Action]:
- Emit the minimal code change necessary.
- Do not refactor unrelated methods.

Phase 4 [Self-Critique & Verification]:
- Verify your patch against the rules in <operational_constraints>.
- Ensure no cited files outside the permitted scope were modified.
</cognitive_execution_guide>

<scratchpad>
<!-- Model begins reasoning here before writing final code -->
```

---

## 4. Synergy with Companion Research (`cline.md` & `freebuff.md`)

This research directly complements the findings of our peer worktrees:

| Dimension | `cline.md` (Cline) | `freebuff.md` (Codebuff) | `antigravity.md` (Antigravity) |
|---|---|---|---|
| **Core Diagnosis** | Context rot, distractor suppression, needle-question similarity | U-shaped attention, instruction density degradation, AGENTS.md bloat | Attention dilution, lack of semantic isolation, monolithic prompt format |
| **Retrieval Focus** | Progressive disclosure, subagent isolation, just-in-time fetching | Ordering by importance, minimal requirements, stable cache prefix | Strategic U-curve placement, Tier 1 edge anchoring |
| **Prompt Structure** | Delimited code blocks, structured notes | Markdown/XML sections, sandwich pattern | Formal **Prompt Middleware Pipeline** with `<context_container>` & CDATA |
| **Cognitive Guidance**| Re-anchoring critical items, tool sandboxing | Goal + output contract repeated at end | **Cognitive Step Scaffolding** (4-phase protocol + mandatory `<scratchpad>`) |

All three reports converge on one undeniable truth: **More raw context hurts; curated, isolated, strategically ordered, and cognitively scaffolded context wins.**

---

## 5. Implementation Roadmap for CodeAtlas

### Phase 1: Core Domain Contracts (`packages/core`)
- Define `ContextContainer` and `ContextContainerKind` domain models.
- Define `PromptMiddlewarePort` and `PromptMiddlewareInterceptor` interfaces.
- Define `PromptSandwichOptions` and `CognitiveScaffold` types.

### Phase 2: Middleware Pipeline in SDK (`packages/sdk`)
- Create `packages/sdk/src/context-integration/prompt-middleware/`:
  - `containerizer.ts`: Pure transformer converting `ContextPackageItem` to XML `<context_container>` with CDATA wrappers.
  - `strategic-order.ts`: U-curve distribution algorithm.
  - `scaffold.ts`: Heuristic generator mapping `planner.ts` steps to `<cognitive_execution_guide>`.
  - `sandwich.ts`: Dual-anchor prompt composer.
  - `pipeline.ts`: Composable middleware executor.

### Phase 3: Renderer & CLI Integration (`packages/sdk` & `apps/cli`)
- Add `renderContainerizedPackage()` to `render.ts` (preserving `renderContextPackage` for backwards compatibility).
- Add `--containers` flag to `atlas context build`, `atlas context launch`, and `atlas context explain`.
- Update `integration.launch()` and `integration.attach()` to optionally accept containerized rendering.

### Phase 4: Verification & Benchmarking
- Unit tests: XML escaping, CDATA safety, boundary integrity, token count stability.
- Empirical test: Compare Claude / Gemini / Ollama adherence on a SWE-bench style localization task with flat prompt vs. containerized sandwich prompt.
