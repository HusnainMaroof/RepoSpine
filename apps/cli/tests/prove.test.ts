import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCli } from "../src/cli";

describe("atlas prove CLI", () => {
  it("creates, verifies and emits a failing exit status after source mutation", async () => {
    const parent = await mkdtemp(join(tmpdir(), "atlas-cli-proof-"));
    const root = join(parent, "repo");
    await mkdir(root);
    await writeFile(join(root, "a.ts"), "export const a = 1;");
    const input = join(parent, "change.json");
    await writeFile(
      input,
      JSON.stringify({
        goal: "Literal JWT absent",
        authorizedPaths: ["."],
        proposals: [
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
            statement: "JWT absent",
            minimumLevel: 1,
            dependsOn: ["absence"],
          },
        ],
      }),
    );
    const output = vi.spyOn(console, "log").mockImplementation(() => {});
    const previousCode = process.exitCode;
    try {
      const invoke = async (args: string[]) => {
        await createCli().parseAsync(["prove", ...args, "--repo", root], { from: "user" });
        return JSON.parse(String(output.mock.calls.at(-1)?.[0]));
      };
      const started = await invoke(["begin", "--input", input]);
      const id: string = started.session.id;
      process.exitCode = 0;
      expect((await invoke([id])).completion).toBe("not-proven");
      expect(process.exitCode).toBe(1);
      const state = await invoke(["export", id]);
      const portable = join(parent, "portable.json");
      await writeFile(portable, JSON.stringify(state));
      const imported = await invoke(["import", "--input", portable]);
      expect(imported.session.id).not.toBe(id);
      expect(imported.session.evidence).toEqual([]);
      expect((await invoke(["history", id])).length).toBeGreaterThan(1);
      process.exitCode = 0;
      await invoke(["verify", id, "--node", started.session.nodes[0].id]);
      expect((await invoke([id])).completion).toBe("proven");
      expect(process.exitCode).toBe(0);
      await writeFile(join(root, "a.ts"), "export const a = 'JWT';");
      expect((await invoke([id])).completion).toBe("not-proven");
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = previousCode;
      output.mockRestore();
      await rm(parent, { recursive: true, force: true });
    }
  });
});
