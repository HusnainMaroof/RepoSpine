# Capability gaps and reuse decisions

The labels below describe the transition from audited `b42077f`, not a claim
that arbitrary software semantics are solved. V1 implementation follow-through
is recorded in [phase status](09-implementation-phases.md) and
[operational limits](12-implementation-status.md).

1. **Change Sessions — EXTEND.** Reuse SDK task-ledger/control-state patterns;
   add core ChangeSession, revisions, boundary and proof lifecycle in proof.db.
2. **Requirement extraction — MODIFY.** Classifier/planner and WorkPacket supply
   context. V1 accepts structured proposals and explicit ProviderPort/usage-backed
   extraction in proof/compiler.ts and SDK propose. Never infer completeness from a proposal.
3. **Constraint extraction — MODIFY.** Reuse instruction/deny handling and plan
   guard. Explicit Constraint nodes must be checked; repository text cannot
   authorize changes or approve commands.
4. **Change Boundary — EXTEND.** Reuse control-plane scope validation and impact
   sets; add persisted authorized paths tied to session intent. V1 authorization
   is at path level, not a complete semantic justification of every edit.
5. **Proof Compiler — BUILD.** Extend planner concepts with the new structured
   DAG compiler in `packages/proof/src/service.ts`; reject missing/cyclic refs.
6. **Proof Obligations — BUILD.** Reuse verifier execution, add durable explicit
   actions, dependency IDs, versions and minimum proof levels.
7. **Temporal Proof Graph — BUILD.** Existing GraphService is symbol-specific.
   Add a proof DAG referencing its file projection; retain old graph edges for
   invalidation. ADR-028 explains the distinct domain boundary.
8. **Evidence — EXTEND.** Existing EvidenceRef is delivery metadata. Add executed
   outcome, revision, scope, level and invalidation metadata; do not overload
   WorkPacket reference scores as truth.
9. **Claims — MODIFY.** Existing verifier citation/output checks remain narrow.
   Add versioned Claim nodes whose support derives from explicit checks/deps.
10. **Assumptions — BUILD.** Planner unknowns seed explicit Assumption nodes.
    High-risk assumptions remain debt until an applicable check resolves them.
11. **Unknowns — EXTEND.** Persist planner/sufficiency limitations as nodes;
    unresolved critical/high unknowns block the receipt.
12. **Invariants — BUILD.** Add invariant nodes using test/static action backends.
13. **Revision evidence — EXTEND.** Manifest HEAD and SHA-256 snapshots become
    working-tree RepositoryRevision; HEAD alone is insufficient.
14. **Automatic invalidation — BUILD.** Hash diff/freshness detect edits; truth.ts
    stales supporting evidence on observation and through the existing SDK watcher;
    proof MCP owns its continuous watcher lifecycle, not a new daemon framework.
15. **Proof propagation — BUILD.** Reverse file dependency BFS plus proof AND
    dependencies reopen upstream nodes; never let cycles support themselves.
16. **Proof Debt — BUILD.** Derive severity-tagged unresolved work from proof
    nodes, stale observations, boundary violations and blindspots.
17. **Blindspots — EXTEND.** Existing impact closure/test links seed an Expected
    Investigation Set; coupling and recorded failures add explained candidates.
18. **Unintended semantic change — BUILD.** Hashes alone cannot classify it.
    Syntax normalization handles limited TS/JS formatting equivalence; full
    exported syntax IDs/hashes and explicit contract constraints catch conservative
    public-shape deltas; arbitrary semantic compatibility remains unsupported.
19. **Semantic budget — BUILD.** Persist a conservative semantic-changed-file
    count; domain-specific budgets need additional contract classifiers.
20. **Guarantee Ceiling — BUILD.** Compute the minimum support level of required
    proof; do not describe lexical confidence as a correctness probability.
21. **Verification Planner — MODIFY.** Existing plans suggest a broad strategy;
    rank explicit unresolved actions by severity, falsification and bounded cost.
22. **Falsification Planner — BUILD.** Literal-absence checks can disprove claims;
    symbol/reference queries remain available internally. Unchanged-contract
    predicates and approved deployment-bound runtime probes supply further
    deterministic counterexample strategies, not autonomous test synthesis.
23. **Proof Levels — BUILD.** Core ProofLevel plus approved command metadata.
    Existing baseline verdict is not an evidence level.
24. **Change Receipts — BUILD.** Persist the revision pair, debt, mutations,
    ceiling, policy version and bounded completion outcome.
25. **Portable Change State — EXTEND.** Export structured proof state alongside
    existing handoff patterns. Rebinding/importing into a different checkout
    recompiles intent with new IDs/local baseline and discards evidence, receipts
    and authorization. It cannot certify the original historical change remotely.
26. **Semantic coupling — EXTEND.** Existing graph/test edges feed explained
    scores in coupling.ts; no new embeddings or second symbol graph.
27. **Historical co-change — BUILD.** `sdk/proof/history.ts` adds bounded opt-in
    Git file statistics. Manifest collection previously only read HEAD metadata.
28. **Agent failure memory — EXTEND.** Task events retain run failures; new
    SDK `recordAgentMiss` retains de-duplicated advisory artifact observations.
29. **Proof failure memory — BUILD.** Persist observed failure co-occurrence in
    ProofStore. Never label co-occurrence as proven causality.
30. **atlas_prove — BUILD.** SDK prove, CLI receipt operation and proof MCP tool
    compose current evidence; a successful external agent exit is insufficient.

## Infrastructure that must remain

| Existing component | Decision | Reason and target role |
| --- | --- | --- |
| `packages/scanner/src/scanner.service.ts` | KEEP | Existing discovery and ignore rules supply repository artifacts. |
| `packages/hashing/src/snapshot.ts`, `diff.ts` | EXTEND | Existing snapshots drive revisions; raw-byte hashing prevents missed binary mutations. |
| `packages/parser/src/parser.service.ts` and `indexer/` | KEEP | Existing normalized symbols and references remain repository intelligence. |
| `packages/graph/src/graph.service.ts` | KEEP / EXTEND | Existing symbol/test graph supplies proof impact; stable symbol identity remains future work. |
| `packages/graph/src/impact.service.ts` | EXTEND | Reverse dependency reasoning supplies investigation candidates; risk values require evaluation. |
| `packages/storage/src/context-store.ts` | KEEP | Rebuildable repository cache retains its existing schema/lifecycle. |
| `packages/storage/src/proof-store.ts` | BUILD | Separate durable proof/session store, using existing SQLite helpers. |
| `packages/search/src/search.service.ts` | KEEP | Deterministic search is a supporting investigation primitive. |
| `packages/context/src/context-builder.service.ts` | KEEP | Existing deterministic rank/assembly remains available. |
| `packages/sdk/src/context-integration/assemble.ts`, `budget.ts`, `work-packet.ts` | EXTEND | Existing bounded source context serves unresolved proof work. |
| `packages/sdk/src/context-integration/planner.ts`, `plan-guard.ts` | MODIFY / EXTEND | Preserve plans; structured proof compilation is a separate, explicit contract. |
| `packages/sdk/src/context-integration/task-ledger.ts`, `control-plane.ts` | EXTEND | Retain continuity; optional ProofPort links change IDs and gates completion on a proven receipt. |
| `packages/verifier/src/runners.ts`, `baseline.ts` | KEEP / EXTEND | Reuse approved execution; failing checks cannot satisfy proof via a baseline exemption. |
| `packages/mcp/src/server.ts` and transport | KEEP / EXTEND | Add an opt-in seven-tool profile while preserving compatibility tools. |
| Removed browser/benchmark server infrastructure | AVOID | Use existing offline fixture tests and agent-owned tooling; no duplicate server/runtime. |

Keep scanner ignore/symlink rules, parser registry and module resolvers, hashing,
GraphService and its symbol edges, ContextStore/repositories/migrations, lexical
search, deterministic context ranking/budgets, provider adapters, SessionPort,
VerifierPort and MCP transports. Extend their contracts only where needed.
Avoid browser infrastructure, a benchmark server, new execution frameworks,
LLM truth adjudication, duplicate source databases and embedding-based proof.
