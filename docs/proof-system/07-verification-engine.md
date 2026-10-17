# Verification engine

## Actions and planning

An action is artifact existence, literal absence, unchanged exported syntax,
an approved command key or a host-approved runtime probe.
Existence/absence is L1. Command level is application-owned metadata (L2, L3 or
L4); model input cannot supply executable text or a passing result. CLI-approved
typecheck/build categories are L2 and test/tests categories L3. SDK applications
may register an explicitly adversarial command as L4. Runtime L5 requires an
injected InspectPort, approved status/body predicate, explicit environment identity,
and a trusted deployment adapter returning the exact observed revision both
before and after the probe. Evidence expires within a host-set 1 ms–5 minute TTL.
An unbound or mismatched deployment yields unknown, never a runtime pass.

The planner ranks unresolved explicit actions by severity, then falsification,
then potential dependent nodes settled per cost unit. Static actions cost 1;
commands cost 3. These are provisional ordinal heuristics, not elapsed-time
estimates. Return cost class, affected node IDs and reasons. A candidate action
can settle prerequisites without guaranteeing that every dependent is resolved.
For nodes with no action/prerequisites, the planner synthesizes up to three
suggestions from the host-approved capability catalog meeting the minimum level.
They require explicit adoption/versioning: capability level does not establish
that its test assertions cover the requirement. No arbitrary package script is
automatically selected or executed.

Falsification is reusable: a literal counterexample makes absence false, a failed
approved test contradicts a behavior obligation, a changed hash disproves evidence
freshness. Additional symbol/config/API strategies should use existing ContextSDK
queries; runtime traces need a new source identity and consent boundary.

## Proof debt

Debt is explicit unresolved work: unsupported/stale/contradicted proof nodes,
incomplete observation, unreviewed compiler proposals, unauthorized mutation, exceeded semantic budget or an
uninvestigated expected artifact. It is never a fake completion percentage.

CRITICAL and HIGH block V1 completion. MEDIUM/LOW remain visible in receipts.
Requirement/obligation severity and minimum level are explicit policy inputs.
Default requirements require L3; other proposals default to L1/HIGH. Constraints
and assumptions need real dependencies/checks to resolve, just like requirements.

Guarantee ceiling is the minimum supported level among requirements/invariants.
Levels are an ordinal policy vocabulary, not automatically inclusive proofs:
a passing unit test does not silently imply a typecheck or production runtime
verification. Independent needed checks must be separate AND prerequisites.

- L0: asserted; no repository check establishes the statement.
- L1: statically supported within the explicit observed predicate/scope.
- L2: approved build or type verification.
- L3: approved test verification.
- L4: an explicitly approved adversarial verification action.
- L5: deployment/revision-bound, expiring runtime verification.

Minimum levels are configured per node, not inferred as universal truth from a
file extension. Documentation may use L1; refactors commonly need L2/L3,
authentication L3+, payment idempotency L4, and production migration L5 where a
real deployment binding exists. Required independent checks remain explicit.

## Completion gate

`prove` observes again, invalidates stale support, evaluates the DAG and returns
a receipt. There must be at least one requirement. All critical/high debt must
be zero, the repository observation must be complete, and each obligation's
support must meet its declared level. Otherwise return not-proven or blocked.
Empty check arrays, agent exit zero, answer text, cited symbols or old test passes
cannot establish a new behavioral proof.

Verifier command execution is reused, while its baseline exemption is not a
permission to consider a failing required check passed. Command stdout/stderr
is never copied into proof.db. Observe before/after execution to catch source
or graph mutations; a changed revision makes the new result stale.

Approval applies to the command configuration passed by the application. A
repository test script can still execute project code, write ignored files or
use external services; command approval and external sandbox policy remain
necessary. Environment fingerprints include Node/platform/architecture, a host
toolchain/runtime identity and approved capability configuration. Changing them
invalidates prior evidence. Undeclared external state is still outside the guarantee;
an environment hash is not hermetic execution or cryptographic deployment attestation.
