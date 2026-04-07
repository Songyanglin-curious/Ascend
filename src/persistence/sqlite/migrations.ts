import type { SqliteClient } from "./client.js";

export const SQLITE_SCHEMA_VERSION = 2;

const SCHEMA_VERSION_TABLE = "schema_version";
const BUSINESS_TABLES = ["nodes", "tree_state", "tree_relations", "child_candidate_events"] as const;

function createNodesTable(client: SqliteClient): void {
  client.db.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      scene_type TEXT NOT NULL,
      scene_input_json TEXT NOT NULL,
      execution_status TEXT NOT NULL,
      raw_result_json TEXT NULL,
      error_message TEXT NULL,
      meta_title TEXT NULL,
      meta_summary TEXT NULL,
      source_parent_node_id TEXT NULL,
      source_candidate_id TEXT NULL,
      source_candidate_type TEXT NULL
    )
  `);
}

function createTreeStateTable(client: SqliteClient): void {
  client.db.exec(`
    CREATE TABLE IF NOT EXISTS tree_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      root_node_id TEXT NULL
    )
  `);
}

function createTreeRelationsTable(client: SqliteClient): void {
  client.db.exec(`
    CREATE TABLE IF NOT EXISTS tree_relations (
      node_id TEXT PRIMARY KEY,
      parent_id TEXT NULL,
      position INTEGER NOT NULL
    )
  `);
}

function createChildCandidateEventsTable(client: SqliteClient, tableName = "child_candidate_events"): void {
  client.db.exec(`
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id TEXT PRIMARY KEY,
      parent_node_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      candidate_json TEXT NOT NULL,
      selected INTEGER NOT NULL CHECK (selected IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function createIndexes(client: SqliteClient): void {
  client.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tree_relations_parent
    ON tree_relations(parent_id, position)
  `);

  client.db.exec(`
    CREATE INDEX IF NOT EXISTS idx_child_candidate_events_parent
    ON child_candidate_events(parent_node_id, created_at)
  `);
}

function ensureTreeStateSingleton(client: SqliteClient): void {
  client.db
    .prepare(
      `
        INSERT INTO tree_state (singleton_id, root_node_id)
        VALUES (1, NULL)
        ON CONFLICT(singleton_id) DO NOTHING
      `,
    )
    .run();
}

export function tableExists(client: SqliteClient, tableName: string): boolean {
  const row = client.db
    .prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
      `,
    )
    .get(tableName) as { name: string } | undefined;

  return row !== undefined;
}

export function getTableColumnNames(client: SqliteClient, tableName: string): string[] {
  if (!tableExists(client, tableName)) {
    return [];
  }

  const escapedTableName = tableName.replace(/'/g, "''");
  const rows = client.db
    .prepare(`PRAGMA table_info('${escapedTableName}')`)
    .all() as Array<{ name: string }>;

  return rows.map((row) => row.name);
}

function hasAnyBusinessTable(client: SqliteClient): boolean {
  return BUSINESS_TABLES.some((tableName) => tableExists(client, tableName));
}

function isEmptyDatabase(client: SqliteClient): boolean {
  return !hasAnyBusinessTable(client);
}

export function ensureSchemaVersionTable(client: SqliteClient): void {
  client.db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      version INTEGER NOT NULL
    )
  `);
}

export function getCurrentSchemaVersion(client: SqliteClient): number | null {
  if (!tableExists(client, SCHEMA_VERSION_TABLE)) {
    return null;
  }

  const row = client.db
    .prepare(
      `
        SELECT version
        FROM schema_version
        WHERE singleton_id = 1
      `,
    )
    .get() as { version: number } | undefined;

  return row?.version ?? null;
}

export function setSchemaVersion(client: SqliteClient, version: number): void {
  client.db
    .prepare(
      `
        INSERT INTO schema_version (singleton_id, version)
        VALUES (1, ?)
        ON CONFLICT(singleton_id) DO UPDATE SET version = excluded.version
      `,
    )
    .run(version);
}

export function initializeFreshSchema(client: SqliteClient): void {
  client.transaction(() => {
    ensureSchemaVersionTable(client);
    createNodesTable(client);
    createTreeStateTable(client);
    createTreeRelationsTable(client);
    createChildCandidateEventsTable(client);
    createIndexes(client);
    ensureTreeStateSingleton(client);
    setSchemaVersion(client, SQLITE_SCHEMA_VERSION);
  });
}

function buildLegacyCandidateId(eventId: string): string {
  return `legacy:${eventId}`;
}

export function migrateLegacyChildCandidateEvents(client: SqliteClient): void {
  if (!tableExists(client, "child_candidate_events")) {
    createChildCandidateEventsTable(client);
    createIndexes(client);
    return;
  }

  const columnNames = getTableColumnNames(client, "child_candidate_events");
  if (columnNames.includes("candidate_id")) {
    createIndexes(client);
    return;
  }

  client.db.exec(`
    CREATE TABLE child_candidate_events__migrated (
      id TEXT PRIMARY KEY,
      parent_node_id TEXT NOT NULL,
      candidate_id TEXT NOT NULL,
      candidate_json TEXT NOT NULL,
      selected INTEGER NOT NULL CHECK (selected IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  client.db.exec(`
    INSERT INTO child_candidate_events__migrated (
      id,
      parent_node_id,
      candidate_id,
      candidate_json,
      selected,
      created_at
    )
    SELECT
      id,
      parent_node_id,
      'legacy:' || id,
      candidate_json,
      selected,
      created_at
    FROM child_candidate_events
  `);

  client.db.exec(`DROP TABLE child_candidate_events`);
  client.db.exec(`ALTER TABLE child_candidate_events__migrated RENAME TO child_candidate_events`);
  createIndexes(client);

  const migratedRows = client.db
    .prepare(
      `
        SELECT id, candidate_id
        FROM child_candidate_events
      `,
    )
    .all() as Array<{ id: string; candidate_id: string }>;

  for (const row of migratedRows) {
    if (row.candidate_id !== buildLegacyCandidateId(row.id)) {
      throw new Error("旧版 child_candidate_events 迁移后 candidate_id 校验失败。");
    }
  }
}

export function migrateFromLegacySchema(client: SqliteClient): void {
  client.transaction(() => {
    ensureSchemaVersionTable(client);
    createNodesTable(client);
    createTreeStateTable(client);
    createTreeRelationsTable(client);
    migrateLegacyChildCandidateEvents(client);
    createIndexes(client);
    ensureTreeStateSingleton(client);
    setSchemaVersion(client, SQLITE_SCHEMA_VERSION);
  });
}

const VERSIONED_MIGRATIONS: Record<number, (client: SqliteClient) => void> = {
  1: (client) => {
    client.transaction(() => {
      migrateLegacyChildCandidateEvents(client);
    });
  },
};

export function runSchemaMigrations(
  client: SqliteClient,
  fromVersion: number,
  toVersion: number,
): void {
  if (fromVersion === toVersion) {
    return;
  }

  if (fromVersion > toVersion) {
    throw new Error(
      `检测到未来版本数据库：当前数据库版本 ${fromVersion} 高于代码支持版本 ${toVersion}。`,
    );
  }

  for (let currentVersion = fromVersion; currentVersion < toVersion; currentVersion += 1) {
    const migrate = VERSIONED_MIGRATIONS[currentVersion];
    if (migrate === undefined) {
      throw new Error(`缺少从 schema 版本 ${currentVersion} 升级的迁移定义。`);
    }

    migrate(client);
    setSchemaVersion(client, currentVersion + 1);
  }
}

export function migrateSqliteSchema(client: SqliteClient): void {
  const versionTableExists = tableExists(client, SCHEMA_VERSION_TABLE);
  const currentVersion = getCurrentSchemaVersion(client);

  if (!versionTableExists && isEmptyDatabase(client)) {
    initializeFreshSchema(client);
    return;
  }

  if (currentVersion === null) {
    if (!hasAnyBusinessTable(client)) {
      initializeFreshSchema(client);
      return;
    }

    migrateFromLegacySchema(client);
    return;
  }

  ensureSchemaVersionTable(client);
  runSchemaMigrations(client, currentVersion, SQLITE_SCHEMA_VERSION);
}
