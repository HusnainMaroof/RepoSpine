import { execFile } from "node:child_process";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("built SDK entry point", () => {
  it("loads the advertised CommonJS entry in a fresh process", async () => {
    const entry = fileURLToPath(new URL("../dist/index.cjs", import.meta.url));
    const result = await run(process.execPath, [
      "-e",
      `const sdk = require(${JSON.stringify(entry)}); process.stdout.write(JSON.stringify(['buildWorkPacket','renderWorkPacket','createControlPlane','createProofSDK'].map(name => typeof sdk[name])));`,
    ]);
    expect(JSON.parse(result.stdout)).toEqual(["function", "function", "function", "function"]);
  });

  it("ships Skills in both bundle formats without a workspace source fallback", async () => {
    const isolated = await mkdtemp(join(tmpdir(), "atlas-sdk-dist-"));
    try {
      await cp(new URL("../dist", import.meta.url), join(isolated, "dist"), { recursive: true });
      await writeFile(join(isolated, "package.json"), JSON.stringify({ type: "module" }));
      // Only external dependencies are shared; dist and Skill lookup are isolated.
      await symlink(
        fileURLToPath(new URL("../node_modules", import.meta.url)),
        join(isolated, "node_modules"),
        "junction",
      );
      for (const extension of ["js", "cjs"]) {
        const entry = pathToFileURL(join(isolated, "dist", `index.${extension}`)).href;
        const result = await run(
          process.execPath,
          [
            "--input-type=module",
            "-e",
            `const imported = await import(${JSON.stringify(entry)}); const sdk = imported.default ?? imported; process.stdout.write(JSON.stringify(sdk.listBuiltinSkills().map(s => s.id)));`,
          ],
          { cwd: isolated, timeout: 10000 },
        );
        expect(JSON.parse(result.stdout)).toHaveLength(13);
      }
    } finally {
      await rm(isolated, { recursive: true, force: true });
    }
  });

  it("imports the control-plane and proof APIs in a fresh Node ESM process", async () => {
    const entry = new URL("../dist/index.js", import.meta.url).href;
    const script = `import { writeSync } from 'node:fs'; const sdk = await import(${JSON.stringify(entry)}); writeSync(1, JSON.stringify(['buildWorkPacket','renderWorkPacket','createControlPlane','createProofSDK'].map(name => typeof sdk[name])));`;
    const result = await run(process.execPath, ["--input-type=module", "-e", script], {
      timeout: 10000,
    });
    expect(result.stdout, JSON.stringify({ entry, stderr: result.stderr })).not.toBe("");
    expect(JSON.parse(result.stdout)).toEqual(["function", "function", "function", "function"]);
  });
});
