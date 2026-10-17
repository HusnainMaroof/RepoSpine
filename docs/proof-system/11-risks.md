# Risks and hardest technical problems

## Ranked technical difficulty

1. Correct evidence invalidation: essential. Start with conservative file scopes,
   old/new reverse closure and failed-observation handling; refine only with
   independent mutation ground truth.
2. Intent-to-check semantic completeness: essential and unsolved in general.
   A passing existence check cannot establish authentication behavior. Keep
   explicit narrow obligations, policy levels and human-reviewed check mappings.
3. Semantic mutations mapped to requirements: hard and valuable. V1 path approval
is coarse. Explicit node links, exported-syntax diffs and contract constraints help;
   do not advertise automatic equivalence from AST printing.
4. Proof propagation with contradictory/stale evidence: essential. Enforce
   acyclic AND support, node versions, latest executed outcomes and monotonic
   staleness. General alternative proof branches need explicit semantics later.
5. Blindspot recall versus noise: valuable. Use independent labels, explained
   scores, sample thresholds and static/history/memory ablations.
6. Efficient incrementality: valuable after correctness. Measure repository scan,
   graph projection and propagation separately. Advanced differential execution,
   semantic embeddings and runtime causal learning are unnecessary initially.

## Concrete failure modes and mitigations

Duplicate graphs/stores: keep context.db and GraphService authoritative for code;
proof.db stores proof state and archived revision projections; graph.ts is a
derived typed view, not an independently mutable code graph/store.

LLM overreach/false proof: proposals never write evidence. Explicit action
results, minimum levels and debt govern completion. Natural-language mapping
quality remains a limitation requiring policy and independent evaluation.

Graph explosion/storage growth: session/node/file/document/receipt/memory bounds
fail closed. Normalize nodes/edges only after measured document-size limits.
Do not silently truncate critical proof dependencies. Compressed immutable history
and bounded history pages reduce storage/response cost, but history still grows;
measure before adding retention/export policy that could destroy audit continuity.

Fan-out/over-invalidation: retain old edges and invalidate conservatively. Current
HEAD/environment invalidation is intentionally global. Edge deltas seed a scoped
old/new closure so unrelated topology does not stale independent evidence.

Under-invalidation: command scope is whole observed repository; negative searches
include additions within declared directories. Unsupported parser/runtime/ignored
state is outside the ceiling. Dependency absence is never inferred from no hits.

Stale state/races: scan/hash around indexing and checks, CAS against session
version and reject unknown observations. Concurrent write protection does not
serialize external agent filesystem edits. Mutation-and-reversion between probes,
and undeclared runtime state remain limitations. Expiring owner-bound leases with
heartbeats and pre-commit checks serialize cooperating proof clients, not editors.

Hash/version instability: root-relative artifact paths, sorted content input and
versioned nodes. Checkout relocation and renames require rebinding/reverification;
source-line-based symbol IDs are not durable identities.

Semantic false positives: preserve directive comments/strings/ASI; unsupported
languages/parse errors use conservative content-change classification. AST
normalization is limited formatting evidence, not behavior equivalence.

Memory poisoning: agent misses are advisory, de-duplicated, bounded and require
repetition. Actual proof failures are observations, not causal labels. Memory
cannot mark evidence fresh or a requirement supported.

Latency/token cost/MCP calls: bounded packets and compact report projections,
seven-tool opt-in profile, cached syntax/history signals and the existing
incremental indexer. Current full scans/hashes remain a measurable cost.
Watch callbacks currently reobserve each retained session independently, so many
active/retained sessions multiply snapshot work. Measure that workload before
introducing a leased shared observation batch or revision-object normalization;
do not mistake incremental parsing/BFS for constant-cost repository discovery.

Test cost: rank focused approved actions before broad commands, retain whole-repo
freshness dependency and record actual cost. Do not claim fewer tests before
paired held-out evidence supports the claim.

Compatibility: default context tools, task ledger and control plane remain
available. Proof receipts are a new completion contract; existing `atlas verify`
or control-plane `complete` must not be presented as equivalent.

Security/privacy: safe argv reuse, explicit command approval, no result-supplied
execution, relative paths, symlink checks and no persisted command output. Local
database tampering is outside the trust model; receipts are not signed remote
attestations. External test code still needs the host's own sandbox policy.
