import { resolve } from "node:path";
import type {
  ActionObservation,
  ContextRequest,
  HandoffState,
  PolicyDecision,
  SessionPort,
  TaskEvent,
  VerificationReport,
  VerifierPort,
  VerifyConfig,
  WorkPacket,
} from "@prof-bilal/atlas-core";
import type { ContextSDK } from "../context/sdk";
import { appendControlEvent, emptyControl } from "./control-state";
import { denyFilter } from "./deny";
import type { ContextIntegration } from "./index";
import {
  type TaskLedger,
  computeFilesTouched,
  createTaskLedgerDocument,
  loadTaskLedger,
  saveTaskLedger,
  withTaskProgress,
  withTaskSession,
} from "./task-ledger";
import { buildWorkPacket, evaluatePacketPolicy, packetPath, pathInScope } from "./work-packet";

export interface ControlPlaneOptions {
  readonly context: ContextSDK;
  readonly integration: ContextIntegration;
  readonly sessions: SessionPort;
  readonly verifier: VerifierPort;
}
export interface ControlRunInput extends ContextRequest {
  readonly provider: string;
  readonly taskId?: string;
  readonly resume?: boolean;
  readonly highRisk?: boolean;
  readonly approved?: boolean;
  /** Only explicit caller-approved command configurations are executed. */
  readonly verifyConfig?: VerifyConfig;
}
export interface ControlRunResult {
  readonly taskId: string;
  readonly packet: WorkPacket;
  readonly policy: PolicyDecision;
  readonly handoff: HandoffState;
  readonly observation?: ActionObservation;
  readonly verification?: VerificationReport;
  readonly followUp?: WorkPacket;
}
export interface ControlPlane {
  buildPacket(request: ContextRequest): Promise<WorkPacket>;
  run(input: ControlRunInput): Promise<ControlRunResult>;
  getHandoff(taskId: string): Promise<HandoffState | null>;
  recordDecision(taskId: string, decision: string, supersedes?: string): Promise<HandoffState>;
}
const activeRepositories = new Set<string>();

function safeText(text: string): string {
  return denyFilter("observation.txt", text).accepted
    ? text.slice(0, 4000)
    : "[Sensitive output omitted]";
}

/** Compose local control around external sessions; does not intercept their tools. */
export function createControlPlane(options: ControlPlaneOptions): ControlPlane {
  const { context, integration, sessions, verifier } = options;
  const root = context.config.repositoryPath;
  return {
    async getHandoff(taskId: string): Promise<HandoffState | null> {
      return (await loadTaskLedger(root, taskId))?.control?.handoff ?? null;
    },
    async recordDecision(
      taskId: string,
      decision: string,
      supersedes?: string,
    ): Promise<HandoffState> {
      if (activeRepositories.has(resolve(root)))
        throw new Error("Repository already has an active control-plane run.");
      if (
        !decision.trim() ||
        decision.length > 1000 ||
        !denyFilter("decision.txt", decision).accepted
      )
        throw new Error("Decision is empty, oversized or sensitive.");
      activeRepositories.add(resolve(root));
      try {
        const ledger = await loadTaskLedger(root, taskId);
        if (!ledger?.control || resolve(ledger.repositoryPath) !== resolve(root))
          throw new Error("Control task not found.");
        if (supersedes !== undefined && !ledger.control.handoff.decisions.includes(supersedes))
          throw new Error("Superseded decision not found.");
        const control = appendControlEvent(
          {
            ...ledger.control,
            handoff: {
              ...ledger.control.handoff,
              decisions: ledger.control.handoff.decisions.filter((value) => value !== supersedes),
            },
          },
          {
            kind: "decision-recorded",
            state: ledger.control.handoff.state,
            packetId: ledger.control.handoff.packetId,
            detail: decision,
            ...(supersedes === undefined ? {} : { supersedes }),
          },
        );
        await saveTaskLedger(root, { ...ledger, control, updatedAt: new Date().toISOString() });
        return control.handoff;
      } finally {
        activeRepositories.delete(resolve(root));
      }
    },
    buildPacket(request: ContextRequest): Promise<WorkPacket> {
      return buildWorkPacket(context, request);
    },
    async run(input: ControlRunInput): Promise<ControlRunResult> {
      if (activeRepositories.has(resolve(root)))
        throw new Error("Repository already has an active control-plane run.");
      activeRepositories.add(resolve(root));
      try {
        const previousLedger =
          input.taskId === undefined ? null : await loadTaskLedger(root, input.taskId);
        const request = {
          ...input,
          ...(previousLedger?.control === undefined
            ? {}
            : { priorState: previousLedger.control.handoff }),
        };
        const packet = await buildWorkPacket(context, request);
        let policy = evaluatePacketPolicy(packet, input);
        const active = sessions
          .getActiveSessions()
          .filter((session) => resolve(session.repositoryPath) === resolve(root));
        if (active.length > 0)
          policy = {
            status: "denied",
            reasons: [
              "Repository has an active external session. Stop it before starting another controlled run.",
            ],
          };
        if (
          packet.verificationRequired &&
          (!input.verifyConfig?.enabled || Object.keys(input.verifyConfig.commands).length === 0)
        )
          policy = {
            status: "unavailable",
            reasons: [
              "Required verification commands are unavailable. Provide an explicit verification configuration.",
            ],
          };
        if (input.highRisk === true && input.approved !== true)
          policy = {
            status: "requires-approval",
            reasons: ["This high-risk run requires explicit caller approval."],
          };
        let ledger =
          input.taskId === undefined
            ? createTaskLedgerDocument({
                task: input.task,
                repositoryPath: root,
                hashes: context.hashes(),
              })
            : previousLedger;
        if (ledger === null) throw new Error("Task ledger not found.");
        if (resolve(ledger.repositoryPath) !== resolve(root) || ledger.task !== input.task)
          throw new Error("Task does not belong to this request.");
        if (
          ledger.control &&
          JSON.stringify(ledger.control.scopePaths) !== JSON.stringify(packet.scopePaths)
        )
          throw new Error("Resuming a task cannot silently change its scope.");
        if (ledger.control && input.resume !== true)
          throw new Error("Existing control tasks require explicit resume.");
        ledger = {
          ...ledger,
          schemaVersion: 2,
          control: ledger.control ?? emptyControl(packet.scopePaths),
        };
        const emit = async (event: Omit<TaskEvent, "sequence" | "packetId">): Promise<void> => {
          ledger = {
            ...(ledger as TaskLedger),
            updatedAt: new Date().toISOString(),
            control: appendControlEvent(ledger?.control ?? emptyControl(packet.scopePaths), {
              ...event,
              packetId: packet.id,
            }),
          };
          await saveTaskLedger(root, ledger);
        };
        if (ledger.control?.handoff.state === "complete")
          await emit({
            kind: "handoff-created",
            state: "handed-off",
            detail: "Explicitly resumed completed task.",
          });
        if (
          ledger.control &&
          ["editing", "verifying", "evidence-confirmed"].includes(ledger.control.handoff.state)
        ) {
          const last = ledger.sessions.at(-1);
          const live = last === undefined ? undefined : sessions.getSession(last.sessionId);
          if (live && !["STOPPED", "FAILED"].includes(live.status)) {
            const stopped = await sessions.terminateSession(live.id);
            if (!stopped.ok)
              throw new Error("Cannot resume while the prior session remains active.");
          }
          await emit({
            kind: "blocked",
            state: "blocked",
            detail: "Interrupted prior run; rebuilt evidence is required before continuing.",
          });
        }
        await emit({
          kind: "context-built",
          state: "exploring",
          detail: `Compiled packet ${packet.id}`,
        });
        const result = (extra: Partial<ControlRunResult> = {}): ControlRunResult => ({
          taskId: ledger?.id ?? "",
          packet,
          policy,
          handoff: ledger?.control?.handoff ?? emptyControl([]).handoff,
          ...extra,
        });
        if (policy.status !== "allowed" && policy.status !== "allowed-with-warning") {
          await emit({ kind: "blocked", state: "blocked", detail: policy.reasons.join(" ") });
          return result();
        }
        await emit({
          kind: "decision-recorded",
          state: "evidence-confirmed",
          detail: "Scope and preflight accepted. External-agent edits are checked after execution.",
        });
        await emit({
          kind: "action-requested",
          state: "editing",
          detail: "Launch external session.",
        });
        let started: Awaited<ReturnType<ContextIntegration["launch"]>>;
        try {
          started = await integration.launch({
            ...request,
            repositoryPath: root,
            deliveryMode: "workPacket",
            recordTask: false,
          });
        } catch {
          await emit({ kind: "blocked", state: "blocked", detail: "Session launch failed." });
          return result();
        }
        if (!started.ok) {
          await emit({
            kind: "blocked",
            state: "blocked",
            detail: "Session launch failed; inspect the session adapter.",
          });
          return result();
        }
        let session = started.value;
        ledger = withTaskSession(ledger, {
          sessionId: session.id,
          provider: session.provider,
          model: session.model ?? null,
          status: session.status,
          startedAt: session.startedAt,
          endedAt: session.endedAt,
        });
        await emit({
          kind: "action-observed",
          state: "editing",
          detail: `Session started: ${session.id}`,
        });
        let interrupted = false;
        if (
          (session.status === "RUNNING" || session.status === "STARTING") &&
          sessions.waitForSession
        ) {
          const waited = await sessions.waitForSession(session.id);
          if (waited.ok) session = waited.value;
        }
        if (session.status !== "STOPPED" && session.status !== "FAILED") {
          interrupted = true;
          await sessions.terminateSession(session.id);
          session = sessions.getSession(session.id) ?? session;
        }
        const changed = await computeFilesTouched(root, ledger.hashSnapshotAtStart, true);
        const output = sessions.getSessionOutput(session.id);
        const observation: ActionObservation = {
          sessionId: session.id,
          status: session.status,
          output: safeText(`${output?.stdout ?? ""}\n${output?.stderr ?? ""}`),
          filesTouched: changed.filesTouched.filter((path) => denyFilter(path, "").accepted),
          filesTouchedUnknown: changed.unknown || changed.truncated,
        };
        ledger = withTaskSession(
          { ...ledger, sessions: ledger.sessions.filter((row) => row.sessionId !== session.id) },
          {
            sessionId: session.id,
            provider: session.provider,
            model: session.model ?? null,
            status: session.status,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
          },
        );
        ledger = withTaskProgress(ledger, {
          lastOutput: observation.output,
          lastOutputTruncated: observation.output.length >= 4000,
          filesTouched: observation.filesTouched,
          filesTouchedTruncated: changed.truncated,
          filesTouchedUnknown: changed.unknown,
          transcriptAvailable: observation.output.trim() !== "",
        });
        await emit({
          kind: "action-observed",
          state: "editing",
          detail: `Observed external session: ${session.status}`,
        });
        let scopeViolation = false;
        for (const path of changed.filesTouched) {
          try {
            if (!pathInScope(root, packetPath(root, path), packet.scopePaths))
              scopeViolation = true;
          } catch {
            scopeViolation = true;
          }
        }
        if (
          session.status !== "STOPPED" ||
          interrupted ||
          session.exitCode !== 0 ||
          observation.filesTouchedUnknown ||
          scopeViolation
        ) {
          await emit({
            kind: "blocked",
            state: "blocked",
            detail: scopeViolation
              ? "Changed paths exceed authorized scope."
              : "Session did not complete successfully or file changes are unknown.",
          });
          return result({ observation });
        }
        await emit({
          kind: "verification-started",
          state: "verifying",
          detail: "Run caller-approved repository checks.",
        });
        if (
          packet.verificationRequired &&
          (!input.verifyConfig?.enabled || Object.keys(input.verifyConfig.commands).length === 0)
        ) {
          await emit({
            kind: "verification-failed",
            state: "blocked",
            detail:
              "Required verification commands are unavailable. Provide an explicit verification configuration.",
          });
          return result({ observation });
        }
        let verification: VerificationReport;
        try {
          const refreshed = await context.refresh();
          if (!refreshed.ok) throw new Error("Verification index refresh failed.");
          const currentPaths = new Set(
            context.files.listFiles().map((file) => resolve(root, file.path)),
          );
          const report = await verifier.verify(
            {
              task: packet.task,
              citedPaths: (observation.filesTouched.length > 0
                ? observation.filesTouched
                : packet.evidence.flatMap((ref) =>
                    ref.path !== null && ref.role !== "constraint" ? [ref.path] : [],
                  )
              )
                .map((path) => resolve(root, path))
                .filter((path) => currentPaths.has(path)),
              citedSymbols: [],
              planTargets: [],
            },
            input.verifyConfig,
            root,
          );
          verification = {
            ...report,
            summary: safeText(report.summary),
            claims: {
              ...report.claims,
              checks: report.claims.checks.map((check) => ({
                ...check,
                detail: safeText(check.detail),
              })),
            },
            commands: report.commands.map((command) => ({
              ...command,
              stdout: safeText(command.stdout),
              stderr: safeText(command.stderr),
            })),
          };
        } catch {
          await emit({
            kind: "verification-failed",
            state: "blocked",
            detail: "Verifier failed; task remains incomplete.",
          });
          return result({ observation });
        }
        const finalDelta = await computeFilesTouched(root, ledger.hashSnapshotAtStart, true);
        const finalScopeSafe =
          !finalDelta.unknown &&
          !finalDelta.truncated &&
          finalDelta.filesTouched.every((path) => {
            try {
              return pathInScope(root, path, packet.scopePaths);
            } catch {
              return false;
            }
          });
        if (!finalScopeSafe) {
          await emit({
            kind: "verification-failed",
            state: "blocked",
            detail: "Verification left unknown changes or changes outside authorized scope.",
          });
          return result({ observation, verification });
        }
        const passed =
          verification.verdict === "pass" &&
          verification.claims.allPassed &&
          (verification.claims.checks.length > 0 || verification.commands.length > 0) &&
          (!packet.verificationRequired ||
            (verification.commands.length > 0 &&
              verification.commands.every(
                (command) => command.exitCode === 0 && !command.timedOut,
              )));
        for (const command of verification.commands) {
          await emit({
            kind: "verification-started",
            state: "verifying",
            detail: safeText(
              JSON.stringify({
                command: command.command,
                args: command.args,
                exitCode: command.exitCode,
                timedOut: command.timedOut,
                stderr: command.stderr.slice(0, 500),
              }),
            ),
          });
        }
        if (!passed) {
          const failureDetail = safeText(
            [
              verification.summary,
              ...verification.commands
                .filter((command) => command.exitCode !== 0 || command.timedOut)
                .map((command) => command.stderr)
                .filter(Boolean),
            ].join("\n"),
          );
          await emit({
            kind: "verification-failed",
            state: "blocked",
            detail: failureDetail,
          });
          const followUp = await buildWorkPacket(context, {
            ...input,
            task: input.task,
            ...(ledger.control === undefined ? {} : { priorState: ledger.control.handoff }),
            scopePaths: packet.scopePaths,
          });
          return result({ observation, verification, followUp });
        }
        await emit({
          kind: "verification-passed",
          state: "verifying",
          detail: "Verification passed.",
        });
        await emit({
          kind: "completed",
          state: "complete",
          detail: "Session and verification completed successfully.",
        });
        return result({ observation, verification });
      } finally {
        activeRepositories.delete(resolve(root));
      }
    },
  };
}
