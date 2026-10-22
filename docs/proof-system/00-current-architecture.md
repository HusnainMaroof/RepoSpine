# Current architecture audit

## Audit baseline

The inspected worktree was `update_features`, commit `b42077f`, with an unrelated
untracked `experiments/` directory. `main` was `9d7f876`; the branch adds the
experimental control plane, WorkPacket, bounded task events and associated
tests/docs. No branch checkout or history rewrite was required. The local
context database existed. The installed global `atlas doctor --json` failed
because its installed `tree-sitter.wasm` was absent; conclusions therefore use
source/tests rather than treating that CLI result as a healthy index.

## Existing data flow

```text
User / agent
  -> CLI / MCP / extension / ChatGPT adapter
  -> SDK (composition and stable read API)
  -> scanner -> hashing -> parser -> graph -> storage
  -> search -> context ranking / package assembly
  -> WorkPacket / agent session / optional verifier
```

`packages/scanner/src/scanner.service.ts` discovers metadata with ignore rules;
`manifest.ts` records branch, HEAD and origin through argument-array Git calls.
`packages/hashing/src/snapshot.ts` and `diff.ts` calculate SHA-256 snapshots and
changed/added/deleted/unchanged paths. There was no semantic diff engine or Git
history/co-change implementation. A hash delta is not a Git hunk or AST diff.

`packages/parser/src/parser.service.ts`, `indexer/symbol-indexer.ts`, `typescript/extractors.ts`
and `treesitter/` produce normalized symbols/references. TS/JS uses ts-morph;
five other languages use lazy tree-sitter grammars. Resolution is heuristic in
some languages and incomplete for some imports; unresolved references do not
establish absence. Symbol IDs contain path, name and source position, so they
are unsuitable as durable identity across arbitrary moves.

`packages/graph/src/graph.service.ts` builds symbol and synthetic file nodes,
typed imports/calls/references/containment/inheritance and heuristic `tested-by`
edges. It has BFS shortest paths and Tarjan cycles. `impact.service.ts` walks
reverse dependencies. Its fan-out denominator is visited nodes, not total
repository size; the existing risk number is not a calibrated correctness risk.
SDK dependency closure and MCP impact handling are additional consumers of the
same persisted graph; their path/edge projections require care when extended.

`packages/storage/src/context-store.ts`, `schema.ts`, `migrations.ts` and the
eight repositories own current repository cache data. Schema version 1 has
Files, Symbols, Dependencies, Summaries, Modules, Relationships, Hashes and
Metadata. Full saves clear the cache; incremental saves merge. There was no
revision history or durable proof dependency model in these tables.

`packages/sdk/src/indexing/indexer.ts` scans/hashes, reparses changed/added files,
reuses unchanged content/symbols, rebuilds structural graph edges, carries usage
edges for untouched files, removes deleted data and persists the result. The
no-op path uses stored hashes/counts. Incremental parsing does not mean every
scan/hash/graph operation is proportional only to changed files.

`packages/sdk/src/watch/watcher.ts` debounces chokidar events into the existing
incremental indexer. `packages/mcp/src/freshness.ts` additionally probes before
reads; SDK `context/staleness.ts` compares file hashes. These systems refresh
context, but previously had no evidence-to-requirement invalidation semantics.

## Context, plans and model calls

`packages/search/src/search.service.ts` and `scoring.ts` rank lexical/fuzzy hits.
`packages/context/src/context-builder.service.ts` ranks/resolves source content.
SDK `context-integration/assemble.ts` adds explicit path/symbol resolution,
bounded graph traversal, instruction files, deterministic digest/synthesis,
deny filtering, tiers, ranges and budgets. `budget.ts`, `sufficiency.ts`,
`hierarchy.ts` and `render.ts` support compact delivery. Estimates are character
heuristics, not actual tokenizer measurements or proof of understanding.

`context-integration/classifier.ts`, `entities.ts` and `planner.ts` deterministically
construct a `ContextPlan`: ordered steps, impact set, unknowns and verification
strategy. `plan-guard.ts` constrains model annotations. Separately,
`sdk/orchestrator/plan.ts` creates explicit multi-agent role plans (`TaskPlan`).
These are distinct contracts; neither is a durable proof-obligation graph.
There was no general arbitrary-big-prompt semantic decomposition engine.

`task-ledger.ts` persists bounded v1/v2 task JSON, baseline hashes, sessions,
captured output and touched paths. `control-plane.ts` and `control-state.ts`
validate scope/freshness, supervise existing sessions and invoke VerifierPort.
WorkPackets hold references, freshness, plans and budgets. Control-plane scope
checks observe edits after the agent runs; they are not a sandbox.

`packages/verifier/src/claims.ts` checks paths/symbol names and answer-text
properties; prose coverage is not behavior verification. `runners.ts` executes
configured argv commands with `shell:false`; `baseline.ts` distinguishes prior
failures. Proof completion must not equate a citation check or a pre-existing
failure exemption with satisfying a behavioral requirement.

`packages/sdk/src/context-integration/critic.ts` already combines deterministic
answer/plan checklists with optional ProviderPort review. Its text-overlap and
answer-substance checks are useful advisory criticism, not durable evidence of
behavior. `packages/sdk/src/inspect/index.ts` already implements InspectPort
HTTP probes, localhost-first with explicit remote approval. Runtime observation
primitives therefore exist; revision/environment-bound L5 proof does not yet.
`packages/toolkit/src/warden.ts`, composed by `sdk/warden.ts`, provides optional
external Warden planning/execution. Keep this sandbox seam rather than building
another execution or policy runtime for proofs.

Provider calls live in `packages/providers`, SDK provider adapters and optional
summary/briefing paths; external coding agents run through `packages/agents`
and SessionPort. Repository intelligence, planning/ranking and current claim
checks are deterministic. Model output is interpretive data.

## MCP and persistence

`packages/mcp/src/server.ts` registers tools/aliases/resources, applies call
budgets, ensures freshness, invokes `handlers.ts` through SDK and attaches
structured results/timing/error envelopes. `tools.ts` has 15 primary tools at
the audited branch plus four aliases. `resources.ts` exposes overview, repo-map,
symbol, skill and task projections. The ChatGPT adapter already presents a
smaller surface. MCP prompts are not implemented.

State lives in context.db, usage.db, toolkit manifests, slices/exports and task
JSON. Process sessions and multi-agent run state are in memory. No claim was
found that existing context cache state could serve as a complete audit archive.

The benchmark package, corpus and server were removed under ADR-023. Archived
retrieval plans/results are historical. Current evaluation foundations include
`packages/sdk/tests/control-plane-evaluation.test.ts`, offline protocol fixtures
and the untracked OpenCode pilot; none establish mutation-proof correctness or
real-agent quality improvement.

## Observed local limitations after implementation

The rebuilt local CLI successfully refreshed the index (582 files, 38 reparsed,
13,396 symbols, 15,188 dependencies, three unresolved imports). A legacy
`atlas context build` request at a 1,200-token budget reported 5,114 estimated
tokens with `budgetExceeded:true`: mandatory instruction/context items can
exceed that legacy aggregate limit. The proof profile therefore uses the
existing WorkPacket compiler's full-envelope cap rather than treating legacy
package budgeting as a strict guarantee. The same query reported non-indexed
documents/configuration as added in freshness checks; indexed parseable files
and whole-tree file discovery have different inventories. The proof observer
uses its own bounded all-visible-file snapshot around the existing indexer,
while retaining these context limitations in the audit. These observations
are not a request to rewrite the existing context system in this change.

The new implementation described elsewhere adds proof state on these seams;
it does not retroactively classify the audited branch as a proof system.
