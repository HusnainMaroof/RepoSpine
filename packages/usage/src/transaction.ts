import type { DatabaseSync } from "node:sqlite";

// Older supported Node versions do not expose DatabaseSync.isTransaction.
// Track transactions owned by this helper without relying on that optional
// runtime property. A WeakSet does not retain closed database handles.
const managedTransactions = new WeakSet<DatabaseSync>();

/**
 * Run `fn` inside a transaction. When a transaction is already open (nested
 * call), `fn` runs in the outer one. Mirrors `@prof-bilal/atlas-storage`'s helper so the
 * usage store owns its own persistence without importing a feature package.
 */
export function inTransaction(db: DatabaseSync, fn: () => void): void {
  if (managedTransactions.has(db) || db.isTransaction) {
    fn();
    return;
  }
  db.exec("BEGIN IMMEDIATE");
  managedTransactions.add(db);
  try {
    fn();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    managedTransactions.delete(db);
  }
}
