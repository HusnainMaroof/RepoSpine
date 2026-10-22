import type { ProofProposal, RepositoryRevision, VerificationResult } from "@prof-bilal/atlas-core";
import { ProofStore } from "@prof-bilal/atlas-storage";
import { afterEach, describe, expect, it } from "vitest";
import { createProofEngine, projectProofGraph } from "../src/index";

const stores: ProofStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
});
function harness() {
  const store = new ProofStore();
  stores.push(store);
  let revision: RepositoryRevision = {
    id: "r1",
    repositoryId: "repo",
    head: null,
    observedAt: "now",
    complete: true,
    artifacts: [{ id: "a", path: "src/a.ts", hash: "one" }],
    dependencies: [],
    limitations: [],
  };
  let result: VerificationResult = { result: "pass", level: 3, detail: "test passed" };
  let during: (() => void) | undefined;
  const engine = createProofEngine(store, {
    observe: async () => revision,
    execute: async () => {
      during?.();
      return result;
    },
  });
  return {
    engine,
    store,
    change(patch: Partial<RepositoryRevision>) {
      revision = { ...revision, ...patch };
    },
    result(value: VerificationResult) {
      result = value;
    },
    during(fn: () => void) {
      during = fn;
    },
  };
}
const proposals: ProofProposal[] = [
  {
    key: "test",
    kind: "ProofObligation",
    statement: "Regression passes",
    action: { kind: "command", paths: ["."], target: "test" },
    minimumLevel: 3,
  },
  {
    key: "requirement",
    kind: "Requirement",
    statement: "Preserve authentication",
    minimumLevel: 3,
    severity: "CRITICAL",
    dependsOn: ["test"],
  },
];
describe("temporal proof kernel", () => {
  it("rebinds portable intent without imported proof, authorizations or identities", async () => {
    const h = harness();
    const first = await h.engine.begin({ goal: "x", proposals, authorizedPaths: ["."] });
    await h.engine.verify(first.session.id, first.session.nodes[0].id);
    const state = await h.engine.exportState(first.session.id);
    const imported = await h.engine.importState({ ...state, state: "PROVEN" });
    expect(imported.session.id).not.toBe(state.id);
    expect(imported.session.nodes[0].id).not.toBe(state.nodes[0].id);
    expect(imported.session.evidence).toEqual([]);
    expect(imported.session.authorizedPaths).toEqual([]);
    expect((await h.engine.prove(imported.session.id)).completion).toBe("not-proven");
  });
  it("invalidates on environment changes and stages model proposals without changing truth", async () => {
    const h = harness();
    const first = await h.engine.begin({ goal: "x", proposals });
    await h.engine.verify(first.session.id, first.session.nodes[0].id);
    await h.engine.stageProposals(first.session.id, [
      { key: "new", kind: "Requirement", statement: "Investigate reconnect" },
    ]);
    expect((await h.engine.check(first.session.id)).session.proposed).toHaveLength(1);
    expect((await h.engine.prove(first.session.id)).completion).toBe("not-proven");
    await h.engine.understand(first.session.id, []);
    expect((await h.engine.check(first.session.id)).session.proposed).toHaveLength(1);
    await expect(h.engine.stageProposals(first.session.id, [])).rejects.toThrow("Review");
    const reviewed = await h.engine.dismissProposals(first.session.id, [
      { key: "new", reason: "Reconnect is explicitly outside this literal-only requirement." },
    ]);
    expect(reviewed.session.proposalDecisions?.[0].reason).toContain("outside");
    expect((await h.engine.prove(first.session.id)).completion).toBe("proven");
    h.change({ id: "r2", environmentId: "new-toolchain" });
    const stale = await h.engine.check(first.session.id);
    expect(stale.session.evidence[0].invalidatedBy).toContain("verification-environment-changed");
    expect(projectProofGraph(stale.session).edges.some((e) => e.kind === "invalidates")).toBe(true);
    expect(projectProofGraph(stale.session).edges.some((e) => e.kind === "supports")).toBe(false);
  });
  it("reopens supporting obligations when understand revises only a requirement", async () => {
    const h = harness();
    const first = await h.engine.begin({ goal: "x", proposals });
    await h.engine.verify(first.session.id, first.session.nodes[0].id);
    const report = await h.engine.understand(first.session.id, [
      {
        ...proposals[1],
        statement: "Now include reconnect",
        dependsOn: [first.session.nodes[0].id],
      },
    ]);
    expect(report.session.evidence[0].status).toBe("stale");
    expect((await h.engine.prove(first.session.id)).completion).toBe("not-proven");
  });
  it("requires artifact justification and architecture-specific investigation", async () => {
    const h = harness();
    const first = await h.engine.begin({
      goal: "x",
      proposals,
      investigationRules: [
        { triggerPaths: ["src/a.ts"], expectedPaths: ["src/b.ts"], reason: "API boundary" },
      ],
    });
    h.change({
      id: "r2",
      artifacts: [
        { id: "a", path: "src/a.ts", hash: "two" },
        { id: "b", path: "src/b.ts", hash: "one" },
      ],
    });
    const report = await h.engine.authorize(first.session.id, [
      {
        paths: ["src/a.ts"],
        nodeId: first.session.nodes[1].id,
        reason: "Auth migration",
        kind: "requirement",
      },
    ]);
    expect(report.unjustifiedMutations).toEqual(["src/b.ts"]);
    expect(report.blindspots.find((b) => b.artifact === "src/b.ts")?.reasons).toContain(
      "architecture rule: API boundary",
    );
    await expect(
      h.engine.authorize(first.session.id, [
        { paths: ["."], nodeId: "unknown", reason: "x", kind: "refactor" },
      ]),
    ).rejects.toThrow("justification");
  });
  it("requires supported requirements even when a caller assigns low severity", async () => {
    const h = harness();
    const initial = await h.engine.begin({
      goal: "x",
      proposals: [
        {
          key: "goal",
          kind: "Requirement",
          statement: "unverified",
          severity: "LOW",
          minimumLevel: 0,
        },
      ],
    });
    expect((await h.engine.prove(initial.session.id)).completion).toBe("not-proven");
  });
  it("does not let proposal replacement downgrade an established requirement policy", async () => {
    const h = harness();
    const first = await h.engine.begin({ goal: "Preserve auth" });
    await expect(
      h.engine.understand(first.session.id, [
        {
          key: "goal",
          kind: "Requirement",
          statement: "file exists",
          severity: "LOW",
          minimumLevel: 1,
        },
      ]),
    ).rejects.toThrow("weaken");
  });
  it("ranks high-value synthesized actions ahead of low-priority existing checks", async () => {
    const h = harness();
    h.change({ verificationCatalog: [{ key: "test", level: 3, kind: "command", cost: "medium" }] });
    const report = await h.engine.begin({
      goal: "Critical behavior",
      proposals: [
        {
          key: "low",
          kind: "ProofObligation",
          statement: "file exists",
          severity: "LOW",
          minimumLevel: 1,
          action: { kind: "artifact-exists", paths: ["."], target: "src/a.ts" },
        },
        { key: "goal", kind: "Requirement", statement: "Critical behavior", severity: "CRITICAL" },
      ],
    });
    expect(report.nextActions[0].priority).toBe("CRITICAL");
    expect(report.nextActions[0].requiresAdoption).toBe(true);
  });
  it("reopens proven requirements after supporting code changes and never revives old evidence", async () => {
    const h = harness();
    const initial = await h.engine.begin({ goal: "auth", proposals });
    const obligation = initial.session.nodes[0].id;
    expect((await h.engine.prove(initial.session.id)).completion).toBe("not-proven");
    await h.engine.verify(initial.session.id, obligation);
    expect((await h.engine.prove(initial.session.id)).completion).toBe("proven");
    h.change({ id: "r2", artifacts: [{ id: "a", path: "src/a.ts", hash: "two" }] });
    const changed = await h.engine.check(initial.session.id);
    expect(changed.nodes.every((n) => n.status === "stale")).toBe(true);
    expect((await h.engine.prove(initial.session.id)).completion).toBe("not-proven");
    h.change({ id: "r1", artifacts: [{ id: "a", path: "src/a.ts", hash: "one" }] });
    expect(
      (await h.engine.check(initial.session.id)).nodes.every((n) => n.status === "stale"),
    ).toBe(true);
    await h.engine.verify(initial.session.id, obligation);
    expect((await h.engine.prove(initial.session.id)).completion).toBe("proven");
  });
  it("propagates a failing verification upward as a contradiction", async () => {
    const h = harness();
    const initial = await h.engine.begin({ goal: "auth", proposals });
    h.result({ result: "fail", level: 3, detail: "failing test" });
    const report = await h.engine.verify(initial.session.id, initial.session.nodes[0].id);
    expect(report.nodes.every((n) => n.status === "contradicted")).toBe(true);
  });
  it("keeps a fresh counterexample visible even when another prerequisite is stale", async () => {
    const h = harness();
    h.change({
      artifacts: [
        { id: "a", path: "src/a.ts", hash: "one" },
        { id: "b", path: "src/b.ts", hash: "one" },
      ],
    });
    const first = await h.engine.begin({
      goal: "Both predicates",
      authorizedPaths: ["."],
      proposals: [
        {
          key: "a",
          kind: "ProofObligation",
          statement: "a",
          minimumLevel: 1,
          action: { kind: "artifact-exists", paths: ["src/a.ts"], target: "src/a.ts" },
        },
        {
          key: "b",
          kind: "ProofObligation",
          statement: "b",
          minimumLevel: 1,
          action: { kind: "artifact-exists", paths: ["src/b.ts"], target: "src/b.ts" },
        },
        {
          key: "goal",
          kind: "Requirement",
          statement: "Both",
          minimumLevel: 1,
          dependsOn: ["a", "b"],
        },
      ],
    });
    await h.engine.verify(first.session.id, first.session.nodes[0].id);
    await h.engine.verify(first.session.id, first.session.nodes[1].id);
    h.change({
      id: "r2",
      artifacts: [
        { id: "a", path: "src/a.ts", hash: "one" },
        { id: "b", path: "src/b.ts", hash: "two" },
      ],
    });
    h.result({ result: "fail", level: 1, detail: "counterexample" });
    const report = await h.engine.verify(first.session.id, first.session.nodes[0].id);
    expect(report.nodes.find((n) => n.nodeId === first.session.nodes[1].id)?.status).toBe("stale");
    expect(report.nodes.find((n) => n.nodeId === first.session.nodes[2].id)?.status).toBe(
      "contradicted",
    );
  });
  it("expires runtime evidence and does not treat command success as blanket investigation", async () => {
    const h = harness();
    h.change({
      observedAt: "2026-10-17T00:00:00Z",
      dependencies: [{ from: "src/b.ts", to: "src/a.ts", kind: "imports" }],
      artifacts: [
        { id: "a", path: "src/a.ts", hash: "one" },
        { id: "b", path: "src/b.ts", hash: "one" },
      ],
    });
    const first = await h.engine.begin({ goal: "x", proposals, authorizedPaths: ["."] });
    h.result({
      result: "pass",
      level: 5,
      detail: "runtime predicate",
      expiresAt: "2026-10-17T00:01:00Z",
    });
    await h.engine.verify(first.session.id, first.session.nodes[0].id);
    h.change({ id: "r2", observedAt: "2026-10-17T00:02:00Z" });
    expect((await h.engine.check(first.session.id)).session.evidence[0].invalidatedBy).toContain(
      "runtime-evidence-expired",
    );
    h.change({
      id: "r3",
      artifacts: [
        { id: "a", path: "src/a.ts", hash: "two" },
        { id: "b", path: "src/b.ts", hash: "one" },
      ],
    });
    h.result({ result: "pass", level: 3, detail: "command exits zero" });
    const report = await h.engine.verify(first.session.id, first.session.nodes[0].id);
    expect(report.blindspots.find((b) => b.artifact === "src/b.ts")?.investigated).toBe(false);
    expect((await h.engine.prove(first.session.id)).completion).toBe("not-proven");
  });
  it("does not let assertions, missing checks or insufficient proof levels establish completion", async () => {
    const h = harness();
    const initial = await h.engine.begin({ goal: "auth", proposals });
    h.result({ result: "pass", level: 1, detail: "only static" });
    await h.engine.verify(initial.session.id, initial.session.nodes[0].id);
    expect((await h.engine.prove(initial.session.id)).completion).toBe("not-proven");
    const bare = await h.engine.begin({ goal: "LLM says done" });
    expect((await h.engine.prove(bare.session.id)).completion).toBe("not-proven");
  });
  it("invalidates results when files mutate during verification", async () => {
    const h = harness();
    const initial = await h.engine.begin({ goal: "auth", proposals });
    h.during(() => h.change({ id: "r2", artifacts: [{ id: "a", path: "src/a.ts", hash: "two" }] }));
    const report = await h.engine.verify(initial.session.id, initial.session.nodes[0].id);
    expect(report.session.evidence[0].status).toBe("stale");
    expect((await h.engine.prove(initial.session.id)).completion).toBe("not-proven");
  });
  it("reopens proof after a dependency is added even without source hashes changing", async () => {
    const h = harness();
    const initial = await h.engine.begin({ goal: "auth", proposals });
    await h.engine.verify(initial.session.id, initial.session.nodes[0].id);
    h.change({ id: "r2", dependencies: [{ from: "src/b.ts", to: "src/a.ts", kind: "imports" }] });
    expect(
      (await h.engine.check(initial.session.id)).nodes.every((n) => n.status === "stale"),
    ).toBe(true);
  });
  it("keeps an independent scope fresh when unrelated dependencies are discovered", async () => {
    const h = harness();
    const first = await h.engine.begin({
      goal: "x",
      proposals: [
        {
          key: "a",
          kind: "Requirement",
          statement: "a exists",
          minimumLevel: 1,
          action: { kind: "artifact-exists", paths: ["src/a.ts"], target: "src/a.ts" },
        },
      ],
    });
    await h.engine.verify(first.session.id, first.session.nodes[0].id);
    h.change({
      id: "r2",
      dependencies: [{ from: "other/a.ts", to: "other/b.ts", kind: "imports" }],
    });
    const report = await h.engine.check(first.session.id);
    expect(report.session.evidence[0].status).toBe("fresh");
    expect(report.blindspots.some((b) => b.artifact === "other/a.ts")).toBe(true);
  });
  it("reopens derived obligations when intent changes", async () => {
    const h = harness();
    const initial = await h.engine.begin({ goal: "auth", proposals });
    await h.engine.verify(initial.session.id, initial.session.nodes[0].id);
    const revised = await h.engine.revise(
      initial.session.id,
      initial.session.nodes[1].id,
      "Also preserve reconnect",
    );
    expect(revised.session.evidence.every((e) => e.status === "stale")).toBe(true);
    expect((await h.engine.prove(initial.session.id)).completion).toBe("not-proven");
  });
  it("rejects cyclic or missing proof dependencies and unsafe scopes", async () => {
    const h = harness();
    await expect(h.engine.begin({ goal: "x", boundary: ["../elsewhere"] })).rejects.toThrow(
      "scope",
    );
    await expect(
      h.engine.begin({
        goal: "x",
        proposals: [{ key: "a", kind: "Claim", statement: "a", dependsOn: ["a"] }],
      }),
    ).rejects.toThrow("acyclic");
    await expect(
      h.engine.begin({
        goal: "x",
        proposals: [{ key: "a", kind: "Claim", statement: "a", dependsOn: ["missing"] }],
      }),
    ).rejects.toThrow("dependency");
  });
  it("blocks unobservable state and unauthorized mutations", async () => {
    const h = harness();
    const initial = await h.engine.begin({ goal: "x", proposals });
    h.change({ id: "r2", artifacts: [{ id: "b", path: "src/b.ts", hash: "two" }] });
    const report = await h.engine.check(initial.session.id);
    expect(report.unjustifiedMutations).toEqual(["src/a.ts", "src/b.ts"]);
    h.change({ complete: false });
    expect((await h.engine.prove(initial.session.id)).completion).toBe("blocked");
  });
  it("permits explicit obligation updates without silently reusing old evidence", async () => {
    const h = harness();
    const initial = await h.engine.begin({ goal: "x", proposals });
    await h.engine.verify(initial.session.id, initial.session.nodes[0].id);
    const updated = await h.engine.understand(
      initial.session.id,
      proposals.map((p) => ({ ...p, statement: `${p.statement} updated` })),
    );
    expect(updated.nodes.every((n) => n.status === "unproven")).toBe(true);
  });
  it("rejects lost updates with optimistic concurrency", async () => {
    const h = harness();
    const initial = await h.engine.begin({ goal: "x" });
    const stale = initial.session;
    await h.engine.check(stale.id);
    expect(() => h.store.put({ ...stale, version: stale.version + 1 }, stale.version)).toThrow(
      "Concurrent",
    );
  });
});
