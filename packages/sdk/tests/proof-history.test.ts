import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { historicalCoupling } from "../src/proof/history";

const exec = promisify(execFile);
describe("bounded git co-change", () => {
  it("reads only bounded commit/file metadata and computes repeated co-change", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-proof-history-"));
    const git = (args: string[]) => exec("git", args, { cwd: root });
    try {
      await git(["init", "--quiet"]);
      for (let i = 0; i < 3; i++) {
        await writeFile(join(root, "a.ts"), `export const a = ${i};`);
        await writeFile(join(root, "b.ts"), `export const b = ${i};`);
        await git(["add", "a.ts", "b.ts"]);
        await git([
          "-c",
          "user.name=Fixture",
          "-c",
          "user.email=fixture@example.invalid",
          "commit",
          "--quiet",
          "-m",
          `fixture ${i}`,
        ]);
      }
      const rows = await historicalCoupling(root, 3);
      expect(rows).toEqual([{ from: "a.ts", to: "b.ts", kind: "co-change", samples: 3, value: 1 }]);
      await expect(historicalCoupling(root, 101)).rejects.toThrow("1..100");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
