# Proof compiler

V1 is deterministic structured compilation in `packages/proof/src/service.ts`.
Existing `context-integration/classifier.ts`, `planner.ts`, `plan-guard.ts` and
WorkPacket remain usable investigation primitives. A ContextPlan is not a
semantic proof and is not silently converted into passing obligations.

## Input and output

Input is a bounded goal, explicit scope/authorization/budget and a collection of
ProofProposal records. Each has a stable caller key, kind, statement, criticality,
minimum level, dependency keys/IDs and optional action. Provenance defaults to
model-proposed. Compiler output is versioned nodes with resolved dependency IDs;
no evidence is synthesized from the wording of the proposal.

If no proposals are supplied, create one critical L3 requirement for the goal.
It is unproven and remains debt until obligations are supplied. This avoids
empty-goal success. Reject duplicate keys within a batch, dangling dependencies,
cycles, invalid actions and invalid relative paths. Existing keys are explicit
revisions, never accidental duplicate requirements.
Replacement cannot lower an established node's minimum level or severity;
omitted policy fields retain the existing values. Updating a statement cannot
silently downgrade the evidence needed to satisfy the original policy.

## Example: authentication migration

Requirement: existing WebSocket authentication must continue working.
Obligations should explicitly cover valid migrated sessions, rejected invalid
sessions, reconnect and unchanged response/payload contracts. Proposed invariant:
public response fields retain their types. Proposed assumption: every consumer
is represented by static imports. Unknown: dynamically loaded consumers.

Behavioral checks require approved focused/integration tests at L3 or stronger;
the presence of `websocket/auth.ts` establishes only file existence. A literal
absence check can falsify “no JWT references remain,” but cannot prove that all
JWT behavior was correctly migrated.

## Model-assisted interpretation

`packages/proof/src/compiler.ts` calls only an injected ProviderPort. SDK
`propose(changeId, {approved:true,maxTokens})` requires explicit host provider and
UsagePort configuration, checks usage limits, builds a deny-filtered bounded
WorkPacket, and tracks the call through the existing usage collector. It accepts
at most 32 strict proposal records and rejects results, status, execution or
authorization fields. No raw provider response is logged or persisted.

Valid proposed nodes are staged durably as model-proposed intent. Unreviewed
high/critical proposals are debt; they cannot silently preserve a completed state.
`understand` explicitly accepts/revises matching structured nodes. Empty or unrelated
updates do not erase pending work. Rejections need explicit bounded reasons through
dismissProposals, retained in session history; a pending batch cannot be overwritten
by another model call. Evidence still requires deterministic checks. There are no implicit
model calls during begin/check/verify/prove, and no new provider transport.

The compiler cannot decide that natural-language obligations completely capture
a human goal. V1 exposes that limitation in docs/receipts. Obligation quality
and completeness require a separate evaluation from invalidation correctness.
