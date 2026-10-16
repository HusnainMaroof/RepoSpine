# Control plane validation — 2026-10-16

Status: experimental, opt-in. Legacy delivery remains the default.

## Implemented

- Provider-neutral WorkPacket and evidence contracts in core.
- SDK context compiler with selected symbol ranges, full-file fallback,
  duplicate suppression, deferred pointers, provenance and a rendered budget cap.
- Existing ContextPlan reuse and a compatible ContextIntegration extension.
- Local controller with preflight, external SessionPort delivery, observation,
  scope checks, VerifierPort outcomes and bounded follow-up packets.
- V2 task events in the existing task ledger, atomic writes, v1 read compatibility,
  decision supersession, handoff projection and explicit compaction.
- Read-only MCP build_work_packet with annotations and protocol tests.

The external CLI remains responsible for its internal tool loop. Scope checks
observe scanner-visible changes after execution and after verification. They
do not sandbox external processes. The SDK rejects concurrent runs in one
process; cross-process coordination remains the application's responsibility.

## Verification evidence

A full workspace regression pass completed with 147 test files and 1,524 tests.
The final deletion and post-verification scope regressions were subsequently
checked with the control-plane and ledger suites: 46 tests passed.

The workspace build completed. Final SDK/MCP build, type, lint, and formatting
checks are recorded in the implementation handoff.

A fresh-process SDK ESM import exposed bundled ts-morph CommonJS requires that
source-alias tests did not exercise. The SDK now follows the existing MCP/CLI
externalization pattern and declares the existing ts-morph version directly.
The regression test imports the built SDK in a separate Node process.

## Offline delivery comparison

The corpus uses 40 explicit-path fixture prompts across eight source areas,
tested at five budgets: 200 delivery cases. These exercise localization and
delivery invariants; they are not 200 real agent patch runs.

Both legacy and WorkPacket delivery retained the expected target in 200/200
cases. Aggregate estimated rendered tokens were:

- legacy: 904,483;
- WorkPacket: 995,980;
- increase: approximately 10.1%.

WorkPackets included 2,674 deferred references across the cases. Counts use the
existing character-based estimate, not actual provider billing. The extra
metadata has a measurable cost; no token-saving or real-model quality claim is
made.

## Release decision

Keep the new path opt-in. Deterministic behavior and compatibility have evidence.
Default-on still needs representative live-agent trials for patch correctness,
tool selection, actual cost, latency and scope adherence, followed by human
review. No provider was invoked for this validation.

