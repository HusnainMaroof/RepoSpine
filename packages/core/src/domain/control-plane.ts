import type { ContextPlan } from "../ports/planner.port";
import type { LineRange } from "./entities";

export type EvidenceRole =
  | "target"
  | "definition"
  | "caller"
  | "callee"
  | "test"
  | "constraint"
  | "summary"
  | "alternative"
  | "background";
export type EvidenceRepresentation = "pointer" | "outline" | "range" | "full";
export type TaskState =
  | "planned"
  | "exploring"
  | "evidence-confirmed"
  | "editing"
  | "verifying"
  | "blocked"
  | "complete"
  | "handed-off";
export interface ContextRequest {
  readonly changeId?: string;
  readonly priorState?: HandoffState;
  readonly task: string;
  readonly scopePaths?: readonly string[];
  readonly maxTokens?: number;
  readonly requireFresh?: boolean;
  readonly verificationRequired?: boolean;
}
export interface EvidenceRef {
  readonly id: string;
  readonly path: string | null;
  readonly ranges: readonly LineRange[];
  readonly role: EvidenceRole;
  readonly reason: string;
  readonly source: string;
  readonly score: number;
  /** Ranking band, not a calibrated probability. */
  readonly confidence: "high" | "medium" | "low";
  readonly freshness: "fresh" | "stale" | "unknown" | "unavailable";
  readonly traversalPath: readonly string[];
  readonly representation: EvidenceRepresentation;
  readonly trust: "repository-data";
  readonly content: string;
  readonly deferred: boolean;
}
export interface WorkPacket {
  readonly changeId?: string;
  readonly priorState?: HandoffState;
  readonly schemaVersion: 1;
  readonly id: string;
  readonly task: string;
  readonly scopePaths: readonly string[];
  readonly plan: ContextPlan;
  readonly evidence: readonly EvidenceRef[];
  readonly freshness: "fresh" | "stale" | "unknown" | "unavailable";
  readonly omissions: readonly string[];
  readonly verificationRequired: boolean;
  readonly outputContract: string;
  readonly budget: { readonly maxTokens: number; readonly estimatedTokens: number };
}
export interface PolicyDecision {
  readonly status:
    | "allowed"
    | "allowed-with-warning"
    | "requires-approval"
    | "denied"
    | "unavailable";
  readonly reasons: readonly string[];
}
export interface ActionRequest {
  readonly taskId: string;
  readonly provider: string;
  readonly packetId: string;
}
export interface ActionObservation {
  readonly sessionId: string;
  readonly status: string;
  readonly output: string;
  readonly filesTouched: readonly string[];
  readonly filesTouchedUnknown: boolean;
}
export interface HandoffState {
  readonly state: TaskState;
  readonly packetId: string;
  readonly decisions: readonly string[];
  readonly failures: readonly string[];
  readonly nextAction: string;
}
export interface TaskEvent {
  readonly supersedes?: string;
  readonly sequence: number;
  readonly kind:
    | "context-built"
    | "action-requested"
    | "action-observed"
    | "verification-started"
    | "verification-failed"
    | "verification-passed"
    | "decision-recorded"
    | "handoff-created"
    | "compacted"
    | "completed"
    | "blocked";
  readonly state: TaskState;
  readonly packetId: string;
  readonly detail: string;
}
export interface TaskControlRecord {
  readonly scopePaths: readonly string[];
  readonly events: readonly TaskEvent[];
  readonly handoff: HandoffState;
  readonly compacted: boolean;
}
