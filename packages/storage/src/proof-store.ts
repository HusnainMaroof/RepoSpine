import type { DatabaseSync } from "node:sqlite";
import { gunzipSync, gzipSync } from "node:zlib";
import type {
  ChangeSession,
  CouplingSignal,
  ProofHistoryEntry,
  ProofStorePort,
} from "@prof-bilal/atlas-core";
import { openDatabase } from "./db";
import { inTransaction } from "./transaction";

const MAX_SESSION_BYTES = 8 * 1024 * 1024;

/** Separate durable proof store; never participates in ContextStore.clearAll(). */
export class ProofStore implements ProofStorePort {
  private readonly db: DatabaseSync;
  private closed = false;
  constructor(filePath = ":memory:") {
    this.db = openDatabase(filePath);
    try {
      const version = (this.db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version;
      if (version > 3) throw new Error("Unsupported proof database version.");
      inTransaction(this.db, () => {
        this.db.exec(
          "CREATE TABLE IF NOT EXISTS ProofSessions (id TEXT PRIMARY KEY, version INTEGER NOT NULL, body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS ProofMemoryEvents (id TEXT PRIMARY KEY, kind TEXT NOT NULL, paths TEXT NOT NULL); PRAGMA user_version = 2;",
        );
        this.db.exec(
          "CREATE TABLE IF NOT EXISTS ProofHistory (session_id TEXT NOT NULL, version INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY(session_id, version)); CREATE TABLE IF NOT EXISTS ProofLeases (resource TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL); PRAGMA user_version = 3;",
        );
        this.db.exec(
          "INSERT OR IGNORE INTO ProofHistory SELECT id, version, body FROM ProofSessions",
        );
      });
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  /** Durable, append-only session versions preserve all intermediate revisions/node definitions. */
  history(id: string, afterVersion = 0, limit = 20): ProofHistoryEntry[] {
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(afterVersion) ||
      afterVersion < 0
    )
      throw new Error("Invalid history page size.");
    const rows = this.db
      .prepare(
        "SELECT version, body FROM ProofHistory WHERE session_id = ? AND version > ? ORDER BY version LIMIT ?",
      )
      .all(id, afterVersion, limit) as { version: number; body: string | Uint8Array }[];
    let bytes = 0;
    return rows.map((row) => {
      const body =
        typeof row.body === "string"
          ? row.body
          : gunzipSync(row.body, { maxOutputLength: MAX_SESSION_BYTES }).toString("utf8");
      const size = Buffer.byteLength(body);
      bytes += size;
      if (size > MAX_SESSION_BYTES || bytes > 16 * 1024 * 1024)
        throw new Error("Proof history page exceeds byte bound; reduce page size.");
      return { version: row.version, session: JSON.parse(body) as ChangeSession };
    });
  }
  listIds(): string[] {
    return (
      this.db.prepare("SELECT id FROM ProofSessions ORDER BY id").all() as { id: string }[]
    ).map((row) => row.id);
  }
  /** Expiring leases serialize cooperating SDK processes; never pretend to lock arbitrary editors. */
  acquireLease(resource: string, owner: string, now = Date.now(), ttl = 60000): boolean {
    let acquired = false;
    inTransaction(this.db, () => {
      this.db
        .prepare("DELETE FROM ProofLeases WHERE resource = ? AND expires <= ?")
        .run(resource, now);
      acquired =
        this.db
          .prepare("INSERT OR IGNORE INTO ProofLeases (resource, owner, expires) VALUES (?, ?, ?)")
          .run(resource, owner, now + ttl).changes === 1;
    });
    return acquired;
  }
  renewLease(resource: string, owner: string, now = Date.now(), ttl = 60000): boolean {
    return (
      this.db
        .prepare(
          "UPDATE ProofLeases SET expires = ? WHERE resource = ? AND owner = ? AND expires > ?",
        )
        .run(now + ttl, resource, owner, now).changes === 1
    );
  }
  releaseLease(resource: string, owner: string): void {
    this.db
      .prepare("DELETE FROM ProofLeases WHERE resource = ? AND owner = ?")
      .run(resource, owner);
  }
  /** Bounded, de-duplicated observations. Scores remain advisory, never supporting evidence. */
  recordMemory(id: string, kind: "proof-failure" | "agent-miss", paths: readonly string[]): void {
    if (paths.length < 2 || paths.length > 40) return;
    inTransaction(this.db, () => {
      this.db
        .prepare("INSERT OR IGNORE INTO ProofMemoryEvents (id, kind, paths) VALUES (?, ?, ?)")
        .run(id, kind, JSON.stringify([...new Set(paths)].sort()));
      this.db.exec(
        "DELETE FROM ProofMemoryEvents WHERE rowid NOT IN (SELECT rowid FROM ProofMemoryEvents ORDER BY rowid DESC LIMIT 1000)",
      );
    });
  }
  couplingMemory(): CouplingSignal[] {
    const rows = this.db.prepare("SELECT kind, paths FROM ProofMemoryEvents").all() as {
      kind: "proof-failure" | "agent-miss";
      paths: string;
    }[];
    const pairs = new Map<
      string,
      { from: string; to: string; kind: "proof-failure" | "agent-miss"; samples: number }
    >();
    for (const row of rows) {
      const paths: string[] = JSON.parse(row.paths);
      if (paths.length > 40) continue;
      for (let i = 0; i < paths.length; i++)
        for (let j = i + 1; j < paths.length; j++) {
          const from = paths[i];
          const to = paths[j];
          const key = JSON.stringify([row.kind, from, to]);
          const old = pairs.get(key);
          pairs.set(key, { from, to, kind: row.kind, samples: (old?.samples ?? 0) + 1 });
        }
    }
    return [...pairs.values()].map((p) => ({ ...p, value: p.samples / (p.samples + 3) }));
  }
  get(id: string): ChangeSession | null {
    const row = this.db.prepare("SELECT body, version FROM ProofSessions WHERE id = ?").get(id) as
      | { body: string; version: number }
      | undefined;
    if (!row) return null;
    if (Buffer.byteLength(row.body) > MAX_SESSION_BYTES)
      throw new Error("Proof session exceeds size bound.");
    const value = JSON.parse(row.body) as ChangeSession;
    if (
      value.schemaVersion !== 1 ||
      value.id !== id ||
      value.version !== row.version ||
      !Array.isArray(value.nodes) ||
      !Array.isArray(value.evidence) ||
      !value.current ||
      !value.baseline
    )
      throw new Error("Invalid proof session.");
    return value;
  }
  put(session: ChangeSession, expectedVersion: number | null): void {
    const body = JSON.stringify(session);
    if (Buffer.byteLength(body) > MAX_SESSION_BYTES)
      throw new Error("Proof session exceeds size bound.");
    inTransaction(this.db, () => {
      if (expectedVersion === null) {
        this.db
          .prepare("INSERT INTO ProofSessions (id, version, body) VALUES (?, ?, ?)")
          .run(session.id, session.version, body);
      } else {
        const result = this.db
          .prepare("UPDATE ProofSessions SET version = ?, body = ? WHERE id = ? AND version = ?")
          .run(session.version, body, session.id, expectedVersion);
        if (result.changes !== 1)
          throw new Error("Concurrent proof update; retry with current state.");
      }
      this.db
        .prepare("INSERT INTO ProofHistory (session_id, version, body) VALUES (?, ?, ?)")
        .run(session.id, session.version, gzipSync(body));
    });
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
