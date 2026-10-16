import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assembleContextPackage,
  buildWorkPacket,
  createContextSDK,
  detectStaleness,
  estimateTokens,
  indexProject,
  renderContextPackage,
  renderWorkPacket,
} from "../src/index";

const seeds = [
  { task: "Explain hashPassword in src/auth/password.ts", expected: "src/auth/password.ts" },
  { task: "Review SessionStore in src/auth/session.ts", expected: "src/auth/session.ts" },
  {
    task: "Fix payment validation in src/payments/payment-validator.ts",
    expected: "src/payments/payment-validator.ts",
  },
  { task: "Refactor src/payments/payment-service.ts", expected: "src/payments/payment-service.ts" },
  {
    task: "Explain users in src/users/user-repository.ts",
    expected: "src/users/user-repository.ts",
  },
  { task: "Inspect user types in src/users/user-model.ts", expected: "src/users/user-model.ts" },
  { task: "Test normalizeEmail in src/utils/id.ts", expected: "src/utils/id.ts" },
  {
    task: "Explain audit logging in src/services/audit-service.ts",
    expected: "src/services/audit-service.ts",
  },
];
const budgets = [2500, 3500, 5000, 8000, 12000];
const cases = seeds.flatMap((entry) => [
  entry,
  ...[
    "Locate the defining symbols and their exact source ranges in ",
    "Identify callers and dependencies before changing ",
    "Find related tests and verification requirements for ",
    "Review public contracts and scope risks for ",
  ].map((prefix) => ({ task: prefix + entry.expected, expected: entry.expected })),
]);

describe("offline WorkPacket delivery evaluation", () => {
  it("compares 40 fixture tasks at five budgets (200 delivery cases)", async () => {
    const root = await mkdtemp(join(tmpdir(), "atlas-packet-eval-"));
    const source = fileURLToPath(
      new URL("../../../tests/fixtures/mcp-audit-repo", import.meta.url),
    );
    await cp(source, root, { recursive: true });
    expect((await indexProject({ repositoryPath: root, mode: "build" })).ok).toBe(true);
    const sdk = createContextSDK({ repositoryPath: root });
    const rows: Array<{
      task: string;
      budget: number;
      legacyTokens: number;
      packetTokens: number;
      legacyRecall: boolean;
      packetRecall: boolean;
      deferred: number;
    }> = [];
    try {
      const staleness = await detectStaleness(sdk);
      for (const entry of cases) {
        for (const maxTokens of budgets) {
          const legacy = assembleContextPackage({
            context: sdk,
            repositoryPath: root,
            task: entry.task,
            staleness,
            options: { budget: { maxTokensTotal: maxTokens } },
          });
          const packet = await buildWorkPacket(sdk, { task: entry.task, maxTokens });
          rows.push({
            task: entry.task,
            budget: maxTokens,
            legacyTokens: estimateTokens(renderContextPackage(legacy)),
            packetTokens: estimateTokens(renderWorkPacket(packet)),
            legacyRecall: legacy.items.some(
              (item) => item.path !== null && relative(root, item.path) === entry.expected,
            ),
            packetRecall: packet.evidence.some((ref) => ref.path === entry.expected),
            deferred: packet.evidence.filter((ref) => ref.deferred).length,
          });
          expect(packet.budget.estimatedTokens).toBeLessThanOrEqual(maxTokens);
          expect(estimateTokens(renderWorkPacket(packet))).toBeLessThanOrEqual(maxTokens);
          expect(JSON.stringify(packet)).not.toContain("PRIVATE KEY");
        }
      }
      expect(cases).toHaveLength(40);
      expect(rows).toHaveLength(200);
      expect(rows.filter((row) => row.budget >= 5000).every((row) => row.packetRecall)).toBe(true);
      // Real-model completion, cost and tool selection are deliberately not inferred
      // from deterministic packet tests.
      console.info(
        "WorkPacket offline baseline",
        JSON.stringify({
          cases: rows.length,
          legacyRecall: rows.filter((row) => row.legacyRecall).length,
          packetRecall: rows.filter((row) => row.packetRecall).length,
          legacyTokens: rows.reduce((sum, row) => sum + row.legacyTokens, 0),
          packetTokens: rows.reduce((sum, row) => sum + row.packetTokens, 0),
          deferred: rows.reduce((sum, row) => sum + row.deferred, 0),
        }),
      );
    } finally {
      sdk.close();
      await rm(root, { recursive: true, force: true });
    }
  }, 60000);
});
