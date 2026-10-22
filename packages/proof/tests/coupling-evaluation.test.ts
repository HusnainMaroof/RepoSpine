import type { CouplingSignal } from "@prof-bilal/atlas-core";
import { describe, expect, it } from "vitest";
import { rankCoupling } from "../src/coupling";

/** Frozen ranking fixtures, NOT live-agent or production-repository ground truth.
 * Deliberate noise and a rare miss prevent reporting a misleading perfect score. */
const fixtures: { seed: string; missed: string; signals: CouplingSignal[] }[] = [
  {
    seed: "auth.ts",
    missed: "socket.ts",
    signals: [
      { from: "auth.ts", to: "socket.ts", kind: "static", value: 1, samples: 1 },
      { from: "auth.ts", to: "unrelated.ts", kind: "co-change", value: 0.2, samples: 3 },
    ],
  },
  {
    seed: "payment.ts",
    missed: "refund.ts",
    signals: [{ from: "payment.ts", to: "refund.ts", kind: "co-change", value: 0.8, samples: 6 }],
  },
  {
    seed: "storage.ts",
    missed: "migration.ts",
    signals: [
      { from: "storage.ts", to: "incidental.ts", kind: "static", value: 1, samples: 1 },
      { from: "storage.ts", to: "migration.ts", kind: "proof-failure", value: 0.9, samples: 9 },
    ],
  },
  {
    seed: "parser.ts",
    missed: "parser.test.ts",
    signals: [
      { from: "parser.ts", to: "parser.test.ts", kind: "shared-test", value: 1, samples: 1 },
    ],
  },
  {
    seed: "config.ts",
    missed: "worker.ts",
    signals: [{ from: "config.ts", to: "worker.ts", kind: "agent-miss", value: 0.5, samples: 3 }],
  },
  {
    seed: "cache.ts",
    missed: "rare.ts",
    signals: [{ from: "cache.ts", to: "rare.ts", kind: "co-change", value: 1, samples: 1 }],
  },
];
describe("frozen coupling ranking ablation", () => {
  it("reports recall and noise against independent fixture labels without tuning defaults", () => {
    let staticHits = 0;
    let fullHits = 0;
    let candidates = 0;
    for (const fixture of fixtures) {
      const baseline = rankCoupling(
        [fixture.seed],
        fixture.signals.filter((s) => s.kind === "static" || s.kind === "shared-test"),
      ).slice(0, 2);
      const full = rankCoupling([fixture.seed], fixture.signals).slice(0, 2);
      staticHits += Number(baseline.some((r) => r.artifact === fixture.missed));
      fullHits += Number(full.some((r) => r.artifact === fixture.missed));
      candidates += full.length;
    }
    expect(staticHits).toBe(2);
    expect(fullHits).toBe(5);
    expect(candidates).toBe(7);
    console.log(
      "Coupling fixture ablation (not live-agent quality)",
      JSON.stringify({
        fixtures: fixtures.length,
        k: 2,
        staticRecall: staticHits / fixtures.length,
        fullRecall: fullHits / fixtures.length,
        fullPrecision: fullHits / candidates,
        missedRareDependencies: fixtures.length - fullHits,
      }),
    );
  });
});
