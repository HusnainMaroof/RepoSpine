import { createHash, randomBytes } from "node:crypto";
import type {
  BeginChangeInput,
  ChangeReceipt,
  ChangeSession,
  MutationJustification,
  ProofNode,
  ProofPort,
  ProofProposal,
  ProofRepositoryPort,
  ProofStorePort,
} from "@prof-bilal/atlas-core";
import { evaluateProof, invalidateEvidence } from "./truth";

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function scopes(paths: readonly string[]): string[] {
  if (
    paths.length > 64 ||
    paths.some(
      (p) =>
        p !== "." &&
        (!p ||
          p.length > 1000 ||
          p.startsWith("/") ||
          p.includes("\\") ||
          p.split("/").some((s) => s === ".." || s === "." || !s) ||
          p.includes("\0")),
    )
  )
    throw new Error("Invalid repository-relative scope.");
  return [...new Set(paths)].sort();
}
function compile(session: ChangeSession, proposals: readonly ProofProposal[]): ProofNode[] {
  if (proposals.length > 128) throw new Error("Proof node limit exceeded.");
  const ids = new Map(proposals.map((p) => [p.key, digest([session.id, p.kind, p.key])]));
  if (ids.size !== proposals.length) throw new Error("Duplicate proposal keys.");
  const kinds = [
    "Requirement",
    "Constraint",
    "Invariant",
    "Claim",
    "Assumption",
    "Unknown",
    "ProofObligation",
  ];
  const nodes: ProofNode[] = proposals.map((p) => {
    if (
      !/^[a-zA-Z0-9_-]{1,80}$/.test(p.key) ||
      !kinds.includes(p.kind) ||
      !p.statement?.trim() ||
      p.statement.length > 10000
    )
      throw new Error("Invalid proof proposal.");
    const level = p.minimumLevel ?? (p.kind === "Requirement" ? 3 : 1);
    if (
      ![0, 1, 2, 3, 4, 5].includes(level) ||
      !["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(p.severity ?? "HIGH")
    )
      throw new Error("Invalid proof policy.");
    if (
      p.action &&
      (![
        "artifact-exists",
        "text-absent",
        "command",
        "runtime-probe",
        "public-contract-unchanged",
      ].includes(p.action.kind) ||
        !p.action.target ||
        p.action.target.length > 1000)
    )
      throw new Error("Invalid verification action.");
    const id = ids.get(p.key);
    if (!id) throw new Error("Invalid proof proposal.");
    const previous = session.nodes.find((n) => n.id === id);
    const severityRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    if (
      previous &&
      ((p.minimumLevel !== undefined && level < previous.minimumLevel) ||
        (p.severity !== undefined && severityRank[p.severity] > severityRank[previous.severity]))
    )
      throw new Error("Proposal replacement cannot weaken established proof policy.");
    return {
      id,
      version: (previous?.version ?? 0) + 1,
      kind: p.kind,
      statement: p.statement.trim(),
      severity: p.severity ?? previous?.severity ?? "HIGH",
      minimumLevel: p.minimumLevel ?? previous?.minimumLevel ?? level,
      dependsOn: (p.dependsOn ?? []).map((key) => ids.get(key) ?? key),
      provenance: p.provenance ?? "model-proposed",
      action: p.action
        ? { ...p.action, paths: scopes(p.action.paths.length ? p.action.paths : ["."]) }
        : null,
    };
  });
  const replaced = new Set(nodes.map((n) => n.id));
  const merged = [...session.nodes.filter((n) => !replaced.has(n.id)), ...nodes];
  if (merged.length > 1024) throw new Error("Proof node limit exceeded.");
  const byId = new Map(merged.map((n) => [n.id, n]));
  if (byId.size !== merged.length)
    throw new Error("Proof node already exists; revise it explicitly.");
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const walk = (id: string): void => {
    if (visiting.has(id)) throw new Error("Proof dependencies must be acyclic.");
    if (visited.has(id)) return;
    const n = byId.get(id);
    if (!n) throw new Error("Unknown proof dependency.");
    visiting.add(id);
    for (const dep of n.dependsOn) walk(dep);
    visiting.delete(id);
    visited.add(id);
  };
  for (const n of merged) walk(n.id);
  return merged;
}
function validateJustifications(
  session: ChangeSession,
  items: readonly MutationJustification[],
): MutationJustification[] {
  if (!Array.isArray(items) || items.length > 128)
    throw new Error("Mutation authorization limit exceeded.");
  return items.map((item) => {
    const node = session.nodes.find((n) => n.id === item.nodeId);
    if (
      !node ||
      !["Requirement", "Constraint", "Invariant", "Claim"].includes(node.kind) ||
      !item.reason?.trim() ||
      item.reason.length > 1000 ||
      !["requirement", "constraint", "invariant", "bug", "refactor", "dependency"].includes(
        item.kind,
      )
    )
      throw new Error("Invalid mutation justification.");
    return { ...item, paths: scopes(item.paths) };
  });
}

/** All repository IO and execution come through injected ports, never model verdicts. */
export function createProofEngine(
  store: ProofStorePort,
  repository: ProofRepositoryPort,
): ProofPort {
  const load = (id: string): ChangeSession => {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new Error("Invalid change id.");
    const session = store.get(id);
    if (!session) throw new Error("Change session not found.");
    return session;
  };
  const save = (session: ChangeSession, patch: Partial<ChangeSession>): ChangeSession => {
    const next = { ...session, ...patch, version: session.version + 1 };
    store.put(next, session.version);
    return next;
  };
  const observe = async (session: ChangeSession): Promise<ChangeSession> => {
    const current = await repository.observe();
    if (current.repositoryId !== session.repositoryId)
      throw new Error("Repository identity mismatch.");
    const evidence = invalidateEvidence(session, current);
    const draft = { ...session, current, evidence };
    const report = evaluateProof(draft);
    const blocked = !current.complete;
    return save(session, {
      current,
      evidence,
      state: blocked
        ? "BLOCKED"
        : report.debt.some((d) => d.severity === "CRITICAL" || d.severity === "HIGH")
          ? "NOT_PROVEN"
          : session.state === "PROVEN"
            ? "PROVEN"
            : "VERIFYING",
    });
  };
  const api: ProofPort = {
    async begin(input: BeginChangeInput) {
      if (!input.goal?.trim() || input.goal.length > 10000)
        throw new Error("A bounded goal is required.");
      const current = await repository.observe();
      const budget = input.semanticChangeBudget ?? 20;
      if (!Number.isSafeInteger(budget) || budget < 0 || budget > 10000)
        throw new Error("Invalid change budget.");
      let session: ChangeSession = {
        schemaVersion: 1,
        id: randomBytes(16).toString("hex"),
        version: 1,
        goal: input.goal.trim(),
        repositoryId: current.repositoryId,
        baseline: current,
        current,
        boundary: scopes(input.boundary ?? ["."]),
        authorizedPaths: scopes(input.authorizedPaths ?? []),
        semanticChangeBudget: budget,
        state: current.complete ? "INVESTIGATING" : "BLOCKED",
        nodes: [],
        evidence: [],
        receipts: [],
      };
      session = {
        ...session,
        nodes: compile(
          session,
          input.proposals?.length
            ? input.proposals
            : [
                {
                  key: "goal",
                  kind: "Requirement",
                  statement: session.goal,
                  severity: "CRITICAL",
                  provenance: "user",
                  minimumLevel: 3,
                },
              ],
        ),
      };
      const rules = input.investigationRules ?? [];
      const justifications = input.justifications ?? [];
      if (rules.length > 64 || justifications.length > 128)
        throw new Error("Investigation/authorization limit exceeded.");
      for (const rule of rules) {
        scopes(rule.triggerPaths);
        scopes(rule.expectedPaths);
        if (!rule.reason?.trim() || rule.reason.length > 1000)
          throw new Error("Invalid investigation rule.");
      }
      session = {
        ...session,
        investigationRules: rules,
        justifications: validateJustifications(session, justifications),
      };
      store.put(session, null);
      return evaluateProof(session);
    },
    async understand(id, proposals) {
      const session = await observe(load(id));
      const nodes = compile(session, proposals);
      const changedIntent = nodes.some(
        (n) =>
          ["Requirement", "Constraint", "Invariant"].includes(n.kind) &&
          session.nodes.some((old) => old.id === n.id && old.version !== n.version),
      );
      const evidence = changedIntent
        ? session.evidence.map((e) => ({
            ...e,
            status: "stale" as const,
            validUntilRevision: session.current.id,
            invalidatedBy: [...e.invalidatedBy, "intent-recompiled"],
          }))
        : session.evidence;
      const proposed = (session.proposed ?? []).filter(
        (p) =>
          !proposals.some(
            (accepted) =>
              accepted.key === p.key &&
              accepted.kind === p.kind &&
              accepted.statement === p.statement,
          ),
      );
      return evaluateProof(save(session, { nodes, evidence, proposed, state: "PLANNED" }));
    },
    async revise(id, nodeId, statement) {
      if (!statement.trim() || statement.length > 10000)
        throw new Error("Invalid revised statement.");
      const session = await observe(load(id));
      if (!session.nodes.some((n) => n.id === nodeId)) throw new Error("Unknown proof node.");
      const nodes = session.nodes.map((n) =>
        n.id === nodeId ? { ...n, statement, version: n.version + 1 } : n,
      );
      // Derived obligations may have interpreted the old wording: reopen their checks too.
      const evidence = session.evidence.map((e) => ({
        ...e,
        status: "stale" as const,
        validUntilRevision: session.current.id,
        invalidatedBy: [...e.invalidatedBy, `requirement-revised:${nodeId}`],
      }));
      return evaluateProof(save(session, { nodes, evidence, state: "PLANNED" }));
    },
    async check(id) {
      return evaluateProof(await observe(load(id)));
    },
    async authorize(id, justifications) {
      const session = await observe(load(id));
      return evaluateProof(
        save(session, { justifications: validateJustifications(session, justifications) }),
      );
    },
    async stageProposals(id, proposals) {
      const session = await observe(load(id));
      if (session.proposed?.length)
        throw new Error("Review existing staged proposals before replacing them.");
      compile({ ...session, nodes: [] }, proposals);
      save(session, { proposed: proposals.map((p) => ({ ...p, provenance: "model-proposed" })) });
    },
    async dismissProposals(id, decisions) {
      const session = await observe(load(id));
      if (
        !Array.isArray(decisions) ||
        decisions.length > 32 ||
        decisions.some(
          (d) =>
            !session.proposed?.some((p) => p.key === d.key) ||
            !d.reason?.trim() ||
            d.reason.length > 1000,
        )
      )
        throw new Error("Proposal dismissals need known keys and explicit bounded reasons.");
      const keys = new Set(decisions.map((d) => d.key));
      return evaluateProof(
        save(session, {
          proposed: (session.proposed ?? []).filter((p) => !keys.has(p.key)),
          proposalDecisions: [
            ...(session.proposalDecisions ?? []),
            ...decisions.map((d) => ({ ...d, revision: session.current.id })),
          ].slice(-128),
        }),
      );
    },
    async verify(id, nodeId) {
      const before = await observe(load(id));
      const node = before.nodes.find((n) => n.id === nodeId);
      if (!node?.action) throw new Error("Node has no explicit verification action.");
      if (!before.current.complete)
        throw new Error("Cannot verify an incompletely observed repository.");
      const result = await repository.execute(node.action, before.current, before.baseline);
      const current = await repository.observe();
      if (current.repositoryId !== before.repositoryId)
        throw new Error("Repository identity mismatch.");
      const stable = current.complete && current.id === before.current.id;
      const source = before.current.artifacts
        .filter((a) =>
          node.action?.paths.some((p) => p === "." || a.path === p || a.path.startsWith(`${p}/`)),
        )
        .map((a) => a.id);
      const evidence = {
        id: digest([before.id, node.id, node.version, before.current.id, before.version, result]),
        nodeId,
        nodeVersion: node.version,
        observedRevision: before.current.id,
        validFromRevision: before.current.id,
        validUntilRevision: stable ? null : current.id,
        sourceArtifactIds: source,
        scope: node.action.paths,
        derivation: result.detail.slice(0, 2000),
        level: result.level,
        result: result.result,
        status: stable ? ("fresh" as const) : ("stale" as const),
        invalidatedBy: stable ? [] : ["repository-changed-during-verification"],
        investigatedPaths:
          result.investigatedPaths ?? (node.action.kind === "text-absent" ? node.action.paths : []),
        ...(result.expiresAt ? { expiresAt: result.expiresAt } : {}),
      };
      const next = save(before, {
        current,
        evidence: [...invalidateEvidence(before, current), evidence],
        state: stable ? "VERIFYING" : "BLOCKED",
      });
      return evaluateProof(next);
    },
    async prove(id) {
      const session = await observe(load(id));
      const report = evaluateProof(session);
      const blocked = !session.current.complete;
      const proven =
        session.nodes.some((n) => n.kind === "Requirement") &&
        session.nodes
          .filter((n) => n.kind === "Requirement")
          .every(
            (n) => report.nodes.find((state) => state.nodeId === n.id)?.status === "supported",
          ) &&
        !report.debt.some((d) => d.severity === "CRITICAL" || d.severity === "HIGH");
      const receipt: ChangeReceipt = {
        id: digest([session.id, session.version, report.nodes, report.debt]),
        sessionId: session.id,
        baselineRevision: session.baseline.id,
        finalRevision: session.current.id,
        policyVersion: 1,
        completion: blocked ? "blocked" : proven ? "proven" : "not-proven",
        debt: report.debt,
        changedArtifacts: report.changedArtifacts,
        semanticChanges: report.semanticChanges,
        unjustifiedMutations: report.unjustifiedMutations,
        guaranteeCeiling: report.guaranteeCeiling,
        limitations: [
          ...session.current.limitations,
          "Proof is limited to explicit obligations and observed repository files; it is not universal correctness.",
        ],
      };
      save(session, {
        receipts: [...session.receipts, receipt].slice(-64),
        state: blocked ? "BLOCKED" : proven ? "PROVEN" : "NOT_PROVEN",
      });
      return receipt;
    },
    async exportState(id) {
      return (await api.check(id)).session;
    },
    async importState(state) {
      if (!state || typeof state !== "object" || JSON.stringify(state).length > 8 * 1024 * 1024)
        throw new Error("Invalid portable change state.");
      const input = state as ChangeSession;
      if (input.schemaVersion !== 1 || !Array.isArray(input.nodes) || input.nodes.length > 128)
        throw new Error("Unsupported portable change state.");
      const keys = new Map(input.nodes.map((n, i) => [n.id, `imported_${i}`]));
      // Reuse the compiler's validation, assigning fresh IDs and no evidence or receipt state.
      return api.begin({
        goal: input.goal,
        boundary: input.boundary,
        semanticChangeBudget: input.semanticChangeBudget,
        authorizedPaths: [],
        proposals: input.nodes.map((n, i) => ({
          key: `imported_${i}`,
          kind: n.kind,
          statement: n.statement,
          severity: n.severity,
          minimumLevel: n.minimumLevel,
          dependsOn: n.dependsOn.map((id: string) => keys.get(id) ?? "missing"),
          provenance: "model-proposed",
          ...(n.action ? { action: n.action } : {}),
        })),
      });
    },
    close() {
      store.close();
    },
  };
  return api;
}
