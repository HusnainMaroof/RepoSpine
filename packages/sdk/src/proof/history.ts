import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CouplingSignal } from "@prof-bilal/atlas-core";

const git = promisify(execFile);
/** Opt-in bounded history statistics. No commit messages or source content are read. */
export async function historicalCoupling(root: string, maxCommits = 50): Promise<CouplingSignal[]> {
  if (!Number.isSafeInteger(maxCommits) || maxCommits < 1 || maxCommits > 100)
    throw new Error("History window must be 1..100 commits.");
  const result = await git("git", ["log", `-${maxCommits}`, "--no-merges", "--format=%H"], {
    cwd: root,
    timeout: 3000,
    maxBuffer: 16000,
  });
  const commits = result.stdout
    .trim()
    .split("\n")
    .filter((s) => /^[a-f0-9]{40,64}$/.test(s));
  const occurrences = new Map<string, number>();
  const pairs = new Map<string, { from: string; to: string; count: number }>();
  for (const commit of commits) {
    const output = await git(
      "git",
      ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", "-z", commit],
      { cwd: root, timeout: 3000, maxBuffer: 1024 * 1024 },
    );
    const paths = [...new Set(output.stdout.split("\0").filter(Boolean))].sort();
    // Bulk rewrites are weak semantic signals and make pair generation quadratic.
    if (paths.length > 40) continue;
    for (const path of paths) occurrences.set(path, (occurrences.get(path) ?? 0) + 1);
    for (let i = 0; i < paths.length; i++)
      for (let j = i + 1; j < paths.length; j++) {
        const from = paths[i];
        const to = paths[j];
        const key = JSON.stringify([from, to]);
        const old = pairs.get(key);
        pairs.set(key, { from, to, count: (old?.count ?? 0) + 1 });
      }
  }
  return [...pairs.values()].map((pair) => ({
    from: pair.from,
    to: pair.to,
    kind: "co-change",
    samples: pair.count,
    value:
      pair.count /
      Math.max(1, (occurrences.get(pair.from) ?? 0) + (occurrences.get(pair.to) ?? 0) - pair.count),
  }));
}
