import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChangeSession } from "@prof-bilal/atlas-core";
import { describe, expect, it } from "vitest";
import { ContextStore } from "../src/context-store";
import { openDatabase } from "../src/db";
import { ProofStore } from "../src/proof-store";

describe("separate proof persistence", () => {
  it("serializes independent clients with expiring, owner-bound leases", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-proof-lease-"));
    const a = new ProofStore(join(dir, "proof.db"));
    const b = new ProofStore(join(dir, "proof.db"));
    try {
      expect(a.acquireLease("repo", "a", 100, 50)).toBe(true);
      expect(b.acquireLease("repo", "b", 110, 50)).toBe(false);
      b.releaseLease("repo", "b");
      expect(a.renewLease("repo", "a", 120, 50)).toBe(true);
      expect(b.acquireLease("repo", "b", 160, 50)).toBe(false);
      expect(b.acquireLease("repo", "b", 171, 50)).toBe(true);
      expect(a.renewLease("repo", "a", 172, 50)).toBe(false);
      a.releaseLease("repo", "a");
      expect(b.renewLease("repo", "b", 173, 50)).toBe(true);
    } finally {
      a.close();
      b.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("retains de-duplicated advisory memory across sessions", () => {
    const store = new ProofStore();
    try {
      for (let i = 0; i < 3; i++)
        store.recordMemory(`failure-${i}`, "proof-failure", ["a.ts", "b.ts"]);
      store.recordMemory("failure-0", "proof-failure", ["a.ts", "b.ts"]);
      expect(store.couplingMemory()).toEqual([
        { from: "a.ts", to: "b.ts", kind: "proof-failure", samples: 3, value: 0.5 },
      ]);
    } finally {
      store.close();
    }
  });
  it("survives context cache replacement, restart and rejected concurrent writes", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-proof-store-"));
    const revision = {
      id: "r",
      repositoryId: "repo",
      head: null,
      observedAt: "now",
      complete: true,
      artifacts: [],
      dependencies: [],
      limitations: [],
    };
    const session: ChangeSession = {
      schemaVersion: 1,
      id: "a".repeat(32),
      version: 1,
      goal: "x",
      repositoryId: "repo",
      baseline: revision,
      current: revision,
      boundary: ["."],
      authorizedPaths: [],
      semanticChangeBudget: 1,
      state: "INVESTIGATING",
      nodes: [],
      evidence: [],
      receipts: [],
    };
    let store = new ProofStore(join(dir, "proof.db"));
    const context = new ContextStore({ filePath: join(dir, "context.db") });
    try {
      store.put(session, null);
      context.saveContext({});
      store.close();
      // Simulate the old v2 schema: latest state exists, history/leases did not yet ship.
      const legacy = openDatabase(join(dir, "proof.db"));
      legacy.exec("DROP TABLE ProofHistory; DROP TABLE ProofLeases; PRAGMA user_version = 2;");
      legacy.close();
      store = new ProofStore(join(dir, "proof.db"));
      expect(store.get(session.id)).toEqual(session);
      expect(store.history(session.id)[0].session).toEqual(session);
      store.put({ ...session, version: 2 }, 1);
      expect(() => store.put({ ...session, version: 2 }, 1)).toThrow("Concurrent");
      expect(store.get(session.id)?.version).toBe(2);
      expect(store.history(session.id).map((e) => e.version)).toEqual([1, 2]);
      expect(store.history(session.id, 1, 1)[0].session.version).toBe(2);
      expect(store.listIds()).toEqual([session.id]);
      expect(store.get("missing")).toBeNull();
    } finally {
      store.close();
      context.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
