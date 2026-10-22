# Data model and persistence

The executable interfaces are in `packages/core/src/domain/proof.ts` and
`ports/proof.port.ts`. `packages/storage/src/proof-store.ts` implements storage.

## IDs and versions

- Repository identity hashes the canonical checkout root. This intentionally
  isolates simultaneous worktrees; importState explicitly rebinds intent locally.
- Artifact identity hashes repository identity plus normalized relative path.
  Rename is delete/add. Existing parser symbol IDs remain transient locators.
- Revision identity hashes repository identity, HEAD, sorted artifact hashes,
  syntax/contract hashes, environment identity, dependency projection and observation completeness. Timestamps
  are excluded; returning to the same state may reproduce the revision ID.
  File hashing now uses raw bytes through the existing hashing package; invalid
  UTF-8 byte mutations cannot collapse to the same decoded text digest. Existing
  UTF-8 hashes are unchanged; prior binary hashes refresh on the next update.
- Session identity is random 128-bit hex. Optimistic session versions prevent
  lost updates. Node identity hashes session, kind and proposal key; node version
  increments on an explicit replacement/revision.
- Evidence identity includes node/version, observed revision, session version
  and executed result. A new verification run is distinct from prior evidence.
- Receipt identity includes session/version and evaluated states/debt. Receipts
  refer to a specific repository state and never promise future freshness.

## Core records

ChangeSession contains schema version, goal, repository identity, baseline and
current RepositoryRevision, boundary, authorized paths, semantic change budget,
lifecycle, nodes, evidence and receipts. Empty authorization permits no semantic
mutations; default boundary is the observed repository and default budget is 20
semantic-changed files. This is a coarse artifact budget, not a probability.

Requirement, Constraint, Invariant, Claim, Assumption, Unknown and ProofObligation
share ProofNode: ID/version, kind, statement, severity, minimum level, dependency
IDs, provenance and optional VerificationAction. Proposal keys can reference
other keys within a compilation batch or existing node IDs. Cycles, missing
references, malformed paths and oversized node sets are rejected.

Evidence contains obligation ID/version, observed and valid-from revision,
valid-until revision, source artifact IDs, scope, derivation, level, outcome,
fresh/stale state, optional runtime expiry, actual investigation paths and invalidation reasons. Fail and unknown are explicit;
missing evidence is not success. Freshness can be carried across a new revision
only if its declared scope and dependency closure remain unaffected. Reversion
never revives stale evidence automatically.

RepositoryRevision contains HEAD or null, observed time, completeness, artifact
hashes, the file projection of indexed dependencies and limitations. Optional
coupling signals affect ranking only. RepositoryArtifact carries stable path
identity, content hash, optional conservative syntax hash and exported declaration
IDs/hashes. Declaration identity survives line/format movement, not arbitrary moves.

VerificationResult is an internally executed outcome with level and bounded
detail; it is not accepted from MCP callers. ChangeReceipt includes baseline/
final revision, policy version, completion, debt, raw/semantic changed artifacts,
unjustified paths, guarantee ceiling and limitations.

## Schema and bounds

proof.db schema v3 has `ProofSessions(id, version, body)`,
`ProofMemoryEvents(id, kind, paths)`, `ProofHistory(session_id, version, body)` and
`ProofLeases(resource, owner, expires)`. Migration from v1/v2 is additive and seeds
history from the latest retained session; already discarded history cannot be recovered.
Bounded JSON session documents preserve one
authoritative projection; node-table normalization is a later migration if
query/size measurements justify it. There is no change to context.db schema v1.
SQLite transactions cover optimistic replacement. Concurrent verification
against an outdated session is rejected rather than merging conflicting truth.

Bounds: 10,000 observed files, 2 MiB per source file, 1,024 proof nodes, 128
proposals per operation, 64 scope entries, 8 MiB session document, 64 retained
receipts, 1,000 memory events and 40 paths per memory event. Capacity errors fail
closed; no required proof is silently dropped. Metadata-only command outcomes
avoid persisting stdout/stderr. Proof path redirects/symlinks are rejected.

Every successful session write atomically appends a compressed immutable version,
including intermediate revision metadata and past node definitions. History pages
are bounded to 100 entries and 16 MiB decoded data; decompression is bounded to the session size limit.
Original source bodies and command output are not retained. History grows with
use; compression is not a retention policy or protection against local DB tampering.
`projectProofGraph` projects typed nodes/edges from this authoritative state;
it does not maintain a competing repository graph or independently mutable store.

Export is a versioned document with relative artifact paths; importing its
verdict into a different checkout as trusted truth is forbidden. `importState`
recompiles bounded intent into new IDs at a freshly observed baseline and discards
evidence, receipts and mutation approvals. Receipts are
local records, not cryptographic attestations against a malicious database owner.
