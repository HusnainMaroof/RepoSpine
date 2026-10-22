# ADR-028: Temporal change proof kernel

Date: 2026-10-17
Status: Accepted for experimental implementation under the user's approved plan.

## Context

The audit of `update_features` at `b42077f` found a working repository pipeline,
deterministic plans, WorkPackets, task continuity and verification. It did not
find durable revision-bound proof dependencies. Context indexes are rebuildable;
proof receipts and session intent must survive an index rebuild.

## Decision

Add type-only proof contracts and ports to core, deterministic proof logic to
`packages/proof`, a separate `ProofStore` in `packages/storage`, and composition
in `packages/sdk/src/proof`. Feature packages continue importing core/shared
only. CLI and MCP consume only SDK. No new external dependency is required.

Use `.codeatlas/proof.db`, as selected by the user. Storage owns its SQLite
queries and versioning; `context.db` retains its existing schema and lifecycle.
Proof schema v3 stores bounded session documents, advisory memory events,
compressed immutable session versions and expiring owner-bound execution leases.
Session writes use optimistic concurrency. Normalized proof-node/edge tables
are a future scaling migration, not a second authoritative representation.

The existing symbol graph remains the only code graph. A proof session retains
baseline/current file-level projections to preserve old dependency edges for
invalidation. The proof DAG represents AND prerequisites between claims and
obligations, a different domain from symbol dependencies. It does not reparse
code, perform symbol resolution, or replace GraphService.

Snapshots bind evidence to content hashes, HEAD and graph projection. Working
trees are not identified by HEAD alone. Evidence invalidation is monotonic;
reverting code does not revive a prior command result. Verification observes
repository state before and after execution. A changed snapshot makes the
result stale. Critical/high debt blocks a completion receipt.

Existing task ledgers remain agent continuity state. Proof sessions have their
own identity and can be exported without vendor transcripts. Injecting ProofPort
into the existing control plane links a change ID through task ledgers,
WorkPackets and provider handoffs, and requires a proven receipt before complete.
Legacy control runs without that port keep their existing behavior.

The seven-tool proof MCP profile is opt-in. Context tools/aliases and the
ChatGPT plugin retain their existing surface. Approved command definitions come
from application configuration, never model tool arguments.

## Consequences

File-level invalidation deliberately over-invalidates. Syntax normalization
narrows semantic-mutation reports, but never suppresses hash invalidation.
The guarantee ceiling describes explicit checks; it cannot establish that a
model's proposed obligation is a complete interpretation of a human goal.
Ignore rules, parser gaps and external state constrain the guarantee.
The approved follow-through reuses the existing watcher, ProviderPort/usage and
InspectPort, rather than introducing parallel subsystems. Runtime predicates need
an explicit host deployment-to-revision binding, environment identity and expiry.
Model proposals are staged and reviewed, never accepted as verification results.
Exported syntax comparison remains conservative; arbitrary semantic compatibility,
cryptographic receipts and distributed/editor locks are outside this implementation.
See [implementation status](../proof-system/12-implementation-status.md).
