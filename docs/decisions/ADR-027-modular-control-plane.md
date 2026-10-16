# ADR-027: Opt-in local control plane

Status: Accepted for opt-in implementation by the user's approved plan.
Default-on rollout still requires human review and model-quality evidence.

The approved implementation plan adds structured context delivery and verified
task continuity around existing external sessions. The SDK composes the existing
Context SDK, SessionPort, VerifierPort and task ledger. No new runtime, database,
CLI command or provider branch is introduced.

WorkPacket and EvidenceRef are provider-neutral contracts in core. ContextPlan
already exists and remains the planning contract. The SDK compiles and renders
packets; MCP exposes a read-only build_work_packet tool. Legacy delivery remains
the default. Repository text is untrusted evidence, including repository policy
files; caller-supplied scope and verification requirements govern the run.

The controller validates preflight, observes terminal session status, checks
changed paths after execution, and invokes VerifierPort. External agent tools
are outside this boundary: scope checks detect violations but cannot prevent
edits made by an external CLI. Completion requires terminal success and passing
verification; missing checks, unknown file changes and interrupted sessions do
not count as success. There is no automatic retry or model-generated execution.

Ledger v2 adds bounded control-plane events in the existing task file. Readers
accept v1; legacy writes retain v1. Opt-in writes use v2. At capacity, summaries
retain current state, decisions and failures with explicit compaction markers.
Packet ids include evidence content, policy and repository identity, but exclude
wall-clock timestamps. Traces persist metadata and sanitized observations only.

Offline tests separate deterministic compiler/controller correctness from live
model quality. Passing scripted sessions is not evidence of improved AI quality.
Default-on rollout requires independent live-model evaluation and human review.

The SDK ESM build externalizes ts-morph, following the existing MCP/CLI build
pattern. The SDK declares the same existing ts-morph 28 runtime dependency so
published imports resolve it correctly. This repairs a packaged-import failure
from bundling its CommonJS fs requires. No new dependency implementation or
version is introduced; the existing MIT-licensed parser dependency is reused.
