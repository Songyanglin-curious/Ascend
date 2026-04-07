import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { ChildCandidate } from "../../child-candidates/types.js";
import { createSqliteClient } from "./client.js";
import { createSqliteChildCandidateEventStore } from "./child-candidate-event-store.js";
import {
  getCurrentSchemaVersion,
  getTableColumnNames,
  SQLITE_SCHEMA_VERSION,
  tableExists,
} from "./migrations.js";
import { ensureSqliteSchema } from "./schema.js";

const TEST_DB_DIR = join(process.cwd(), ".tmp-sqlite-tests");

function createTestDatabasePath(): string {
  mkdirSync(TEST_DB_DIR, { recursive: true });
  return join(TEST_DB_DIR, `${randomUUID()}.db`);
}

function removeTestDatabase(path: string): void {
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

function createCandidate(candidateId: string): ChildCandidate {
  return {
    candidateId,
    parentNodeId: "parent-1",
    title: "候选标题",
    summary: "候选摘要",
    type: "question",
    reason: "候选原因",
    evidence: "候选证据",
  };
}

test("空库执行 ensureSqliteSchema 后会初始化到当前版本", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      ensureSqliteSchema(client);

      assert.equal(tableExists(client, "schema_version"), true);
      assert.equal(tableExists(client, "nodes"), true);
      assert.equal(tableExists(client, "tree_state"), true);
      assert.equal(tableExists(client, "tree_relations"), true);
      assert.equal(tableExists(client, "child_candidate_events"), true);

      const treeState = client.db
        .prepare(`SELECT singleton_id, root_node_id FROM tree_state WHERE singleton_id = 1`)
        .get() as { singleton_id: number; root_node_id: string | null } | undefined;

      assert.deepEqual(treeState, {
        singleton_id: 1,
        root_node_id: null,
      });
      assert.equal(getCurrentSchemaVersion(client), SQLITE_SCHEMA_VERSION);
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("已是当前版本的数据库重复执行 ensureSqliteSchema 保持幂等", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      ensureSqliteSchema(client);
      client.db.prepare(`INSERT INTO nodes (id, scene_type, scene_input_json, execution_status) VALUES (?, ?, ?, ?)`).run(
        "node-1",
        "advance",
        "{}",
        "idle",
      );

      ensureSqliteSchema(client);

      const countRow = client.db
        .prepare(`SELECT COUNT(*) AS count FROM nodes`)
        .get() as { count: number };

      assert.equal(countRow.count, 1);
      assert.equal(getCurrentSchemaVersion(client), SQLITE_SCHEMA_VERSION);
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("无版本旧库会自动迁移 child_candidate_events 并补出 candidate_id", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      client.db.exec(`
        CREATE TABLE child_candidate_events (
          id TEXT PRIMARY KEY,
          parent_node_id TEXT NOT NULL,
          candidate_json TEXT NOT NULL,
          selected INTEGER NOT NULL CHECK (selected IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      client.db
        .prepare(
          `
            INSERT INTO child_candidate_events (
              id,
              parent_node_id,
              candidate_json,
              selected,
              created_at
            ) VALUES (?, ?, ?, ?, ?)
          `,
        )
        .run(
          "legacy-event-1",
          "parent-legacy",
          JSON.stringify({ title: "旧候选" }),
          1,
          "2026-04-06 12:00:00",
        );

      ensureSqliteSchema(client);

      assert.deepEqual(getTableColumnNames(client, "child_candidate_events"), [
        "id",
        "parent_node_id",
        "candidate_id",
        "candidate_json",
        "selected",
        "created_at",
      ]);
      assert.equal(getCurrentSchemaVersion(client), SQLITE_SCHEMA_VERSION);

      const row = client.db
        .prepare(
          `
            SELECT id, parent_node_id, candidate_id, candidate_json, selected, created_at
            FROM child_candidate_events
            WHERE id = ?
          `,
        )
        .get("legacy-event-1") as
        | {
            id: string;
            parent_node_id: string;
            candidate_id: string;
            candidate_json: string;
            selected: number;
            created_at: string;
          }
        | undefined;

      assert.ok(row);
      assert.equal(row?.candidate_id, "legacy:legacy-event-1");
      assert.equal(row?.parent_node_id, "parent-legacy");
      assert.equal(row?.selected, 1);
      assert.equal(row?.candidate_json, JSON.stringify({ title: "旧候选" }));
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("旧库迁移后当前 candidateEventStore 写入链路恢复正常", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      client.db.exec(`
        CREATE TABLE child_candidate_events (
          id TEXT PRIMARY KEY,
          parent_node_id TEXT NOT NULL,
          candidate_json TEXT NOT NULL,
          selected INTEGER NOT NULL CHECK (selected IN (0, 1)),
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      ensureSqliteSchema(client);

      const eventStore = createSqliteChildCandidateEventStore(client);
      eventStore.recordConfirmationBatch({
        parentNodeId: "parent-1",
        candidates: [createCandidate("candidate-1")],
        selectedCandidateIds: ["candidate-1"],
      });

      const row = client.db
        .prepare(
          `
            SELECT parent_node_id, candidate_id, selected
            FROM child_candidate_events
            WHERE parent_node_id = ?
          `,
        )
        .get("parent-1") as
        | { parent_node_id: string; candidate_id: string; selected: number }
        | undefined;

      assert.ok(row);
      assert.equal(row?.candidate_id, "candidate-1");
      assert.equal(row?.selected, 1);
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("未来版本数据库会被显式拒绝", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      client.db.exec(`
        CREATE TABLE schema_version (
          singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
          version INTEGER NOT NULL
        )
      `);

      client.db
        .prepare(`INSERT INTO schema_version (singleton_id, version) VALUES (1, ?)`)
        .run(SQLITE_SCHEMA_VERSION + 1);

      assert.throws(
        () => ensureSqliteSchema(client),
        /未来版本数据库/,
      );
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});
