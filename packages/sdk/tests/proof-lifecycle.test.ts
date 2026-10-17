import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { ProofProposal, ProofReport } from "@prof-bilal/atlas-core";
import { ok } from "@prof-bilal/atlas-shared";
import { afterEach, describe, expect, it } from "vitest";
import { type ProofSDK, createProofSDK } from "../src/proof";
import { publicContracts } from "../src/proof/semantic";
import { createUsageService } from "../src/usage";

const roots: string[] = [];
const engines: ProofSDK[] = [];
afterEach(async () => {
  for (const sdk of engines.splice(0)) sdk.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "atlas-proof-life-"));
  roots.push(root);
  await writeFile(join(root, "a.ts"), "export function value(): number { return 1; }");
  const sdk = await createProofSDK({ repositoryPath: root });
  engines.push(sdk);
  return { root, sdk };
}
const proposals: ProofProposal[] = [
  {
    key: "absence",
    kind: "ProofObligation",
    statement: "JWT absent",
    minimumLevel: 1,
    action: { kind: "text-absent", paths: ["."], target: "JWT" },
  },
  {
    key: "goal",
    kind: "Requirement",
    statement: "No literal JWT",
    minimumLevel: 1,
    dependsOn: ["absence"],
  },
];
describe("proof lifecycle integrations", () => {
  it("records agent misses only against safe observed artifacts and never as proof", async () => {
    const { root, sdk } = await fixture();
    await writeFile(join(root, "b.ts"), "export const b = 1;");
    const first = await sdk.begin({ goal: "Investigate auth" });
    await expect(
      sdk.recordAgentMiss(first.session.id, ["../outside.ts", "a.ts"], "miss"),
    ).rejects.toThrow("Unsafe");
    await sdk.recordAgentMiss(
      first.session.id,
      ["a.ts", "b.ts"],
      "Related consumer missed during investigation",
    );
    const report = await sdk.check(first.session.id);
    expect(
      report.session.current.coupling?.some((s) => s.kind === "agent-miss" && s.samples === 1),
    ).toBe(true);
    expect(report.nodes.every((n) => n.status === "unproven")).toBe(true);
  });
  it("rejects a second client's write while an explicitly approved operation holds the lease", async () => {
    const { root, sdk } = await fixture();
    const first = await sdk.begin({ goal: "Auth preserved", proposals });
    const usage = createUsageService();
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const called = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const other = await createProofSDK({
      repositoryPath: root,
      proposalUsage: usage,
      proposalProvider: {
        complete: async () => {
          entered();
          await gate;
          return ok({
            provider: "fixture",
            model: "fixture",
            usage: undefined,
            toolCalls: undefined,
            content: JSON.stringify({
              proposals: [
                { key: "reconnect", kind: "ProofObligation", statement: "Reconnect works" },
              ],
            }),
          });
        },
      },
    });
    engines.push(other);
    const operation = other.propose(first.session.id, { approved: true });
    try {
      await called;
      await expect(sdk.check(first.session.id)).rejects.toThrow("leased");
    } finally {
      release();
      await operation;
      usage.close();
    }
    expect((await sdk.check(first.session.id)).session.proposed).toHaveLength(1);
  });
  it("watches Git revision changes even when source bytes do not change", async () => {
    const { root, sdk } = await fixture();
    const exec = promisify(execFile);
    const git = (args: string[]) => exec("git", args, { cwd: root });
    await git(["init", "--quiet"]);
    await git(["add", "a.ts"]);
    const commit = (extra: string[] = []) =>
      git([
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "fixture",
        ...extra,
      ]);
    await commit();
    const first = await sdk.begin({ goal: "No JWT", proposals });
    await sdk.verify(first.session.id, first.session.nodes[0].id);
    const reports: ProofReport[] = [];
    const watcher = await sdk.watch({ debounceMs: 20, onChange: (report) => reports.push(report) });
    try {
      await commit(["--allow-empty"]);
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 10000;
        const poll = () =>
          reports.some((r) => r.session.evidence[0]?.status === "stale")
            ? resolve()
            : Date.now() > deadline
              ? reject(new Error("Git proof watcher timed out"))
              : setTimeout(poll, 25);
        poll();
      });
      expect(reports.at(-1)?.session.evidence[0].invalidatedBy).toContain("git-head-changed");
    } finally {
      await watcher.close();
    }
  });
  it("falsifies an explicit public-contract constraint despite an authorized path", async () => {
    const { root, sdk } = await fixture();
    const first = await sdk.begin({
      goal: "Preserve public API",
      authorizedPaths: ["."],
      proposals: [
        {
          key: "api",
          kind: "Constraint",
          statement: "Public API unchanged",
          minimumLevel: 1,
          action: { kind: "public-contract-unchanged", paths: ["a.ts"], target: "exports" },
        },
        {
          key: "goal",
          kind: "Requirement",
          statement: "Public API unchanged",
          minimumLevel: 1,
          dependsOn: ["api"],
        },
      ],
    });
    await sdk.verify(first.session.id, first.session.nodes[0].id);
    expect((await sdk.prove(first.session.id)).completion).toBe("proven");
    await writeFile(join(root, "a.ts"), "export function value(): string { return 'changed'; }");
    const changed = await sdk.verify(first.session.id, first.session.nodes[0].id);
    expect(changed.contractChanges).toEqual([
      { artifact: "a.ts", name: "value", change: "changed" },
    ]);
    expect(changed.nodes.every((n) => n.status === "contradicted")).toBe(true);
    expect(changed.unjustifiedMutations).toEqual([]);
    expect((await sdk.prove(first.session.id)).completion).toBe("not-proven");
  });
  it("persists invalidation from the existing watcher without a status call", async () => {
    const { root, sdk } = await fixture();
    const first = await sdk.begin({ goal: "Remove JWT", proposals, authorizedPaths: ["."] });
    await sdk.verify(first.session.id, first.session.nodes[0].id);
    expect((await sdk.prove(first.session.id)).completion).toBe("proven");
    const reports: ProofReport[] = [];
    const errors: Error[] = [];
    const watcher = await sdk.watch({
      debounceMs: 20,
      onChange: (report) => reports.push(report),
      onError: (error) => errors.push(error),
    });
    try {
      await writeFile(join(root, "a.ts"), "export const JWT = 'old';");
      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 10000;
        const poll = () =>
          reports.some((r) => r.nodes.some((n) => n.status === "stale"))
            ? resolve()
            : Date.now() > deadline
              ? reject(new Error(`Proof watcher timed out: ${errors.map((e) => e.message).join()}`))
              : setTimeout(poll, 25);
        poll();
      });
      expect(reports.at(-1)?.session.evidence[0].invalidatedBy).toContain("a.ts");
    } finally {
      await watcher.close();
    }
    const history = await sdk.history(first.session.id, 0, 100);
    expect(history.some((entry) => entry.session.evidence.some((e) => e.status === "stale"))).toBe(
      true,
    );
    expect(history.some((entry) => entry.session.state === "PROVEN")).toBe(true);
  });
  it("changes proof freshness when the host toolchain identity changes", async () => {
    const { root, sdk } = await fixture();
    const first = await sdk.begin({ goal: "No JWT", proposals });
    await sdk.verify(first.session.id, first.session.nodes[0].id);
    const changed = await createProofSDK({
      repositoryPath: root,
      environmentIdentity: "new toolchain",
    });
    engines.push(changed);
    const report = await changed.check(first.session.id);
    expect(report.session.evidence[0].invalidatedBy).toContain("verification-environment-changed");
  });
  it("proposes bounded model obligations only with approval and records usage without proving them", async () => {
    const { root, sdk } = await fixture();
    const first = await sdk.begin({ goal: "Preserve auth", proposals });
    const usage = createUsageService();
    let calls = 0;
    const configured = await createProofSDK({
      repositoryPath: root,
      proposalUsage: usage,
      proposalProvider: {
        complete: async (request) => {
          calls++;
          expect(request.prompt.length).toBeLessThan(64000);
          return ok({
            provider: "fixture",
            model: "fixture",
            usage: undefined,
            toolCalls: undefined,
            content: JSON.stringify({
              proposals: [
                {
                  key: "reconnect",
                  kind: "ProofObligation",
                  statement: "Reconnect works",
                  minimumLevel: 3,
                },
              ],
            }),
          });
        },
      },
    });
    engines.push(configured);
    try {
      await expect(configured.propose(first.session.id, { approved: false })).rejects.toThrow(
        "approval",
      );
      expect(calls).toBe(0);
      expect(
        await configured.propose(first.session.id, { approved: true, maxTokens: 1000 }),
      ).toHaveLength(1);
      expect(calls).toBe(1);
      expect(usage.listUsage()).toHaveLength(1);
      expect((await configured.check(first.session.id)).session.proposed).toHaveLength(1);
      expect((await configured.prove(first.session.id)).completion).toBe("not-proven");
    } finally {
      usage.close();
    }
  });
  it("synthesizes verification suggestions but requires explicit adoption", async () => {
    const { root } = await fixture();
    const sdk = await createProofSDK({
      repositoryPath: root,
      commands: {
        test: { config: { command: process.execPath, args: ["-e", "process.exit(0)"] }, level: 3 },
      },
    });
    engines.push(sdk);
    const report = await sdk.begin({ goal: "Behavior preserved" });
    expect(report.nextActions[0].requiresAdoption).toBe(true);
    expect(report.nextActions[0].action.target).toBe("test");
    await expect(sdk.verify(report.session.id, report.session.nodes[0].id)).rejects.toThrow(
      "explicit",
    );
  });
  it("grants runtime evidence only for an approved exact deployment revision", async () => {
    const { root } = await fixture();
    let deployed = "unbound";
    const sdk = await createProofSDK({
      repositoryPath: root,
      environmentIdentity: "fixture-runtime",
      runtime: {
        inspector: {
          probeHttp: async () =>
            ok({
              url: "http://localhost",
              method: "GET",
              statusCode: 200,
              statusText: "OK",
              headers: {},
              body: "ready",
              latencyMs: 1,
              error: null,
              ok: true,
            }),
          probeHttpBatch: async () => ok([]),
        },
        probes: {
          health: {
            target: { url: "http://localhost" },
            expectedStatus: 200,
            bodyIncludes: "ready",
            deployedRevision: async () => deployed,
            ttlMs: 5000,
          },
        },
      },
    });
    engines.push(sdk);
    const report = await sdk.begin({
      goal: "Health predicate",
      proposals: [
        {
          key: "health",
          kind: "Requirement",
          statement: "Health predicate",
          minimumLevel: 5,
          action: { kind: "runtime-probe", paths: ["."], target: "health" },
        },
      ],
    });
    const id = report.session.id;
    const node = report.session.nodes[0].id;
    expect((await sdk.verify(id, node)).session.evidence.at(-1)?.result).toBe("unknown");
    deployed = report.session.current.id;
    expect((await sdk.verify(id, node)).session.evidence.at(-1)?.level).toBe(5);
    expect((await sdk.prove(id)).completion).toBe("proven");
  });
  it("tracks declaration identity across line movement without erasing contract changes", () => {
    const first = publicContracts("a.ts", "export function f(x: string): number { return 1; }");
    if (!first) throw new Error("Expected TypeScript public contract.");
    const moved = publicContracts("a.ts", "\n\nexport function f(x: string): number { return 2; }");
    if (!moved) throw new Error("Expected moved TypeScript public contract.");
    expect(moved).toEqual(first);
    const changed = publicContracts("a.ts", "export function f(x: number): number { return 1; }");
    if (!changed) throw new Error("Expected changed TypeScript public contract.");
    expect(changed[0].id).toBe(first[0].id);
    expect(changed[0].hash).not.toBe(first[0].hash);
    expect(publicContracts("a.py", "def f(): pass")).toBeUndefined();
    expect(publicContracts("a.cjs", "module.exports = { id: 1 };")).toBeUndefined();
    expect(publicContracts("a.ts", "const x = { id: 1 }; export default x;")?.[0].hash).not.toBe(
      publicContracts("a.ts", "const x = { id: 'changed' }; export default x;")?.[0].hash,
    );
  });
});
