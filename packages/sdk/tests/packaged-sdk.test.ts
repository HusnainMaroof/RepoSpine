import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("built SDK entry point", () => {
  it("imports the control-plane API in a fresh Node ESM process", async () => {
    const entry = new URL("../dist/index.js", import.meta.url).href;
    const script = `import { writeSync } from 'node:fs'; const sdk = await import(${JSON.stringify(entry)}); writeSync(1, JSON.stringify(['buildWorkPacket','renderWorkPacket','createControlPlane'].map(name => typeof sdk[name])));`;
    const result = await run(process.execPath, ["--input-type=module", "-e", script], {
      timeout: 10000,
    });
    expect(result.stdout, JSON.stringify({ entry, stderr: result.stderr })).not.toBe("");
    expect(JSON.parse(result.stdout)).toEqual(["function", "function", "function"]);
  });
});
