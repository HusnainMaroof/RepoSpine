# CodeAtlas AI Strengthening Report

**Deep research report and product direction**  
**Date:** 2026-10-16  
**Status:** Research complete; implementation requires staged approval  
**Question:** How can CodeAtlas make AI agents materially stronger at repository-level work without merely sending bigger prompts?

---

## 1. Executive answer

The central mistake would be to treat AI strength as a prompt-length problem.

A strong coding agent is not created by placing the whole repository, every rule,
and a long “think carefully” instruction into one context window. It is created
by controlling the full decision loop:

    task
      → understand the goal and constraints
      → retrieve likely evidence
      → expand only the evidence that needs explanation
      → act through a small, unambiguous tool surface
      → observe the result
      → verify against the environment
      → record the decision and unresolved state
      → continue, compact, or reset

CodeAtlas already implements much of the deterministic half of this loop:
indexing, parsing, graph relationships, ranked search, bounded context packages,
staleness signals, deny filtering, synthesis, planning, sufficiency, task
handoff, MCP access, and provider-independent orchestration.

The largest remaining opportunity is to turn those capabilities into an
adaptive **context-and-action control plane**:

1. retrieve with multiple signals rather than one flat relevance score;
2. represent code at several structural levels;
3. separate retrieval chunks from comprehension context;
4. keep prompts short, explicit, and stable;
5. let the agent fetch missing evidence just in time;
6. make tools easy to choose and hard to misuse;
7. verify outcomes in the real repository rather than trusting the final prose;
8. preserve only durable state across sessions;
9. measure the complete harness, not only the model response.

**Recommendation:** build an evidence-gated Context Delivery and Agent Control
Layer inside the existing SDK and session seams. Do not build a second agent loop,
a giant memory file, or a universal prompt template.

---

## 2. Research method and confidence

This report combines:

- direct inspection of CodeAtlas implementation and ADRs;
- the four earlier context-engineering reports;
- primary research papers and conference publications;
- official guidance from Anthropic and OpenAI on context, tools, agents, and
  evaluation;
- explicit separation between measured findings, design hypotheses, and
  CodeAtlas-specific conclusions.

### Evidence labels

- **Established:** repeatedly supported by controlled research or official
  engineering results.
- **Strong hypothesis:** plausible and supported, but likely workload-dependent.
- **CodeAtlas fact:** observed in the current repository.
- **Design proposal:** recommended change, not implemented.
- **Needs evaluation:** should not become a default based on external evidence.

### Important caveat

External results do not directly predict CodeAtlas performance. Long-context
benchmarks, code-completion benchmarks, and vendor engineering reports use
different models, repositories, prompts, graders, and environments. They guide
the experiment design; they do not set CodeAtlas release claims.

---

## 3. What “stronger AI” actually means

A stronger system is not simply one that produces more confident text. For
repository work, strength has at least eight dimensions:

1. **Localization:** finds the correct files, symbols, tests, and call paths.
2. **Grounding:** distinguishes observed code from assumptions.
3. **Coverage:** includes the dependencies and callers needed for the task.
4. **Instruction adherence:** obeys scope, security, architecture, and output
   requirements.
5. **Tool competence:** chooses the right tool and supplies valid arguments.
6. **Execution discipline:** makes small changes, checks results, and recovers
   from failure.
7. **Long-horizon continuity:** preserves decisions without carrying noisy
   transcripts forever.
8. **Calibration:** reports uncertainty, missing evidence, stale context, and
   failed verification honestly.

These dimensions trade off against one another. More evidence can improve
coverage while reducing attention and increasing cost. More instructions can
improve explicitness while increasing instruction conflict. More tools can
increase capability while making tool selection harder. More memory can improve
continuity while preserving stale or poisoned information.

The product must optimize the vector, not a single score.

---

## 4. Research findings

### 4.1 Long context is capacity, not comprehension

The “Lost in the Middle” study found that language models often use relevant
information best when it occurs near the beginning or end of a long input and
worse when the same information is placed in the middle. The result applies
even to models advertised for long contexts.

OpenAI’s current optimization guidance makes the same practical point: long
context should be evaluated at different sizes because a model may fail to
attend uniformly across a large prompt.

**Implication for CodeAtlas:** a context window is not a flat bucket. The
renderer must preserve critical task state and evidence visibly, but it must not
assume that moving every important item to a prompt edge will always help.
Ordering is a hypothesis to test by model, task, and package size.

Sources:

- [Lost in the Middle](https://arxiv.org/abs/2307.03172)
- [OpenAI: Optimizing LLM accuracy](https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy)
- [OpenAI GPT-4.1 prompting guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide)

### 4.2 Context pollution is broader than token overflow

Anthropic describes context as a finite attention budget. The problem is not
only hitting a hard token limit. Context can become less useful when it contains:

- irrelevant retrievals;
- duplicate explanations of the same file;
- stale observations;
- raw tool output that no longer matters;
- conflicting instructions;
- too many tools with overlapping affordances;
- large histories that bury current state.

Anthropic recommends the smallest set of high-signal tokens, just-in-time
retrieval, tool-result clearing, compaction, and structured note-taking.

**Implication:** CodeAtlas should optimize the information state delivered at
each step, not construct one maximal package at the beginning of a task.

Source:

- [Anthropic: Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### 4.3 Retrieval quality and presentation quality are separate problems

A system can retrieve the right file but present it in a way that makes the
model miss the answer. It can also present beautifully structured context that
does not contain the relevant code.

Treat the pipeline as two distinct objectives:

    retrieval quality  = did we select the right evidence?
    delivery quality   = can the agent use that evidence correctly?

CodeAtlas currently has a strong deterministic retrieval foundation. The next
gains should not be hidden inside a vague “prompt middleware” label. They should
be measured separately:

- candidate recall before budget;
- selected-evidence recall after budget;
- evidence attribution in the output;
- task success after delivery;
- tool steps and verification outcomes.

### 4.4 Chunking has two different jobs

A retrieval chunk is optimized to be found. A comprehension unit is optimized
to be understood.

Those are often not the same size.

Recent code-retrieval research supports this distinction:

- **CAST** finds that AST-aware chunking preserves syntactic integrity and
  improves retrieval and retrieval-augmented generation compared with fixed-size
  chunks.
- **Late Code Chunking (LC²)** uses one context for retrieval and a later,
  expanded context for comprehension; it reports a statistically significant
  improvement on CrossCodeEval, but the result is benchmark-specific.
- Both lines of work caution that a small fragment can lose the surrounding
  class, module, call, type, or behavioral context required for interpretation.

**Recommended model:**

    index unit       = small, searchable, code-structured unit
    selection unit   = symbol + metadata + graph neighborhood
    delivery unit    = symbol/range plus only the necessary parent and dependency context
    deferred unit    = exact pointer that can be fetched later

Do not use fixed token windows as the primary unit for parsed code. Keep a
bounded line-window fallback for unsupported languages or broken parses.

Sources:

- [CAST: Enhancing Code Retrieval-Augmented Generation](https://aclanthology.org/anthology-files/anthology-files/pdf/findings/2025.findings-emnlp.430.pdf)
- [Late Code Chunking](https://aclanthology.org/2026.acl-short.64/)
- [Retrieval Augmented Generation for Projects](https://aclanthology.org/2025.naacl-long.7.pdf)

### 4.5 Semantic context must be added carefully

Anthropic’s Contextual Retrieval work reports improved retrieval when each
chunk receives short, chunk-specific context before indexing, and when lexical
and semantic retrieval are combined with reranking.

The useful principle is not “summarize every chunk with an LLM.” It is:

> A fragment should carry enough stable identity and surrounding meaning to be
> retrievable without turning the index into generated prose.

For CodeAtlas, contextual metadata can be deterministic first:

- repository-relative path;
- module/package name;
- language;
- enclosing class or namespace;
- symbol kind and signature;
- exported/imported names;
- direct callers and callees;
- test associations;
- summary identifier;
- commit/index timestamp.

AI-generated chunk explanations may be useful later, but they add cost,
staleness, privacy exposure, and a second source of truth. They should be an
experiment, not a default preprocessing step.

Source:

- [Anthropic: Introducing Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)

### 4.6 Hybrid retrieval beats one retrieval signal

Technical repository tasks use exact identifiers and conceptual language at the
same time.

Examples:

- exact: createContextSDK, ADR-026, ERR_INVALID;
- conceptual: “where is stale context handled?”;
- structural: “what calls the parser registry?”;
- behavioral: “why does this retry loop never terminate?”

A single lexical scorer misses conceptual matches. A single embedding scorer can
miss rare identifiers. A graph-only strategy can follow the wrong seed.

**Recommended candidate retrieval:**

    candidate pool =
        lexical identifier search
      + semantic/conceptual search when available
      + symbol/name resolution
      + summary and documentation search
      + dependency/caller/callee expansion
      + task-category signals
      + changed-file and test signals

Then normalize and rerank the candidate pool with deterministic, explainable
features before budgeting.

Do not add a vector database as a prerequisite. CodeAtlas should first measure
the gain from hybrid candidate generation using existing search, summaries,
symbols, and graph data. A future embedding adapter can sit behind an existing
port if the evaluation proves value.

### 4.7 Agent tools are part of the context

Tool definitions, descriptions, schemas, and results all consume attention.
Anthropic reports that tool definitions alone can consume substantial context
in large tool catalogs and recommends search or on-demand tool loading at scale.

The tool surface should therefore be designed like an interface for a
non-deterministic caller:

- names must be unambiguous;
- descriptions must state purpose, input, output, limits, and non-goals;
- sibling tools must have distinct selection boundaries;
- errors must explain how to recover;
- results should be compact, typed, and attributable;
- read and write operations must be visibly separate;
- the advertised order should be deterministic.

**Implication:** strengthening AI is not only a prompt-rendering task. MCP
surface design can produce more lift than adding another paragraph to the
system prompt.

Sources:

- [Anthropic: Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Anthropic: Advanced tool use](https://www.anthropic.com/engineering/advanced-tool-use)

### 4.8 “Teaching” is better done through affordances and feedback

A model does not become reliable because it is told “be careful” 20 times.
Teaching an agent means shaping the environment so the correct behavior is:

1. easy to discover;
2. easy to execute;
3. hard to confuse with a neighboring behavior;
4. immediately checkable;
5. recoverable when it fails.

The highest-value teaching mechanisms are:

- a short task contract;
- relevant evidence with provenance;
- precise tool schemas;
- examples of successful tool use for ambiguous operations;
- explicit scope and verification;
- actionable tool errors;
- deterministic state and clear failure transitions;
- post-action feedback from tests, lints, or repository checks;
- a bounded progress artifact for the next context window.

Avoid prescribing hidden chain-of-thought or requiring a model to emit private
scratchpad content. The product needs verifiable actions and concise state,
not exposure of internal reasoning.

### 4.9 Decomposition works when it reduces uncertainty

Task decomposition is useful when each step has a distinct objective and a
checkable result. It is harmful when it turns one task into many administrative
prompts with no new information.

Good decomposition:

    1. locate the failure path
    2. verify the relevant implementation and contract
    3. make the smallest change
    4. run the relevant check
    5. inspect the failure or record success

Bad decomposition:

    1. think deeply
    2. think again
    3. summarize the thinking
    4. restate the prompt
    5. produce another plan

Anthropic’s long-running harness work supports incremental feature-sized work,
structured handoff artifacts, clean context boundaries, and evaluator feedback.
For CodeAtlas, the deterministic planner and verifier should provide the
structure; the model should retain freedom over implementation details.

Sources:

- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic: Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)

### 4.10 Verification is the strongest teacher

The agent’s final answer is not the task outcome. The repository state is.

A reliable loop uses progressively stronger checks:

- schema validation and path safety;
- relevant unit tests;
- typecheck and lint;
- build or package verification;
- focused integration checks;
- changed-file and dependency impact review;
- user-visible or end-to-end checks when applicable.

The verifier should return structured failure information that becomes the next
agent observation. “Run tests” is weaker than “run these tests because they
cover the changed symbols; here is the exact failure and the affected file.”

Anthropic’s agent-evaluation guidance similarly emphasizes grading the resulting
environment state, not trusting the agent’s claim that it succeeded.

Source:

- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### 4.11 Long-horizon strength requires state transitions

A long task should not be treated as one enormous conversation.

The durable unit should be a task state machine:

    planned
      → exploring
      → evidence-confirmed
      → editing
      → verifying
      → blocked | complete
      → handed-off or resumed

Each transition should record only what the next step needs:

- objective;
- current scope;
- decisions and evidence;
- attempted changes;
- failures;
- unresolved questions;
- verification status;
- next action.

Raw transcripts, duplicate tool results, and old exploratory prose should be
discarded or compacted after their durable facts are extracted.

Anthropic’s long-running and managed-agent work treats sessions as append-only
logs and separates session, harness, and sandbox interfaces. That is directly
compatible with CodeAtlas’s existing task-ledger and provider-independent
session seams.

Sources:

- [Anthropic: Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic: Decoupling the brain from the hands](https://www.anthropic.com/engineering/managed-agents)

### 4.12 Security is part of intelligence

A system that retrieves more context but allows untrusted repository text to
override the user’s task is not stronger.

Prompt injection can appear in source comments, documentation, tests, generated
files, tool output, or external data. Filtering suspicious strings is not
sufficient by itself; the system must constrain what untrusted content can do.

CodeAtlas should enforce:

- repository text is data, never policy;
- policy comes from the user, trusted project instructions, and system rules;
- evidence carries provenance and trust classification;
- tools enforce authorization independently of model instructions;
- secrets and denied paths are filtered before rendering and logging;
- writes require explicit authorization;
- verification checks actual state;
- suspicious instructions are surfaced as data or omitted, not executed.

Source:

- [OpenAI: Designing AI agents to resist prompt injection](https://openai.com/index/designing-agents-to-resist-prompt-injection/)

---

## 5. What CodeAtlas has already built

The current repository is substantially beyond a basic RAG prototype.

### Retrieval and representation

- deterministic scanner, hashing, parser, graph, storage, and search pipeline;
- TypeScript/JavaScript parsing plus tree-sitter language support;
- symbol locations and line ranges;
- project, file, folder, and module summaries;
- explicit identifier resolution;
- bounded graph traversal from strong seeds;
- PageRank-backed repository map;
- task-category reranking;
- dependency evidence with attribution paths.

### Context assembly

- ContextPackage as the provider-independent delivery object;
- full, digest, brief, and off modes;
- automatic mode selection by repository size;
- bounded item and token budgets;
- critical/instruction/digest protection rules;
- staleness reporting;
- deny filtering and exclusion records;
- truncation and dropped-item reporting;
- deterministic synthesis for digest mode;
- sufficiency, planning, critique, and verification-related signals.

### Agent and delivery infrastructure

- createContextSDK as the consumer read interface;
- Context → Agent integration;
- launch/attach/handoff;
- task ledger;
- session manager;
- external CLI adapters;
- MCP tools, resources, and structured results;
- usage tracking with actual/estimated/unknown states;
- provider isolation;
- secure argument-array process execution.

This matters because the missing work is not “build an AI brain from zero.”
The high-value work is to connect existing deterministic evidence into a
feedback-controlled agent workflow.

---

## 6. Verified limitations in the current delivery path

The following are implementation observations, not assumptions.

### 6.1 The renderer is primarily a linear presentation

renderContextPackage() emits:

1. task;
2. repository/staleness notes;
3. optional synthesis;
4. ordered item headings and contents;
5. budget and exclusion footer.

This is readable Markdown, but it does not yet express a strong distinction
between:

- trusted operational instructions;
- repository-derived data;
- deterministic engine conclusions;
- unresolved evidence;
- verification contract;
- final response requirements.

### 6.2 The package is ranked, but not yet an evidence plan

Assembly orders instructions, digest, overview, and ranked context. It also adds
summaries, dependencies, and bounded traversal. That is a strong selection
foundation.

However, ranked items do not automatically form a coherent investigation path.
The agent still needs to know:

- which item is the seed;
- which items are callers, callees, tests, or alternatives;
- which evidence confirms or contradicts the synthesis;
- which item should be read next if the package is insufficient.

### 6.3 Structural ranges exist, but full-file delivery remains common

CodeAtlas has symbol line ranges and sliceContentByRanges(). The assembly
model carries ranges and brief pointers. The full renderer still renders each
selected item’s content as supplied, so range-aware selection and
range-aware delivery are not yet the same policy.

The product should not blindly slice every file. It should choose among:

- symbol body;
- enclosing type/module outline;
- relevant line window;
- full file when the task requires global structure;
- pointer-only item for deferred reading.

### 6.4 Budget enforcement is safe but mostly subtractive

The budget records truncation and dropped items and protects essential classes.
That is good operational behavior.

The next step is utility-aware allocation:

- reserve a budget for the task contract and evidence metadata;
- preserve at least one complete answer-bearing unit;
- shrink lower-value context before dropping it;
- avoid duplicating a symbol body and the same file body;
- report the reason for every omission;
- allow deferred retrieval of omitted items.

### 6.5 Computed signals are not yet a compact operating playbook

CodeAtlas computes task categories, sufficiency, synthesis, hierarchy, staleness,
and budget outcomes. The agent needs a compact, model-facing rendering of those
signals:

- “Evidence is sufficient for a targeted fix.”
- “The index is stale; verify these two files.”
- “The conclusion is based on these three graph edges.”
- “The package is incomplete; fetch the listed ranges before editing.”
- “Run these checks before claiming completion.”

### 6.6 MCP tool discipline is partly encoded in descriptions

The MCP server has rich tool descriptions and structured output. Some workflow
discipline is currently described in free text. That is fragile because:

- descriptions consume context;
- overlapping instructions can conflict;
- descriptions are not a substitute for server-side budgets;
- agent behavior cannot safely be enforced by prose alone.

Tool contracts, structured errors, budgets, and prompts should carry the
behavioral guidance in a smaller and more testable form.

### 6.7 Evaluation is the current bottleneck

CodeAtlas has many unit and integration tests for deterministic behavior. That
does not yet prove that a model completes repository tasks better with the
assembled context.

The missing artifact is a local evaluation suite that can answer:

- did the agent find the right evidence?
- did it use fewer or better tool calls?
- did it make the correct change?
- did it verify the result?
- did it avoid denied content and out-of-scope edits?
- did the change work across model sizes and providers?

---

## 7. The proposed architecture: Adaptive Context Control

Do not add a parallel middleware subsystem. Extend the existing
context-integration and session seams with five cooperating responsibilities.

    task + repository
          |
          v
    task understanding
    category / scope / tests
          |
          v
    candidate retrieval
    lexical + symbol + graph + summaries
          |
          v
    evidence planning
    seed / dependency / test / coverage / confidence
          |
          v
    budgeted delivery
    structured sections / pointers / ranges
          |
          v
    external agent / MCP
          |
          v
    observation + verification
    tests / diff / state
          |
          v
    task state / next retrieval / handoff

### Responsibility A: Task understanding

Derive a compact task contract:

- objective;
- task category;
- requested output;
- permitted scope;
- likely tests or verification;
- explicit identifiers and paths;
- ambiguity or missing information.

Do not use an LLM for the first version. Use existing classifier, explicit
resolution, project instructions, and caller-supplied scope. If an AI query
rewriter is later tested, it must be optional and its generated terms must be
treated as candidates, not truth.

### Responsibility B: Candidate retrieval

Build a diverse candidate pool from:

- exact identifier search;
- lexical search;
- semantic retrieval if enabled;
- symbols and definitions;
- summaries and documentation;
- dependency edges;
- callers/callees;
- related tests;
- recent changes or diff scope;
- task category.

Preserve the source of each candidate. Retrieval diversity is useful only if
the next stage can remove duplicates and explain selection.

### Responsibility C: Evidence planning

Convert candidates into a small evidence graph:

- **seed:** directly matches the task;
- **definition:** defines the target behavior;
- **caller:** invokes it;
- **callee/dependency:** behavior it relies on;
- **test:** asserts the contract;
- **constraint:** project/security rule;
- **alternative:** similar implementation that could confuse the agent;
- **background:** useful only if the task requires it.

This is more useful than a flat score because it tells the agent why each item
exists and what relationship must be checked.

### Responsibility D: Budgeted delivery

Render a packet with:

1. task contract;
2. constraints and trust boundary;
3. compact repository orientation;
4. evidence map;
5. selected evidence;
6. missing/deferred evidence;
7. verification contract;
8. short final reminder.

Every item should carry:

- path;
- line or symbol range;
- item role;
- selection reason;
- confidence;
- freshness;
- truncation state;
- relationship to the seed;
- deferred-read pointer if not fully included.

### Responsibility E: Observation and state

After each agent action, record structured observations:

- tool call and arguments;
- changed paths;
- test/build result;
- failure category;
- new evidence;
- unresolved question;
- next recommended action.

Do not retain every raw result forever. Keep the durable facts and a pointer to
the original artifact when necessary.

---

## 8. How to handle a very large prompt

### 8.1 Use progressive disclosure, not one giant prompt

For a large repository, the first packet should be a map and a starting set of
evidence, not all source files.

A practical sequence:

**Stage 0 — Contract**

- task;
- scope;
- security rules;
- expected completion evidence.

**Stage 1 — Orientation**

- repository digest;
- relevant package/module map;
- target symbols and tests;
- known staleness or exclusions.

**Stage 2 — Answer-bearing evidence**

- target symbol or exact file region;
- closest caller/callee;
- contract test;
- directly relevant instruction.

**Stage 3 — Conditional expansion**

- fetch a related file only if the agent identifies a missing dependency;
- expand a parent type or module only if the selected symbol is ambiguous;
- fetch a broader file only when local evidence cannot establish behavior.

**Stage 4 — Verification**

- run the smallest relevant check;
- expand only on failure;
- preserve the failure as structured next-step context.

### 8.2 Separate “map” from “body”

A repository map should be cheap enough to include early:

- path;
- package/module;
- exported symbols;
- signatures;
- graph importance;
- test associations.

Bodies should be pulled only for the symbols and ranges that answer the task.
This lets the model ask a precise next question instead of guessing from a
large dump.

### 8.3 Use multi-resolution evidence

Each code item should have several representations:

    L0: path + symbol signature + one-line role
    L1: outline + imports/exports + direct relationships
    L2: symbol body or exact range
    L3: enclosing type/module context
    L4: full file or broader dependency chain

The default packet uses L0–L2. L3–L4 are escalation levels.

This is better than choosing “full mode” or “digest mode” as the only decision.
Repository size is a useful signal, but task ambiguity, model capability, and
evidence sufficiency matter too.

### 8.4 Do not chunk instructions like code

Instructions and constraints should remain short, stable, and intact. Chunking
is for evidence, not for splitting policy across arbitrary boundaries.

Keep policy in one place with:

- task;
- scope;
- security;
- output contract;
- verification.

Keep repository content in separately labeled, untrusted evidence containers.

### 8.5 Preserve high-value adjacency

The best evidence is not always the highest-scoring isolated fragment. For code,
the surrounding contract may be more valuable than another lexical match.

A selection should prefer a small coherent neighborhood:

    target definition
    + direct caller or entry point
    + relevant test or type contract
    + one dependency when behavior crosses a boundary

Do not include a whole dependency closure by default. Expand one relationship at
a time and stop when the sufficiency gate is satisfied.

### 8.6 Use late enrichment

Retrieve a compact unit first. After selection, enrich it with only the
context needed to understand it:

- parent class/module;
- imports and exports;
- signature and documentation;
- caller/callee labels;
- test names;
- summary facts.

This follows the retrieval/comprehension distinction in recent code-chunking
research and avoids indexing every possible large context combination.

### 8.7 Make omitted context actionable

A dropped item should not disappear silently. Return:

- what was omitted;
- why it was omitted;
- where it lives;
- how to request it;
- whether it is required or optional.

The agent should see “the implementation body for X was deferred; read
path.ts:L40-L89 if the signature is insufficient,” not merely “context
truncated.”

---

## 9. How to teach the AI to work best

### 9.1 Give it a contract, not a lecture

The task contract should contain:

- objective;
- scope;
- evidence policy;
- safety boundary;
- completion definition;
- verification command or expected check;
- response format.

Keep it short enough that the model can retain it. Avoid a long list of
generic virtues.

### 9.2 Show the environment’s affordances

An agent performs better when it knows what each tool is good for.

Examples should teach distinctions such as:

- search for discovery;
- symbol lookup for definitions;
- range read for exact evidence;
- dependency query for relationship tracing;
- context build for a bounded package;
- verifier for outcome confirmation.

Examples should be few and canonical. Do not include a catalog of every edge case.

### 9.3 Return errors that teach recovery

Weak error:

    Invalid query

Useful error:

    Query must contain at least two non-stopword terms or one identifier.
    No search was performed. Try createContextSDK, context integration, or
    provide a path/symbol.

The server should make recovery obvious without embedding “always call this
tool first” behavior in every description.

### 9.4 Make uncertainty explicit

The agent should receive distinct states:

- confirmed;
- likely;
- unresolved;
- stale;
- truncated;
- denied;
- contradicted.

A single confidence score is not enough. A low score can mean weak retrieval,
stale content, or an unresolved conflict. The reason matters.

### 9.5 Use the model as a bounded executor

CodeAtlas should own deterministic work:

- ranking;
- filtering;
- graph traversal;
- budgets;
- path safety;
- verification policy;
- state transitions.

The model should own judgment that benefits from language understanding:

- interpreting the user’s intent;
- deciding which evidence matters;
- choosing among valid implementation options;
- explaining trade-offs;
- adapting after tool results.

This division avoids using a model to recreate facts CodeAtlas already knows.

### 9.6 Use evaluator separation selectively

A separate evaluator can catch errors the generator rationalizes away, especially
for long or subjective tasks. It also adds cost, latency, and another source of
failure.

Use evaluator passes only when:

- the task has a clear rubric;
- the result is expensive or difficult to reverse;
- ordinary tests do not cover the quality dimension;
- baseline data shows the evaluator improves outcomes enough to justify cost.

For ordinary small fixes, focused verification is preferable to an additional
agent.

### 9.7 Reset around durable artifacts

When the task grows long, do not ask the same context to carry all history.
Write a compact handoff artifact and start a fresh context with:

- current objective;
- completed work;
- decisions;
- failures;
- changed files;
- verification result;
- next action;
- pointers to detailed evidence.

A fresh context can remove accumulated distraction, but a reset is safe only
when the handoff artifact is complete enough to resume.

---

## 10. What should not be built

### 10.1 Do not build a universal prompt sandwich as a doctrine

Putting instructions at both ends can help some long-context tasks and models.
It can also duplicate tokens, create conflicts, or make the prompt harder to
maintain.

Use a small final task reminder and evaluate placement. Do not hard-code a global
U-curve strategy as a law.

### 10.2 Do not mandate scratchpads

Private reasoning is not a product interface. A forced scratchpad can add
tokens, leak sensitive reasoning, and encourage ritual instead of verification.

Request concise plans, evidence citations, action summaries, and verification
results.

### 10.3 Do not use generated summaries as unquestioned truth

Summaries can be stale, incomplete, or wrong. Keep their provenance and let
source evidence win when it contradicts a summary.

### 10.4 Do not add embeddings before measuring the current system

Hybrid semantic retrieval may help. It also adds indexing cost, model
dependencies, freshness concerns, and operational complexity.

First establish a lexical/symbol/graph baseline and a failure corpus. Add
semantic retrieval where the failures demonstrate a need.

### 10.5 Do not keep every tool visible forever

A large tool catalog is itself context. Keep the stable core small. At larger
scales, use deterministic search and on-demand schema loading.

### 10.6 Do not treat memory as a second instruction file

Memory is evidence about prior work, not authority. It requires provenance,
supersession, scope, retention, and write authorization.

### 10.7 Do not evaluate only the final text

The final answer can sound correct while the repository is wrong. Grade:

- environment state;
- tests;
- changed files;
- scope;
- evidence citations;
- tool sequence;
- token/cost efficiency;
- honest failure reporting.

---

## 11. Evaluation program

### 11.1 Build a local task corpus

Start with 40–60 tasks over representative CodeAtlas fixtures:

- symbol lookup;
- architecture explanation;
- bug localization;
- targeted bug fix;
- parser or resolver change;
- security review;
- refactor with scope constraint;
- failing test diagnosis;
- multi-file dependency change;
- stale-index recovery;
- denied-content safety;
- handoff and resume.

Each task should include:

- prompt;
- repository commit;
- expected answer-bearing files/symbols;
- acceptable tool paths;
- required verification;
- deterministic outcome checks;
- prohibited scope;
- optional distractors.

### 11.2 Evaluate in layers

**Layer 1 — Retrieval**

- candidate recall;
- selected recall;
- symbol/range correctness;
- graph relationship coverage;
- duplicate rate;
- stale/denied handling.

**Layer 2 — Delivery**

- evidence attribution;
- instruction adherence;
- missing-evidence detection;
- context-size efficiency;
- package determinism.

**Layer 3 — Agent behavior**

- tool selection;
- argument correctness;
- unnecessary calls;
- recovery from errors;
- scope adherence;
- verification completion.

**Layer 4 — Outcome**

- tests/build state;
- changed-file correctness;
- task completion;
- regression rate;
- final-report honesty.

### 11.3 Use ablations

Every proposed improvement should be compared against the same baseline:

- flat full-file context;
- current CodeAtlas package;
- current package plus structured renderer;
- symbol/range delivery;
- graph neighborhood;
- hybrid retrieval;
- late enrichment;
- progressive disclosure;
- compact handoff;
- evaluator pass.

Do not combine five changes and then claim each one helped.

### 11.4 Use multiple context sizes

Run every important task at at least:

- small;
- medium;
- large;
- over-budget/truncated.

Measure where performance bends. A technique that helps at 8k tokens but
hurts at 32k is not universally good.

### 11.5 Use multiple model classes

At minimum compare:

- a frontier reasoning model;
- a strong general model;
- a smaller/local coding model.

The system should not overfit to one provider. A capability hint may eventually
select a delivery policy, but the hint must describe model behavior, not vendor
names.

### 11.6 Inspect traces, not only scores

A score can hide:

- a grader that rewards verbosity;
- a task that accidentally exposes the answer;
- a model that used an unintended shortcut;
- a harness bug;
- shared state between trials;
- a verifier that failed to detect a bad patch.

Keep isolated environments, full tool traces, changed-file manifests, and
reproducible seeds where applicable.

---

## 12. Phased product roadmap

### Phase 0 — Baseline and observability

**Goal:** know what “better” means.

Deliver:

- local task corpus;
- golden packages;
- retrieval and outcome metrics;
- full tool/session trace recording with secret redaction;
- isolated trial runner;
- baseline report.

**Ship gate:** baseline is reproducible offline.

### Phase 1 — Delivery contract

**Goal:** make current evidence easier to use.

Deliver:

- structured sections;
- trusted-policy versus untrusted-evidence boundary;
- provenance and role metadata;
- final task/output reminder;
- explicit stale, truncated, denied, and unresolved states;
- compatibility renderer.

**Ship gate:** no regressions in existing consumers, no denied-content leakage,
deterministic output.

### Phase 2 — Multi-resolution code evidence

**Goal:** give the agent the right amount of code.

Deliver:

- L0–L4 representations;
- symbol/range-first file delivery;
- coherent target + caller + test neighborhoods;
- pointer-based deferred reads;
- shrink-before-drop budget allocation;
- duplicate suppression with explanations.

**Ship gate:** selected evidence recall and task success are no worse than
baseline under the same token budget.

### Phase 3 — Adaptive retrieval

**Goal:** improve hard localization cases.

Deliver:

- candidate pool from lexical, symbol, summary, graph, and tests;
- deterministic rank fusion;
- evidence-role labeling;
- optional semantic retrieval adapter;
- optional contextual metadata for indexing;
- query decomposition only as a measured experiment.

**Ship gate:** hard-task recall improves without unacceptable latency, cost, or
privacy regression.

### Phase 4 — Agent tool teaching

**Goal:** reduce tool confusion and wasted calls.

Deliver:

- compact tool descriptions;
- accurate annotations;
- typed actionable errors;
- deterministic advertised order;
- default call/range budgets;
- prompt or playbook capability for workflows;
- on-demand schema discovery when the catalog grows.

**Ship gate:** tool-selection accuracy and token efficiency improve; no write
capability is accidentally exposed.

### Phase 5 — Verification loop

**Goal:** convert actions into reliable outcomes.

Deliver:

- task-specific verification selection;
- structured failure observations;
- changed-file and impact checks;
- retry/escalation policy;
- completion contract that requires evidence;
- optional independent evaluator for eligible tasks.

**Ship gate:** outcome correctness improves, not merely final-response quality.

### Phase 6 — Long-horizon continuity

**Goal:** maintain coherence across sessions.

Deliver:

- task state machine;
- append-only bounded handoff events;
- decision/failure/verification projection;
- transcript/result compaction;
- fresh-context reset policy;
- cross-provider resume tests.

**Ship gate:** resumed tasks retain key decisions and do not inherit stale or
irrelevant history.

### Phase 7 — Governed memory and advanced routing

**Goal:** add durable learning only when justified.

Possible deliverables:

- opt-in typed memory events;
- scoped recall and supersession;
- point-of-action warnings;
- model-capability delivery profiles;
- learned routing only after enough evaluation data.

**Ship gate:** ADR, threat model, retention policy, security tests, and measured
benefit.

---

## 13. Delegation

| Owner | Responsibility | First proof |
|---|---|---|
| Context architecture | packet contract, evidence roles, renderer seam | golden structured package |
| Retrieval | hybrid candidates, symbol/range units, graph neighborhoods | recall report |
| Budgeting | multi-resolution allocation and deferred pointers | cost/recall ablation |
| MCP/tooling | tool contracts, errors, annotations, discovery | tool-selection eval |
| Verification | task checks, failure observations, outcome grading | environment-state report |
| Sessions | handoff, compaction, reset, resume | cross-session fixture |
| Security | trust boundaries, deny filter, injection resistance | hostile-content suite |
| Evaluation | corpus, isolation, metrics, trace review | baseline and regression dashboard |
| Product/CTO | scope, default-on decisions, release bar | written ship/no-ship decision |

---

## 14. Release decision

### Minimum bar for structured context

- deterministic output;
- all existing tests pass;
- no secret or denied content appears;
- no scope or architecture regression;
- evidence attribution is inspectable;
- package cost is bounded;
- baseline comparison exists.

### Minimum bar for adaptive retrieval

- hard-task retrieval recall improves;
- no unacceptable stale or duplicate evidence increase;
- latency and index cost are measured;
- semantic components are optional and isolated;
- failures remain explainable.

### Minimum bar for agent teaching

- tools are easier to select in traces;
- error recovery improves;
- unnecessary calls decrease;
- default permissions remain safe;
- no behavior depends only on prose instructions.

### Minimum bar for long-horizon work

- handoff preserves decisions, failures, scope, and verification;
- compaction is tested at boundaries;
- fresh-context recovery succeeds;
- stale memory is surfaced, not silently trusted.

### Current CTO decision

**Proceed with Phases 0–2. Keep them opt-in until the local evaluation proves
benefit.**

**Do not build a native model/tool loop.** CodeAtlas’s durable advantage is
provider-neutral context, graph-aware evidence, policy, verification, and
orchestration.

**Defer embeddings, generated chunk summaries, agent memory write-back,
multi-agent evaluators, and learned model routing until the baseline identifies
a failure they solve.**

---

## 15. Final product shape

The long-term CodeAtlas product should feel like this to an agent:

1. **Understand:** receive a small contract and a map of relevant evidence.
2. **Inspect:** read the target symbol and its nearest behavioral neighborhood.
3. **Decide:** state the evidence-backed hypothesis and scope.
4. **Act:** make a minimal change through the external agent’s normal tools.
5. **Observe:** receive structured test, diff, and freshness results.
6. **Correct:** expand context only when the evidence says it is missing.
7. **Verify:** prove the outcome in the repository.
8. **Handoff:** preserve decisions and unresolved state, not the whole transcript.

That is how CodeAtlas makes AI stronger: not by making the model pretend to know
more, but by ensuring that every action begins with the right evidence, has the
right affordances, and ends with a checkable result.

---

## 16. Sources

### Long-context and prompting

- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172)
- [OpenAI Prompt Engineering Guide](https://developers.openai.com/api/docs/guides/prompt-engineering)
- [OpenAI Optimizing LLM Accuracy](https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy)
- [OpenAI GPT-4.1 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide)
- [Anthropic Effective Context Engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)

### Retrieval and chunking

- [Anthropic Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)
- [CAST: Enhancing Code Retrieval-Augmented Generation](https://aclanthology.org/anthology-files/anthology-files/pdf/findings/2025.findings-emnlp.430.pdf)
- [Late Code Chunking](https://aclanthology.org/2026.acl-short.64/)
- [Retrieval Augmented Generation for Projects](https://aclanthology.org/2025.naacl-long.7.pdf)
- [SWE-QA: Repository-Level Code Question Answering](https://aclanthology.org/2026.findings-acl.402.pdf)
- [Question Decomposition for RAG](https://arxiv.org/abs/2507.00355)

### Tools, harnesses, and long-running agents

- [Anthropic Writing Effective Tools](https://www.anthropic.com/engineering/writing-tools-for-agents)
- [Anthropic Advanced Tool Use](https://www.anthropic.com/engineering/advanced-tool-use)
- [Anthropic Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Anthropic Harness Design for Long-Running Application Development](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [Anthropic Decoupling the Brain from the Hands](https://www.anthropic.com/engineering/managed-agents)
- [Anthropic Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

### Security

- [OpenAI Designing AI Agents to Resist Prompt Injection](https://openai.com/index/designing-agents-to-resist-prompt-injection/)

### CodeAtlas implementation references

- docs/architecture/CONTEXT.md
- docs/reference/CONTEXT_SDK.md
- docs/decisions/ADR-014-context-item-hierarchy.md
- docs/decisions/ADR-016-context-modes.md
- docs/decisions/ADR-025-task-ledger-handoff.md
- docs/decisions/ADR-026-token-efficient-model-strategy.md
- packages/sdk/src/context-integration/assemble.ts
- packages/sdk/src/context-integration/budget.ts
- packages/sdk/src/context-integration/render.ts
- packages/sdk/src/context-integration/slice.ts
- packages/mcp/src/tools.ts
- packages/mcp/src/server.ts

