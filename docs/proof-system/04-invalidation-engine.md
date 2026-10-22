# Invalidation and propagation

Implementation: `packages/proof/src/truth.ts`, `service.ts`, SDK observation in
`packages/sdk/src/proof/index.ts`. Every check/status/verify/prove/export observes
repository state. SDK watch, `atlas prove watch` and automatic proof MCP watches
feed the same observer. There is no permanently installed daemon after CLI exit.

## Algorithm

```text
old = session.current
new = observe repository with existing scan/hash/index pipeline
changed = hash diff(old.artifacts, new.artifacts) UNION endpoints(edge symmetric diff)
reverse = reverse adjacency(old.dependencies UNION new.dependencies)
affected = BFS(changed, reverse), with tested-by traversed implementation -> test

for evidence in fresh evidence:
    reasons = intersection(affected, evidence.scope)
    add global reason if HEAD/environment changed or observation incomplete
    add expiry reason for expired runtime evidence
    if reasons: stale(evidence, new.id, reasons)

evaluate bounded proof DAG in dependency order:
    stale prerequisite -> stale dependent
    failed prerequisite -> contradicted dependent
    unknown/missing/insufficient-level prerequisite -> unproven dependent
    every prerequisite supported at required level -> supported dependent

derive debt, blindspots, next actions and completion ceiling
commit current revision and proof projection with expected session version
```

Graph deltas seed the same old/new reverse closure; unrelated topology does not
stale independent scoped evidence. Changed topology also reopens investigation.
Coupling signals are never validity dependencies.

## Required cases

A: a function changes. Its file hash changes, invalidating directly scoped
evidence and evidence scoped to reverse-dependent files/tests. The prerequisite
DAG then reopens claims/requirements. V1 uses the entire file because stable
cross-edit symbol identity is not yet established; formatting still stales a
command run even when its semantic hash is equal.

B: an interface/type changes. The same closure includes imports/references and
implementations present in the indexed graph. Command evidence always has
repository-wide scope, including configuration and newly added files. Parser
gaps remain explicit limitations. A missing graph edge cannot justify a claim
that no semantic dependents exist.

C: a previously supporting test fails. New failed evidence supersedes its prior
passing evidence for that obligation version. Its status becomes contradicted,
propagating through claims and requirements. No pre-existing-failure exemption
can satisfy a failing proof action. A later passing run can restore support.

D: a new dependency appears. Compare old/new graph projections; invalidate
graph-dependent evidence, recompute expected investigation, add ranked neighbors
and related tests, and reopen obligations. Retain old edges too so dependency
deletion does not hide previously affected consumers.

E: the user changes a requirement. `revise` increments its version and stales
all session evidence conservatively because derived obligations may embody the
old wording. `understand` also stales evidence when an intent node is replaced,
then replaces explicit proposal keys with new versions;
prior evidence cannot satisfy a different node version. Recompilation may add
new obligations; automatic interpretation of new semantics is not assumed.

## Race and failure behavior

The SDK scans/hashes around the incremental index operation and observes HEAD
on both sides. It compares repository revisions before and after a verification
action; edits during execution produce stale evidence. Scan/hash failures
produce an error, never a new proven receipt; unsupported/oversized/symlink
observations mark the revision incomplete. These checks cannot detect an edit
that changes and returns to identical content entirely between observations.
Owner-bound expiring leases now serialize cooperating proof clients, with a
heartbeat and ownership check before each commit. They cannot lock arbitrary
editors or detect every unobserved change-and-revert; hermetic execution/event
journaling remains a stronger future guarantee, not an implied property.

The invalidation walk is O(affected files + traversed edges); DAG evaluation is
O(session nodes + dependency edges). Current discovery/hash/index projection
still performs repository-scale work. Benchmark those separately before adding
a new incremental computation framework.
