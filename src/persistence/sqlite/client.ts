import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import Database from "better-sqlite3";

export interface SqliteClient {
  db: Database.Database;
  transaction<T>(fn: () => T): T;
  close(): void;
}

export function createSqliteClient(databasePath: string): SqliteClient {
  mkdirSync(dirname(databasePath), { recursive: true });

  const db = new Database(databasePath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");

  return {
    db,
    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },
    close(): void {
      db.close();
    },
  };
}
