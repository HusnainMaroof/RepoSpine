import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { VERSION } from "../src/constants/version";

const root = new URL("../../../", import.meta.url);
const manifest = (path: string) => JSON.parse(readFileSync(new URL(path, root), "utf8"));

describe("release metadata", () => {
  it("embeds the manifest version instead of the private workspace placeholder", () => {
    expect(VERSION).toBe(manifest("packages/shared/package.json").version);
    expect(VERSION).not.toBe("0.0.0");
  });

  it("keeps the publishable release train, beta tag and SQLite engine floor aligned", () => {
    const paths = [
      "package.json",
      ...["packages", "apps"].flatMap((directory) =>
        readdirSync(fileURLToPath(new URL(`${directory}/`, root)), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => `${directory}/${entry.name}/package.json`),
      ),
    ];
    for (const path of paths) {
      const pkg = manifest(path);
      if (pkg.private && path !== "package.json") continue;
      expect(pkg.engines.node, path).toBe(">=22.13.0");
      if (pkg.private) continue;
      expect(pkg.version, path).toBe(VERSION);
      if (VERSION.includes("-beta.")) expect(pkg.publishConfig.tag, path).toBe("beta");
    }
  });
});
