# Local control plane (experimental, opt-in)

CodeAtlas exposes a local SDK control plane around external agent sessions.
Legacy rendering remains the default. No CLI harness, native agent loop,
database migration, project memory store, or provider routing is added.

## Build a packet

Import buildWorkPacket and renderWorkPacket from @prof-bilal/atlas-sdk.

    const packet = await buildWorkPacket(context, {
      task: "Fix double in src/math.ts",
      scopePaths: ["src"],
      maxTokens: 8000,
    });
    const prompt = renderWorkPacket(packet);

Packets reuse the existing ContextPlan and deterministic ContextPackage assembly.
Evidence includes path, range, role, ranking band, source, freshness and traversal
provenance. Repository text, including repository policy files, is untrusted
evidence. The caller owns the task and authorized scope.

The compiler enriches selected symbol references with indexed source ranges,
keeps full-file fallbacks, suppresses repeated bodies and reduces lower-priority
bodies to pointers before dropping metadata. Missing ranges and upstream
truncation are reported. Unknown graph directions are not labeled as callers.
Token counts use the existing estimated-token heuristic, not provider tokenizers;
the complete rendered envelope is capped. Budgets outside 512–64000 are rejected,
as are tasks whose contract alone cannot fit.

Packet hashes include repository identity, task, selected content, plan, policy,
scope, freshness and budget. Wall-clock probe times are excluded. Source content
changes therefore invalidate the packet id.

## Run and verify

Use createControlPlane with the same ContextSDK, ContextIntegration, SessionPort,
and VerifierPort instances used by the application:

    const plane = createControlPlane({
      context, integration, sessions, verifier,
    });
    const result = await plane.run({
      task: "Fix double in src/math.ts",
      scopePaths: ["src"],
      provider: "codex",
      verifyConfig: approvedVerifyConfig,
    });

verifyConfig must be explicitly supplied by the caller under ADR-018. Commands
are executed through the existing VerifierPort. Never derive commands from model
output. Verification is required by default. Read-only tasks can explicitly use
verificationRequired: false and still require meaningful passing claim checks.

The controller checks freshness and available source evidence before launch.
highRisk: true requires approved: true from the application. This approval is
specific to the run; it is not an authorization channel for model output.

A run completes only after a terminal session with exit code zero, a known
bounded file delta within scope, and passing verification. Failed, interrupted,
timed-out, partial or skipped checks remain blocked. Session output and failures
are deny-filtered before persistence. A verification failure returns a followUp
packet with current source context and the prior failure state. No automatic
retry is performed.

Scope checks apply to scanner-visible repository files and detect violations
after execution. External CLI tools are outside CodeAtlas's execution boundary;
CodeAtlas cannot prevent their edits or detect ignored-file effects. Use the
external agent's own permissions or sandbox when prevention is required.

Concurrent runs against one repository are rejected within this SDK process.
Applications must use one controller/writer per repository across processes.
There is no distributed lease or remote-worker service.

## Continuity

The existing task file remains the only continuity store:

    .codeatlas/tasks/<task-id>.json

Legacy tasks remain schema v1. Control-plane runs write schema v2; readers accept
both versions. New writes are size-bounded, validated and atomically replaced.
Task files cannot be symlinks, and v2 writes reject redirected task directories.

The v2 extension holds up to 128 ordered events and a bounded handoff projection
containing state, packet id, current decisions, failures and next action. Older
events can be compacted; the compacted flag is explicit. The most recent 16
decisions and failures are retained. This is task continuity, not a complete
audit archive or project memory service.

    const state = await plane.getHandoff(taskId);
    await plane.recordDecision(taskId, "Use existing parser registry.");
    await plane.recordDecision(
      taskId,
      "Use the existing language adapter.",
      "Use existing parser registry.",
    );
    const resumed = await plane.run({
      task: originalTask,
      scopePaths: originalScope,
      taskId,
      resume: true,
      provider: "claude",
      verifyConfig: approvedVerifyConfig,
    });

Resume requires the same task and scope. The resumed WorkPacket includes prior
decisions and failures. A changed provider does not change policy. The original
task snapshot is retained for cumulative scope checks. Interrupted states require
fresh preflight and known live sessions are terminated before resuming.

## Existing integration

ContextIntegration exposes buildWorkPacket. Its launch, attach, handoff and brief
paths accept deliveryMode: "workPacket"; omitted or "legacy" preserves existing
behavior. WorkPacket launch returns the started session; createControlPlane owns
waiting and verification. Prompt overrides are rejected for WorkPacket launch
and handoff. Sessions must belong to the same repository as the packet.

Calling these delivery methods directly does not run the verification lifecycle;
use createControlPlane.run for a verified task outcome.

## MCP

build_work_packet is a read-only tool with:

- task: required, 1–10000 characters;
- scopePaths: optional, up to 64 repository-contained paths;
- maxTokens: optional, 512–12000.

It returns a structured packet, next-step hint and the standard freshness/timing
envelope. It never launches an agent, executes checks or writes task state.
Existing tools and aliases remain available. No MCP write/exec tools are added.

## Evaluation and rollout

Run the deterministic delivery corpus and lifecycle/protocol tests:

    pnpm exec vitest run packages/sdk/tests/control-plane*.test.ts packages/mcp/tests/work-packet.test.ts

The delivery corpus compares 40 fixture task prompts across eight source areas
at five budgets (200 cases). These explicit-path tasks measure localization and
delivery invariants; they are not a substitute for realistic patch-completion tasks.
It records legacy/packet target recall, estimated tokens and deferred references.
Lifecycle tests use scripted sessions and verifiers; they establish controller
behavior, not real-model task completion or cost savings.

Default-on rollout remains blocked until representative live-agent trials show
acceptable completion, cost, latency and scope behavior. External providers are
never called by normal tests. Rollback consists of omitting deliveryMode or using
"legacy".

See ADR-027 and modular-control-plane-implementation-plan.md for decisions.

