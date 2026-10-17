# Implementation phases and acceptance

Each phase is independently reviewable. Status refers to this experimental V1.
Each V1 phase is implemented. Empirical release gates remain separate from code
completion; [follow-through](12-implementation-status.md) records precise limits.

## Phase 0: ownership, revisions and safe persistence — implemented

Goal/ordering: establish state identity before any evidence can be accepted.
Reuse hashing snapshots, scanner rules, indexer, ContextSDK and storage SQLite
helpers. New files: core proof contracts, SDK proof observer, storage proof-store,
proof package/configuration and ADR-028. Public API: createProofSDK and injected
ProofStorePort/ProofRepositoryPort. MCP is initially unchanged. Dependencies:
core/shared only in proof, storage in SDK composition. No context migration;
proof schema is independently versioned. Risk: scans racing index updates and
root/path instability. Tests must cover Git/non-Git snapshots, restarts, redirects,
no-op IDs and cache rebuild survival. Acceptance: every check identifies the
checkout/revision and incomplete observation never proves. Evaluate discovery,
hash/index projection and store latency separately. Do not build a new indexer.

## Phase 1: change sessions — implemented with opt-in agent linkage

Goal/ordering: make intent/lifecycle durable before adding truth. Reuse TaskLedger
scope/lifecycle patterns; retain the existing ledger as continuity state.
Core ChangeSession and proof service own baseline/current revision, goal, bounds
and optimistic versions. APIs begin/check/exportState; CLI begin/status/export.
MCP begin/status added in the final integration phase. No legacy task migration;
optional TaskLedger/ContextRequest/WorkPacket changeId linkage persists through
provider resumes. Injecting ProofPort into the control plane activates the proof
completion gate; legacy runs without that port remain unchanged.
Risk: parallel clients overwriting state; CAS rejects lost writes. Tests: restart,
invalid scope, missing session, optimistic-write conflict. Acceptance: session
survives process restart without changing a provider/process identity. Evaluate
session-open/write cost. Do not rebuild SessionPort or orchestrator execution.

## Phase 2: proof DAG — implemented MVP

Goal/ordering: encode the support chain before propagating mutations. New nodes,
evidence and revision references are core contracts; bounded documents persist
them through ProofStore. Existing code graph remains authoritative for code
relations. APIs understand/revise support explicit versioned proposals. No old
context data is interpreted as proof. Risk: cycles, vacuous success and treating
rank confidence as evidence. Tests reject cycles/dangling refs and leave empty
requirements unproven. Acceptance: explicit obligation -> requirement support at
the requested level. `graph.ts` projects typed support/contradiction/observation/
authorization/invalidation edges; storage v3 archives compressed immutable versions.
Evaluate DAG sizes 10/100/1,000. Independently mutable generic edge algebra and
normalized node/edge SQL are not V1 requirements.

## Phase 3: invalidation — implemented on observation and continuous watches

Goal/ordering: satisfy the differentiating mutation-to-unproven demonstration.
Reuse hash changes, old/new repository graph projections and reverse BFS.
Modify truth/service and SDK observer. APIs check/status/prove automatically
observe; no model operation is needed to invalidate. Existing watcher/indexer
feeds the same observer through SDK watch; proof MCP starts/closes it automatically.
Narrow Git metadata paths are watched without scanning object databases. Storage
v3 leases serialize cooperating proof clients; environment changes reopen evidence.
Risk: deleted edges,
incomplete hashes and changes during checks. Tests: code/type edits, deletion,
dependency additions, failed tests, requirement revisions and reversion. Acceptance:
proven requirement becomes stale on a watch event and always on a fresh proof operation.
Evaluate stale recall/noise and propagation separately from scan cost. Do not
introduce Differential Dataflow or a second watcher framework.

## Phase 4: compiler — structured and opt-in model paths implemented

Goal/ordering: derive inspectable obligations only after proof/invalidation exist.
Reuse classifier/planner, ContextPlan, WorkPacket and provider seams. The new
compiler resolves keys, validates graph/policy/actions and versions replacements.
APIs begin/understand/revise; no implicit provider calls. Migration: node versions
protect existing evidence. Risk: incomplete semantic interpretation. Test changes
to requirements, bad keys, unsafe scopes and model attempts to submit statuses.
Acceptance: valid-session/rejection/reconnect/contract obligations can be represented
explicitly without being marked proven by prose. Evaluate obligation coverage
separately from truth propagation. `compiler.ts` and SDK propose use existing
ProviderPort/usage budgets and WorkPacket, stage output durably and require
explicit adoption. Do not build autonomous delegation or model verdict authority.

## Phase 5: debt and completion — implemented

Goal/ordering: turn graph state into an enforceable completion gate. Reuse
VerifierPort argv execution but require actual passing checks; baseline failure
classification cannot satisfy an obligation. New receipt/debt/levels and planner
in proof service/truth. APIs verify/prove; CLI verify/receipt. Critical/high debt
blocks completion; receipt records policy version and limitations. Migration:
bounded receipt history in session state. Risk: false proof from insufficient
checks or evidence level inflation. Tests: missing/unapproved/timed-out/failed
checks, stale results and insufficient levels. Acceptance: no critical debt can
produce proven. Evaluate false-proof controls and command cost. Deployment-bound,
expiring runtime L5 predicates reuse InspectPort; signed attestations are not V1.

## Phase 6: blindspots and mutation budget — conservative V1 implemented

Goal/ordering: expose missed work after a reliable completion gate exists.
Reuse static edges, tested-by links, syntax printer and path authorization.
Expected artifacts have reasons/investigated flags; syntax-safe formatting can
be separated from semantic-changed files. Mutation receipt/budget is implemented.
Exported syntax deltas, explicit unchanged-contract constraints, per-node mutation
justifications and architecture investigation rules are implemented. Actual
investigation paths are distinct from global command invalidation scope.
New modules: sdk/proof/semantic and truth ranking.
No schema migration for AST trees; only hashes persist. Risk: false equivalence,
comments/ASI and incomplete test mapping. Tests preserve ASI/directives and
classify unsupported syntax conservatively. Acceptance: outside-boundary edits
block; format-only changes do not consume semantic budget but stale evidence.
Evaluate blindspot recall/noise on held-out misses. Do not claim arbitrary semantic
equivalence or infer runtime dependencies from lexical similarity.

## Phase 7: coupling/history/memory — heuristic V1 implemented

Goal/ordering: rank repository-specific investigation using observed signals.
Reuse Git process boundary and persistent proof outcomes. New coupling.ts,
history.ts and bounded ProofMemoryEvents (retained in proof schema v3). SDK optional
historyCommits and recordAgentMiss; command failures record co-occurrences.
MCP/CLI need no extra tool explosion. Sample thresholds and equal weights are
provisional; failure observations are advisory, not causal proof. Tests cover
de-duplication, restart, minimum samples, history window and repository isolation.
Acceptance: repeated history/failure signals affect ranking without changing
evidence validity. Evaluate against static-only ablation; freeze tuned weights
only after held-out gains. Do not add global ML, embeddings or runtime traces.

## Phase 8: planner and seven-tool delivery — implemented MVP

Goal/ordering: make the kernel usable without manual graph choreography.
Reuse WorkPacket, ContextSDK, verifier and official MCP transport. New proof MCP
profile and CLI prove, SDK public exports. Planner ranks unresolved explicit
actions by severity/falsification/cost-to-dependent-work. Output remains bounded.
Context tool profile stays default; no legacy tools removed. Risks: oversized
responses, incorrect read-only annotations, command authority and hidden state
writes. Tests use real InMemoryTransport and fixture source edits; CLI tests cover
non-proven exit status. Acceptance: begin -> verify -> prove -> mutation -> stale
works through seven high-level tools. Evaluate calls/bytes/tokens and real-agent
completion separately. Dynamic capability-based suggestions require explicit
adoption; learned wall-time costs await measured data, not arbitrary values.
Do not create a new execution backend.

## Remaining release gates

Task/control-plane linking, line-stable declaration contracts, architecture
investigation rules, proof execution leases/environment identity and portable
intent rebinding are implemented. Full rename/move identity, arbitrary semantic
compatibility and hermetic/distributed execution are not claimed. Live-agent
evaluation is necessary before claiming measured agent-quality gains.
Keep the feature experimental until held-out results support a
default-on rollout. No release/publish/deployment is part of this change.
