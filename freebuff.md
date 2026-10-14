# freebuff.md — Making CodeAtlas context work better for AI models

Research notes and a concrete plan for strengthening the context packages
CodeAtlas gives to AI agents. Status: **proposal, no code changed.**

---

## 1. Core finding

**More context does not make models more reliable. Smaller, ordered, well-structured context does.**

| Finding | Source | Implication |
|---|---|---|
| Performance becomes less reliable as input length grows, even on simple tasks | Chroma, *Context Rot* (18 LLMs incl. GPT-4.1, Claude 4, Gemini 2.5) | Cap the package; do not dump the repo |
| Models use information best at the start and end; the middle is often missed (U-shape) | Liu et al., *Lost in the Middle*, arXiv 2307.03172 | Put the most important evidence at the edges |
| Instruction density degrades adherence separately from length. Best frontier models reached ~68% at 500 keyword instructions. Models favor *earlier* instructions. | IFScale, arXiv 2507.11538 | Keep rule blocks short; order by importance |
| LLM-generated context files **reduced** task success by ~3% on average. Developer-written files helped only slightly (+4%). Both kinds raised inference cost by over 20%, because agents explored and tested more. | Gloaguen et al., *Evaluating AGENTS.md*, arXiv 2602.11988 | Include **minimal** requirements only. Do not add generated "overview" text by default |
| Prompt caching cut API cost 41–80% and TTFT 13–31%. Placing dynamic content at the *end* of the system prompt and excluding dynamic tool results performed more consistently than full-context caching. | Lumer et al., *Don't Break the Cache*, arXiv 2601.06007 | Stable prefix first, dynamic suffix last (ADR-026 already agrees) |
| Agents used about 4× the tokens of a chat; multi-agent systems about 15×. Most coding tasks are poor fits for parallel subagents. | Anthropic, *Multi-agent research system* | Prefer sequential, fresh-context steps for coding |
| Vendor guidance: long data near the top, query last (Anthropic); key instructions at both start and end, with delimiters (OpenAI). | Claude prompting docs; OpenAI GPT-4.1 guide | Constraints at top, evidence in middle, goal + output contract repeated at end |
| "Minimal" does not mean "short." Use distinct sections (XML tags or Markdown headers). | Anthropic, *Effective context engineering* | Structure over brevity |

**Caveat:** Most of these results come from controlled benchmarks. The
AGENTS.md study covers Python SWE-bench-style tasks. Effect sizes on
CodeAtlas's own workload are unknown until measured (see §5).

---

## 2. What CodeAtlas already has (do not rebuild)

Verified against code and ADRs:

- **Tiered budgets and per-item truncation** — `packages/sdk/src/context-integration/budget.ts`.
- **Context modes** — `digest` mode, auto-selected above 800 files and selectable per call (ADR-016).
- **Hierarchy** — `hierarchy.ts` (ADR-014).
- **Planner / classifier / critic / sufficiency / synthesis** — all in `packages/sdk/src/context-integration/`.
- **Stable scaffold + dynamic suffix split**, bounded-executor stance for smaller models, deterministic verification before escalation (ADR-026).
- **Deny-filter and secrets exclusion** — rendered in the package footer.

The gaps below are about **how the rendered package is ordered and phrased**, not about new systems.

---

## 3. Gaps and proposed changes

Ordered by expected value and risk. Each change stays inside existing
context-assembly code. No parallel middleware (AGENTS.md §4.3).

### P1 — Restate goal and output contract at the end
`renderContextPackage` ends with a Budget/exclusions footer. The task is
stated only at the top.
- **Change:** After the evidence, repeat a 2–3 line goal and output contract.
- **Why:** Models use the end of the prompt well (*Lost in the Middle*). OpenAI's guide recommends the same.
- **Test:** Golden-output test in the MCP context-correctness suite.

### P2 — Order evidence by rank, with the best at the edges
- **Change:** Place the highest-ranked evidence first and the second-highest last. Lower-ranked items go in the middle.
- **Why:** U-shaped attention curve.
- **Test:** Assert ordering on a fixture with known ranks.

### P3 — Section containers
- **Change:** Wrap sections in `<task>`, `<constraints>`, `<evidence>`, `<scope>`, `<verification>`, `<output_contract>`. Keep Markdown headers inside if needed for readability.
- **Why:** Anthropic recommends XML tags; the sections give models stable anchors.
- **Test:** Snapshot test that every section exists exactly once.

### P4 — Minimal requirements only (no generated overview by default)
- **Change:** Include only verification commands, permitted scope, and project-specific constraints. Do not inject generated repo overviews unless the caller asks.
- **Why:** The AGENTS.md study found extra requirements increase exploration and cost while lowering success.
- **Test:** Token count and scope-violation rate on the eval corpus (§5) with and without overview text.

### P5 — Short, ordered rule block
- **Change:** Cap the constraints section (target ≤ ~10 rules). Order by importance. Merge overlapping rules.
- **Why:** Instruction density degrades adherence. Earlier rules win.

### P6 — Verification and scope paragraphs for coding agents
- **Change:** Add one paragraph telling the agent to run the approved checks (tests, typecheck, build) before reporting done, and to say which checks could not run. Add one sentence to stop at the requested scope and not add unrequested features, docs, or refactors.
- **Why:** Claude Haiku 5.5 prompting guidance. Matches ADR-026's approved verification commands.

### P7 — Date line once per conversation
- **Change:** Include today's date once at session start, in the stable scaffold, so search-capable agents can reason about recency.
- **Why:** Claude prompting guidance. It must stay in the stable part so it does not break caching.

### P8 — Cache-friendly ordering
- **Change:** Keep the scaffold (instructions, tool schema, digest, safety policy) byte-stable across calls. Put task, selected evidence, and diff in the dynamic suffix. Do not change the system prompt mid-conversation; put updates in the newest turn.
- **Why:** The caching study shows that dynamic content at the end and excluding dynamic tool results gives the most consistent savings. Changing the system prompt mid-session can break caching or cause 400 errors on resumed conversations.
- **Test:** Assert scaffold hash is stable across two renders with different tasks.

### P9 — Digest as default for weak models
- **Change:** Let the caller pass a model capability hint. Use digest mode by default for small models, not only above 800 files.
- **Why:** ADR-026 already treats smaller models as bounded executors.
- **Caveat:** Requires the capability data described in ADR-026 §5. Do not add provider-name conditionals (AGENTS.md §4.6).

### P10 — Dedupe and prune distractors before budgeting
- **Change:** Remove near-duplicate and off-topic items before the budget is applied, not after.
- **Why:** Distractors reduce reliability (Chroma). Repository-level code research reports retrieval beats in-file-only context, but that evidence is thin. Measure before relying on it.

### P11 — Provider adapter hardening (separate PR; needs ADR amendment)
Found in `packages/providers/src/adapters/anthropic.ts`:
1. `stop_reason` is never read. A refusal returns HTTP 200 and is treated as success. Add a typed `refusal` result with the category if present.
2. `stop_reason: "max_tokens"` is not detected. The default `max_tokens: 1024` can cut off the visible reply, especially when thinking is on by default. Flag truncation.
3. `anthropicText()` returns `""` when no text block exists. Treat empty output as a failure.
4. No `effort` control. Add an optional `effort` field to `ProviderRequest`, mapped only inside the adapter. Default to medium.
5. Default model is the placeholder `claude-sonnet-5`. Prefer explicit model ids (AGENTS.md §4.6).
- **Tests:** Mocked transport for refusal, truncation, and empty output. No network or credentials (AGENTS.md §4.10).
- **Note:** Items 1 and 3 change the `ProviderResponse` contract in `packages/core`, so they need an ADR amendment and review.

---

## 4. What to avoid

- **Do not** add a second prompt-assembly system or middleware beside `context-integration/`.
- **Do not** make packages longer to "help" the model. The evidence says the opposite.
- **Do not** default to parallel subagents for coding. Use sequential, fresh-context steps.
- **Do not** ship generated AGENTS.md-style overviews by default.
- **Do not** claim a gain without a baseline measurement.

---

## 5. Measurement plan (gate for every change)

Use a versioned, local eval corpus (ADR-026 §7). Compare each change against the current baseline on:

- expected file/symbol **recall** and evidence attribution;
- verification **pass rate** and task **success rate**;
- input/output tokens, cache-hit tokens (when reported), latency, retries, and escalation rate;
- **scope violations** (edits outside permitted files);
- privacy invariants: no denied content or secrets in packets or traces.

Run the corpus with and without each change (P1–P10). Keep only changes that improve success or hold it steady while reducing tokens.

---

## 6. Suggested order

1. **P1 + P2 + P3** — ordering, restatement, and section containers. Small, testable, no API change.
2. **P4 + P6 + P7** — minimal requirements, verification and scope lines, date line.
3. **P8** — cache-friendly ordering, with a stability test.
4. **Measurement harness** (§5) — required before P5, P9, and P10.
5. **P11** — provider adapter hardening, as its own ADR amendment and PR.

---

## 7. Open questions

- Which eval tasks represent CodeAtlas users? The AGENTS.md study used Python issues from real repositories; CodeAtlas needs a TypeScript-heavy corpus.
- Do Freebuff's models report cache-hit tokens? If not, P8 can only be measured by token count.
- Should the verification paragraph (P6) be per-repo config or a fixed default?

---

## 8. Round 2: techniques that need no MCP or extra tooling

Focus: plain files, prompt structure, and repo conventions an agent can use
with only grep, git, and the test runner.

### 8.1 Progress file + git history as the handoff (Anthropic, long-running agents)
- An initializer session writes `init.sh`, a progress log (`claude-progress.txt`), and an initial commit. Later sessions read the log and `git log` to resume, instead of guessing what happened.
- **Feature list in JSON, not Markdown.** Each entry has `passes: false` at the start. Agents may change only the `passes` field. The model was less likely to overwrite or corrupt JSON than Markdown.
- **One feature per session.** This stopped agents from trying to one-shot the whole app.
- **Clean state at session end:** descriptive commits and a progress entry, so bad changes can be reverted with git.
- **Fit for CodeAtlas:** `.codeatlas/tasks/` (ADR-025) already stores task state. A bounded, JSON-formatted progress record with pass/fail flags would match the pattern, with no new service needed.
- **Caveat:** The source is one team's internal experiments on a web-app build. Its end-to-end testing used browser tools, which CodeAtlas excludes (AGENTS.md §2). Only the file and git pattern carries over.

### 8.2 Repo map ranked by graph importance (Aider)
- Aider sends a map of files and key symbols with signatures, not full files. It ranks files with PageRank over a dependency graph and fits the result to a token budget (default 1k tokens, `--map-tokens`).
- The map lets the model see APIs in the whole repo before it reads any file, and it asks for specific files only when needed.
- **Fit for CodeAtlas:** Already largely built. `computePageRank` produces the persisted repo map (AGENTS.md §2, `codeatlas://repo-map`). The open item is whether the context package's evidence section uses it when assembling a task, rather than only the separate resource.

### 8.3 Surface *which tests to check*, not *how to do TDD* (TDAD, arXiv 2603.17973)
- A graph of code-to-test dependencies, plus a 20-line instruction file, reduced test regressions by about 70% (6.08% → 1.82%) and raised resolution from 24% to 32% on SWE-bench Verified, with two local models.
- **Surprise:** Adding TDD instructions alone *increased* regressions (to 9.94%). The authors conclude that smaller models benefit more from contextual information (which tests matter) than from procedural instructions (how to do TDD).
- **Impact on this plan:** Revise P6. Replace the generic "run the checks" paragraph with a concrete list of tests and commands tied to the changed files. Do not add a TDD procedure.
- **Caveat:** Small sample (100, 25, and 10 instances), Python-only benchmark, and two local models. Treat as a strong hypothesis, not a settled result. The 70% number is from the 100-instance run.

### 8.4 Ground rules for agents, not procedures
- Anthropic's harness phrased its rules strongly and specifically ("unacceptable to remove or edit tests"). Its feature list also reserved one field for agents to edit.
- **Applies to P4:** Keep rules few, specific, and about *what must not change*. Let the artifact enforce the rest.

---

## 9. Round 3: how other agents structure their context files

Focus: what developers actually write for coding agents, and how tools load it.

### 9.1 What developers write (Cursor rules study, MSR '26, arXiv 2512.18925)
- 401 public repos with 1,876 `.mdc` rule files (median repo created 2023; 51% TypeScript). Lines were coded into five themes and 20 sub-codes, with an LLM assisting the coding (Cohen's κ 0.64–0.71 against humans).
- **Most common themes (share of repos):** Guideline 89%, Project 85%, Convention 84%, LLM Directive 50%, Example 50%.
- **Most common sub-codes:** build/test/run commands (Env, 72%), architecture and module purpose (Functionality, 71%), QA and test requirements (68%), code style (65%).
- **Change notes (17% of repos)**, e.g. "no need for X anymore". The authors say these stop agents from using deprecated patterns, and that the information is usually not visible in the code. CodeAtlas could derive this from git history instead of asking users to write it.
- **Tension with §1:** Developers wrote long files (mean 463 lines, max 11,076). The study measures what people *write*, not what helps. It does not contradict the AGENTS.md result, but it does mean the study cannot justify length.
- **Fit for P6 and P4:** The most-written items are commands and test requirements, which matches the TDAD result in §8.3. Architecture overviews are common in user files, though §1 says generated ones should stay out by default. Keep the distinction: a user-authored file is a different input from a generated one.

### 9.2 A user-owned, read-only conventions file (Aider)
- Aider loads a `CONVENTIONS.md` with `/read` or `read:` in config. It is marked read-only, so it is cached when prompt caching is on, and it stays out of the edited-file set.
- **Fit for CodeAtlas:** Add an optional, user-owned conventions file as a stable-scaffold section (P8). The user writes it; CodeAtlas does not generate it. It is loaded verbatim up to a size cap, and its path is configured per project.
- **Caveat:** The Aider doc has one before/after example and no measurement. Treat the cache benefit as expected, not measured.

### 9.3 Mandatory memory-bank reads (Cline Memory Bank)
- Six Markdown files (`projectbrief`, `productContext`, `activeContext`, `systemPatterns`, `techContext`, `progress`). The agent must read all of them at the start of every task. The user triggers "update memory bank" when the context window fills.
- **Do not copy this.** Mandatory reads of six files add tokens on every task, which is the cost pattern §1 warns against. The files also duplicate `.codeatlas/tasks/` (ADR-025) and would be a parallel system (AGENTS.md §4.3).
- **Partial reuse:** The `activeContext` idea, a short "what changed last and what is next" note, matches §8.1. Keep it as one bounded, generated record in `.codeatlas/tasks/`, not six files read every time.

### 9.4 Proposed additions from round 3
- **P12 — User conventions file (optional).** Loaded verbatim into the stable scaffold, with a size cap. Off by default. Gate with §5.
- **P13 — Recent-change note from git.** A short, bounded summary of commits since the last session, derived from `git log`, not written by hand. Put it in the dynamic suffix. Gate with §5 (scope violations and wrong-API edits are the metrics to watch).
- **Not adopted:** Mandatory reads of all context files on every task (§9.3).

---

## 10. Sources

- Chroma, *Context Rot* — https://www.trychroma.com/research/context-rot
- Anthropic, *Effective context engineering for AI agents* — https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Anthropic, *How we built our multi-agent research system* — https://www.anthropic.com/engineering/multi-agent-research-system
- Anthropic, *Claude prompting best practices* — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Anthropic, *Prompting Claude Haiku 5.5* — https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5
- OpenAI, *Prompt engineering guide* — https://developers.openai.com/api/docs/guides/prompt-engineering
- Liu et al., *Lost in the Middle* — https://arxiv.org/abs/2307.03172
- Jaroslawicz et al., *IFScale* — https://arxiv.org/html/2507.11538v1
- Gloaguen et al., *Evaluating AGENTS.md* — https://arxiv.org/html/2602.11988v1
- Lumer et al., *Don't Break the Cache* — https://arxiv.org/html/2601.06007v2
- Anthropic, *Effective harnesses for long-running agents* — https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Aider, *Repository map* — https://aider.chat/docs/repomap.html
- Alonso, *TDAD: Test-Driven Agentic Development* — https://arxiv.org/html/2603.17973v1
- Jiang & Nam, *Beyond the Prompt: An Empirical Study of Cursor Rules* (MSR '26) — https://arxiv.org/html/2512.18925v2
- Aider, *Specifying coding conventions* — https://aider.chat/docs/usage/conventions.html
- Cline, *Memory Bank* — https://docs.cline.bot/best-practices/memory-bank

Relevant CodeAtlas docs: `docs/decisions/ADR-016-context-modes.md`,
`docs/decisions/ADR-014-context-item-hierarchy.md`,
`docs/decisions/ADR-026-token-efficient-model-strategy.md`,
`docs/reference/CONTEXT_SDK.md`.
