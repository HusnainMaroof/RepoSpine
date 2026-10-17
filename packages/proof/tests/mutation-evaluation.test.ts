import { performance } from "node:perf_hooks";
import type { RepositoryRevision } from "@prof-bilal/atlas-core";
import { ProofStore } from "@prof-bilal/atlas-storage";
import { describe, expect, it } from "vitest";
import { createProofEngine } from "../src/service";

/** Independent seeded mutations: outcomes are fixtures, not another invocation of the evaluator. */
const scenarios = [
  { name: "function body", path: "unit.ts", expectedStale: true },
  { name: "shared type", path: "types.ts", expectedStale: true },
  { name: "supporting test", path: "unit.test.ts", expectedStale: true },
  { name: "deleted implementation", path: "unit.ts", deleted: true, expectedStale: true },
  { name: "new consumer", path: "added.ts", added: true, expectedStale: true },
  { name: "format-only mutation", path: "unit.ts", formatting: true, expectedStale: true },
  { name: "no mutation", path: "", expectedStale: false },
  { name: "unrelated artifact", path: "unrelated.ts", unrelated: true, expectedStale: false },
];

describe("offline mutation corpus", () => {
  it("evaluates 48 timelines across six named source areas", async () => {
    const measurements: {
      scenario: string;
      elapsedMs: number;
      stale: boolean;
      expected: boolean;
      incorrectlyProven: boolean;
    }[] = [];
    for (const area of ["auth", "socket", "payment", "storage", "parser", "config"]) {
      for (const scenario of scenarios) {
        const store = new ProofStore();
        const artifacts = ["unit.ts", "types.ts", "unit.test.ts"].map((path) => ({
          id: `${area}/${path}`,
          path: `${area}/${path}`,
          hash: "old",
          semanticHash: "old",
        }));
        artifacts.push({
          id: "unrelated.ts",
          path: "unrelated.ts",
          hash: "old",
          semanticHash: "old",
        });
        let revision: RepositoryRevision = {
          id: "baseline",
          repositoryId: "fixture",
          head: null,
          observedAt: "fixed",
          complete: true,
          artifacts,
          dependencies: [],
          limitations: [],
        };
        const proof = createProofEngine(store, {
          observe: async () => revision,
          execute: async () => ({ result: "pass", level: 3, detail: "scripted test outcome" }),
        });
        try {
          const initial = await proof.begin({
            goal: `Preserve ${area}`,
            authorizedPaths: ["."],
            proposals: [
              {
                key: "test",
                kind: "ProofObligation",
                statement: `${area} regression`,
                minimumLevel: 3,
                action: { kind: "command", target: "scripted", paths: [area] },
              },
              {
                key: "goal",
                kind: "Requirement",
                statement: `${area} preserved`,
                minimumLevel: 3,
                dependsOn: ["test"],
              },
            ],
          });
          await proof.verify(initial.session.id, initial.session.nodes[0].id);
          expect((await proof.prove(initial.session.id)).completion).toBe("proven");
          const path = scenario.unrelated ? scenario.path : `${area}/${scenario.path}`;
          if (scenario.path)
            revision = {
              ...revision,
              id: scenario.name,
              artifacts: scenario.added
                ? [...artifacts, { id: path, path, hash: "new", semanticHash: "new" }]
                : artifacts
                    .filter((a) => !scenario.deleted || a.path !== path)
                    .map((a) =>
                      a.path === path
                        ? { ...a, hash: "new", semanticHash: scenario.formatting ? "old" : "new" }
                        : a,
                    ),
            };
          const start = performance.now();
          const report = await proof.check(initial.session.id);
          const receipt = await proof.prove(initial.session.id);
          const stale =
            report.nodes.find((n) => n.nodeId === initial.session.nodes[1].id)?.status === "stale";
          measurements.push({
            scenario: `${area}/${scenario.name}`,
            elapsedMs: performance.now() - start,
            stale,
            expected: scenario.expectedStale,
            incorrectlyProven: scenario.expectedStale && receipt.completion === "proven",
          });
          expect(stale, `${area}/${scenario.name}`).toBe(scenario.expectedStale);
          expect(receipt.completion).toBe(scenario.expectedStale ? "not-proven" : "proven");
        } finally {
          proof.close();
        }
      }
    }
    expect(measurements).toHaveLength(48);
    const sorted = measurements.map((m) => m.elapsedMs).sort((a, b) => a - b);
    console.info(
      "Proof mutation corpus (scripted, not real-agent quality)",
      JSON.stringify({
        cases: measurements.length,
        expectedInvalidations: measurements.filter((m) => m.expected).length,
        detectedInvalidations: measurements.filter((m) => m.expected && m.stale).length,
        falseInvalidations: measurements.filter((m) => !m.expected && m.stale).length,
        incorrectlyProven: measurements.filter((m) => m.incorrectlyProven).length,
        propagationAndStoreP50Ms: sorted[Math.floor(sorted.length * 0.5)],
        propagationAndStoreP95Ms: sorted[Math.floor(sorted.length * 0.95)],
      }),
    );
  });
});
