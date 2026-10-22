import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProofPort, ProofProposal } from "@prof-bilal/atlas-core";
import { afterEach, describe, expect, it } from "vitest";
import { createProofSDK } from "../src/proof";

const roots: string[] = [];
const engines: ProofPort[] = [];
afterEach(async () => {
  for (const engine of engines.splice(0)) engine.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "atlas-proof-"));
  roots.push(root);
  await writeFile(join(root, "math.ts"), "export const double = (n: number) => n * 2;\n");
  const sdk = await createProofSDK({ repositoryPath: root });
  engines.push(sdk);
  return { root, sdk };
}
const proposal: ProofProposal[] = [
  {
    key: "noJWT",
    kind: "ProofObligation",
    statement: "Literal JWT is absent",
    minimumLevel: 1,
    action: { kind: "text-absent", paths: ["."], target: "JWT" },
  },
  {
    key: "goal",
    kind: "Requirement",
    statement: "No literal JWT",
    minimumLevel: 1,
    dependsOn: ["noJWT"],
  },
];
describe("proof SDK repository integration", () => {
  it("snapshots host approvals before awaiting repository access", async () => {
    const { root } = await fixture();
    const command = { command: process.execPath, args: ["-e", "process.exit(1)"] };
    const opening = createProofSDK({
      repositoryPath: root,
      commands: { test: { config: command, level: 3 } },
    });
    command.args[1] = "process.exit(0)";
    const sdk = await opening;
    engines.push(sdk);
    const started = await sdk.begin({
      goal: "Check approved command",
      proposals: [
        {
          key: "test",
          kind: "ProofObligation",
          statement: "Approved check passes",
          minimumLevel: 3,
          action: { kind: "command", paths: ["."], target: "test" },
        },
      ],
    });
    const result = await sdk.verify(started.session.id, started.session.nodes[0].id);
    expect(result.session.evidence[0].result).toBe("fail");
    expect((await sdk.prove(started.session.id)).completion).toBe("not-proven");
  });

  it("persists a proven change, then invalidates it after external edits", async () => {
    const { root, sdk } = await fixture();
    const started = await sdk.begin({
      goal: "Remove JWT",
      authorizedPaths: ["math.ts"],
      proposals: proposal,
    });
    await sdk.verify(started.session.id, started.session.nodes[0].id);
    expect((await sdk.prove(started.session.id)).completion).toBe("proven");
    const reopened = await createProofSDK({ repositoryPath: root });
    engines.push(reopened);
    expect((await reopened.check(started.session.id)).guaranteeCeiling).toBe(1);
    await writeFile(join(root, "math.ts"), "export const JWT = 'legacy';\n");
    expect((await sdk.check(started.session.id)).nodes.every((n) => n.status === "stale")).toBe(
      true,
    );
    const failed = await sdk.verify(started.session.id, started.session.nodes[0].id);
    expect(failed.nodes.every((n) => n.status === "contradicted")).toBe(true);
  });
  it("detects newly added consumers within a negative search scope", async () => {
    const { root, sdk } = await fixture();
    const started = await sdk.begin({
      goal: "Remove JWT",
      authorizedPaths: ["."],
      proposals: proposal,
    });
    await sdk.verify(started.session.id, started.session.nodes[0].id);
    await writeFile(join(root, "new.ts"), "export const x = 'JWT';");
    expect((await sdk.prove(started.session.id)).completion).toBe("not-proven");
  });
  it("requires application-approved commands and cannot accept a supplied pass verdict", async () => {
    const { sdk } = await fixture();
    const started = await sdk.begin({
      goal: "x",
      proposals: [
        {
          key: "test",
          kind: "ProofObligation",
          statement: "test",
          minimumLevel: 3,
          action: { kind: "command", paths: ["."], target: "arbitrary" },
        },
      ],
    });
    const checked = await sdk.verify(started.session.id, started.session.nodes[0].id);
    expect(checked.session.evidence[0].result).toBe("unknown");
    expect((await sdk.prove(started.session.id)).completion).toBe("not-proven");
  });
  it("executes explicitly approved checks through the verifier without persisting output", async () => {
    const { root } = await fixture();
    await writeFile(join(root, "check.cjs"), "console.log('private observation');");
    const sdk = await createProofSDK({
      repositoryPath: root,
      commands: { test: { config: { command: process.execPath, args: ["check.cjs"] }, level: 3 } },
    });
    engines.push(sdk);
    const started = await sdk.begin({
      goal: "x",
      proposals: [
        {
          key: "test",
          kind: "ProofObligation",
          statement: "Check succeeds",
          minimumLevel: 3,
          action: { kind: "command", paths: ["math.ts"], target: "test" },
        },
        {
          key: "goal",
          kind: "Requirement",
          statement: "Approved check succeeds",
          minimumLevel: 3,
          dependsOn: ["test"],
        },
      ],
    });
    const checked = await sdk.verify(started.session.id, started.session.nodes[0].id);
    expect(checked.session.evidence[0].scope).toEqual(["."]);
    expect((await sdk.prove(started.session.id)).completion).toBe("proven");
    expect(JSON.stringify(await sdk.exportState(started.session.id))).not.toContain(
      "private observation",
    );
    expect((await readFile(join(root, ".codeatlas/proof.db"))).length).toBeGreaterThan(0);
  });
});
