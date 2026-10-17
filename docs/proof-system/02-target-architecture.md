# Target architecture and ownership

## Six conceptual engines

```text
Developer goal -> ChangeSession -> Proof Compiler
                                    |
                                    v
                            Temporal proof DAG
                                    |
                     existing repository intelligence
                                    |
                         Incremental truth engine
                                    |
                     Verification / falsification planner
                                    |
                         revision-bound ChangeReceipt
```

Repository Intelligence Engine: existing scanner, hashes, parsers, normalized
symbols/references, GraphService, context DB and SDK queries. SDK Git adapter
adds bounded HEAD/history reads. Tests/builds use VerifierPort. Runtime traces
are a later source with their own deployment/config identity; reuse the existing
SDK InspectPort HTTP probes and optional Toolkit Warden execution seam rather
than replacing them. Existing critic checklists/provider review remain advisory.

Change Session Engine: `core/domain/proof.ts` and proof service. Owns goal,
baseline/current revision, explicit authorized boundary, semantic file budget,
versioned requirements/constraints and lifecycle. A proof session is not a
SessionPort process or TaskLedger transcript.

Proof Compiler: compiles explicit proposals into a validated DAG. Model-assisted
requirement extraction can later propose the same data. The compiler creates no
passing evidence. Replacing a proposal increments its node version.

Temporal Change Proof Graph: records requirements, constraints, invariants,
claims, assumptions, unknowns and obligations. In V1 the node's `dependsOn`
is an AND relation and executed Evidence references an obligation. Artifact and
revision records supply typed external references. The larger proposed edge
vocabulary is declared but only dependency/support/observation relationships
have execution semantics; arbitrary edge algebra remains [PLANNED].

Incremental Truth Engine: truth.ts builds a reverse adjacency map over old/new
repository edges and walks affected files once. It stales evidence and evaluates
only the bounded session DAG. File scanning/hashing and graph projection still
have repository-scale cost; the implementation does not claim sublinear file
discovery or persist a new code graph.

Verification Engine: plans explicit actions, executes approved checks, maintains
proof debt, derives guarantee ceiling, expected investigation and completion.
Static absence is a falsification primitive; commands come from the existing
verifier. A receipt can only be produced after a fresh observation.

## Deterministic versus model responsibility

Deterministic authority covers revisions, hashes, AST normalization, graph edges,
literal diffs/search, execution outcomes, stale-state propagation, dependencies,
budget enforcement and historical counts. Models may propose intent,
requirements, constraints, assumptions, obligations and explanations. They
cannot submit a passing result to the proof API. A check establishes its narrow
predicate, not arbitrary meaning in the surrounding natural-language statement.
Human policy must validate the mapping between a behavioral requirement and its
proposed checks; complete automatic semantic validation is not solved by V1.

## Ownership and remaining coupling

Core contracts -> proof rules and storage implementations -> SDK composition
-> CLI/MCP consumers. `packages/proof` imports core/shared only; SDK injects
observation/execution/storage. Storage alone issues SQL. The separate proof DB
survives ContextStore full replacement and has independent schema versioning.

TaskLedger and control-plane events are still separate continuity contracts.
WorkPacket assembly is reused by `atlas_context`; proof-enabled control-plane
runs persist/deliver changeId and gate completion on the corresponding receipt.
Legacy external launches without proof composition remain compatible. Existing task
events are bounded and compacted, so they cannot serve as an immutable proof
archive. No process or provider framework is replaced.
