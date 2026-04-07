import type { SqliteClient } from "./client.js";
import { migrateSqliteSchema, SQLITE_SCHEMA_VERSION } from "./migrations.js";

export { SQLITE_SCHEMA_VERSION } from "./migrations.js";

// 对上层继续只暴露一个 schema 入口；迁移细节收敛在 migrations.ts。
export function ensureSqliteSchema(client: SqliteClient): void {
  migrateSqliteSchema(client);
}
