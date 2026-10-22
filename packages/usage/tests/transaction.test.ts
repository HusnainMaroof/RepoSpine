import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/db";
import { inTransaction } from "../src/transaction";

describe("transaction runtime compatibility", () => {
  it("reuses managed transactions when the runtime has no transaction-state property", () => {
    const db = openDatabase(":memory:");
    // Facade exercises real SQLite while simulating the older runtime surface;
    // newer runtimes expose a non-configurable isTransaction property.
    const legacy = { exec: db.exec.bind(db) } as unknown as DatabaseSync;
    try {
      db.exec("CREATE TABLE observations (value INTEGER)");
      inTransaction(legacy, () =>
        inTransaction(legacy, () => {
          db.exec("INSERT INTO observations VALUES (1)");
        }),
      );
      expect(db.prepare("SELECT value FROM observations").all()).toEqual([{ value: 1 }]);
      expect(() =>
        inTransaction(legacy, () => {
          inTransaction(legacy, () => db.exec("INSERT INTO observations VALUES (2)"));
          throw new Error("rollback sentinel");
        }),
      ).toThrow("rollback sentinel");
      expect(db.prepare("SELECT value FROM observations").all()).toEqual([{ value: 1 }]);
      // A failed outer transaction must release tracking, not poison later writes.
      inTransaction(legacy, () => db.exec("INSERT INTO observations VALUES (3)"));
      expect(db.prepare("SELECT value FROM observations").all()).toEqual([
        { value: 1 },
        { value: 3 },
      ]);
    } finally {
      db.close();
    }
  });
});
