import type { TaskControlRecord, TaskEvent, TaskState } from "@prof-bilal/atlas-core";
import { denyFilter } from "./deny";

const MAX_EVENTS = 128;
const MAX_DETAIL = 1000;
const STATES: readonly TaskState[] = [
  "planned",
  "exploring",
  "evidence-confirmed",
  "editing",
  "verifying",
  "blocked",
  "complete",
  "handed-off",
];
const KINDS: readonly TaskEvent["kind"][] = [
  "context-built",
  "action-requested",
  "action-observed",
  "verification-started",
  "verification-failed",
  "verification-passed",
  "decision-recorded",
  "handoff-created",
  "compacted",
  "completed",
  "blocked",
];
const TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  planned: ["exploring", "blocked"],
  exploring: ["evidence-confirmed", "blocked"],
  "evidence-confirmed": ["editing", "blocked"],
  editing: ["verifying", "blocked"],
  verifying: ["complete", "blocked"],
  blocked: ["exploring", "handed-off"],
  complete: ["handed-off"],
  "handed-off": ["exploring"],
};

export function emptyControl(scopePaths: readonly string[]): TaskControlRecord {
  return {
    scopePaths,
    events: [],
    handoff: {
      state: "planned",
      packetId: "",
      decisions: [],
      failures: [],
      nextAction: "Build context.",
    },
    compacted: false,
  };
}

function safeDetail(detail: string): string {
  return denyFilter("event.txt", detail).accepted
    ? detail.slice(0, MAX_DETAIL)
    : "[Sensitive observation omitted]";
}

/** State changes and compaction preserve the bounded durable projection. */
export function appendControlEvent(
  record: TaskControlRecord,
  event: Omit<TaskEvent, "sequence">,
): TaskControlRecord {
  const current = record.handoff.state;
  if (current !== event.state && !TRANSITIONS[current].includes(event.state))
    throw new Error("Invalid control-plane state transition.");
  const detail = safeDetail(event.detail);
  const sequence = (record.events.at(-1)?.sequence ?? 0) + 1;
  const events = [...record.events, { ...event, detail, sequence }];
  const decisions =
    event.kind === "decision-recorded"
      ? [...record.handoff.decisions, detail].slice(-16)
      : record.handoff.decisions;
  const failures =
    event.kind === "verification-failed" || event.kind === "blocked"
      ? [...record.handoff.failures, detail].slice(-16)
      : record.handoff.failures;
  return {
    ...record,
    events: events.slice(-MAX_EVENTS),
    compacted: record.compacted || events.length > MAX_EVENTS,
    handoff: {
      state: event.state,
      packetId: event.packetId,
      decisions,
      failures,
      nextAction: detail,
    },
  };
}

/** Validate v2 extension without trusting casts or arbitrary event payloads. */
export function validateControlRecord(value: unknown): TaskControlRecord {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid control record.");
  const record = value as Record<string, unknown>;
  const strings = (input: unknown, max: number): string[] => {
    if (
      !Array.isArray(input) ||
      input.length > max ||
      input.some(
        (entry) =>
          typeof entry !== "string" ||
          entry.length > MAX_DETAIL ||
          !denyFilter("state.txt", entry).accepted,
      )
    )
      throw new Error("Invalid bounded control strings.");
    return input as string[];
  };
  const scopePaths = strings(record["scopePaths"], 64);
  if (
    scopePaths.some(
      (p) =>
        p.startsWith("/") ||
        p.includes("\\") ||
        p.split("/").includes("..") ||
        !denyFilter(p, "").accepted,
    )
  )
    throw new Error("Invalid control scope.");
  const handoff = record["handoff"];
  if (!handoff || typeof handoff !== "object" || Array.isArray(handoff))
    throw new Error("Invalid handoff.");
  const h = handoff as Record<string, unknown>;
  const state = h["state"];
  const packetId = h["packetId"];
  if (
    !STATES.includes(state as TaskState) ||
    typeof packetId !== "string" ||
    !/^(?:[a-f0-9]{32})?$/.test(packetId)
  )
    throw new Error("Invalid state or packet id.");
  const nextAction = strings([h["nextAction"]], 1)[0] ?? "";
  const events = record["events"];
  if (
    !Array.isArray(events) ||
    events.length > MAX_EVENTS ||
    typeof record["compacted"] !== "boolean"
  )
    throw new Error("Invalid event bounds.");
  let last = 0;
  const validated = events.map((value: unknown): TaskEvent => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid event.");
    const e = value as Record<string, unknown>;
    if (
      !Number.isSafeInteger(e["sequence"]) ||
      (e["sequence"] as number) <= last ||
      !KINDS.includes(e["kind"] as TaskEvent["kind"]) ||
      !STATES.includes(e["state"] as TaskState) ||
      typeof e["packetId"] !== "string" ||
      !/^[a-f0-9]{32}$/.test(e["packetId"])
    )
      throw new Error("Invalid event fields.");
    last = e["sequence"] as number;
    return {
      ...(e["supersedes"] === undefined
        ? {}
        : { supersedes: strings([e["supersedes"]], 1)[0] ?? "" }),
      sequence: last,
      kind: e["kind"] as TaskEvent["kind"],
      state: e["state"] as TaskState,
      packetId: e["packetId"],
      detail: strings([e["detail"]], 1)[0] ?? "",
    };
  });
  const tail = validated.at(-1);
  if (tail && (tail.state !== state || tail.packetId !== packetId))
    throw new Error("Event projection mismatch.");
  return {
    scopePaths,
    events: validated,
    compacted: record["compacted"],
    handoff: {
      state: state as TaskState,
      packetId,
      nextAction,
      decisions: strings(h["decisions"], 16),
      failures: strings(h["failures"], 16),
    },
  };
}
