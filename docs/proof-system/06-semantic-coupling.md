# Semantic coupling, mutation classification and memory

## V1 deterministic signals

`packages/proof/src/coupling.ts` ranks artifact candidates from normalized signals:
static dependencies, shared tests, bounded historical co-change, observed proof
failures and agent-reported misses. `sdk/proof/history.ts` reads at most 100
non-merge commits using argv Git commands. It reads commit IDs and file names,
not messages or source patches. Bulk commits with more than 40 paths are skipped.
History is optional (`historyCommits`), cached by HEAD, and never required for proof.

Historical co-change uses Jaccard count:
`jointCommits / (commitsA + commitsB - jointCommits)`. Historical/failure/miss
signals need at least three observations before ranking. Static/test signals
are available immediately. Failure co-occurrence is smoothed as
`samples / (samples + 3)` to avoid a single run dominating ranking. This is a
provisional ranking heuristic, not a probability or causal estimate.

Initial scores add equally weighted available signal values, de-duplicate repeated
reasons and break ties by path. Equal weights establish a transparent baseline.
Tune weights and the sample/smoothing constants on training fixtures, publish
held-out recall/noise and freeze versioned policy before changing defaults.
Missing runtime evidence contributes no invented score.

`ProofStore` retains at most 1,000 de-duplicated memory events. Actual failed
verification records changed/expected artifact co-occurrence; SDK
`recordAgentMiss(changeId, paths, reason)` records explicitly reported misses.
Reasons are validated/deny-filtered and only a digest is retained. Cross-session
ranking is repository-local. Neither reports a causal defect nor marks a claim
true/false. No global learning service or embedding database is introduced.

## Expected Investigation Set

Union static reverse impact, tested-by associations and eligible coupling
candidates. Each output includes artifact, severity, reasons and whether a fresh
executed action investigated its scope. An agent saying “read it” is insufficient
for execution evidence. Invalidation scope and actual investigation are separate:
command success alone does not mark the whole repository investigated. Hosts may
declare approved command/probe investigation mappings; literal scans record only
the files actually scanned. Architecture rules explicitly map trigger scopes to
expected scopes with reasons. Newly discovered topology also reopens investigation.
Runtime-flow inference remains unsupported, rather than invented from names.

## Semantic mutations

All content changes always participate in evidence invalidation. Separately,
`sdk/proof/semantic.ts` uses the existing TypeScript compiler printer to normalize
supported TS/JS syntax. It preserves comments/directives, strings and automatic
semicolon insertion. Parse errors/unsupported languages remain unknown and are
counted conservatively as semantic changes. This classifier can identify some
format-only changes; it is not a semantics-equivalence proof.

Meaningful mutations outside session authorization create critical
UNJUSTIFIED MUTATION debt. Any file edit outside the boundary is critical.
The semantic budget limits changed artifacts after safe normalization.
Legacy path approval binds edits coarsely to the session goal. `authorize` can
instead bind scopes to explicit requirement/constraint/invariant/claim IDs, a
necessity category and reason. Authorizing an edit does not prove its correctness.
An explicit `public-contract-unchanged` constraint compares baseline/current
exported syntax, including dependency closure and conservative private declaration
support. Type/interface/member changes appear in contractChanges and can contradict
that constraint even in an authorized file. CommonJS/global scripts, parse errors
and unsupported languages return unknown. Inferred contracts deliberately retain
more implementation syntax and may over-report changes. This is not arbitrary
semantic equivalence or a universal public API compatibility checker.
