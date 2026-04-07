# 02-plan：里程碑 3 数据库迁移与版本管理实现计划

## 摘要

- 当前基线：SQLite 已经成为运行时主存储介质，但数据库还没有正式的 schema 版本管理与自动迁移机制。
- 当前已知真实问题：旧库中的 `child_candidate_events` 可能缺少 `candidate_id`，导致当前代码写入失败。
- 本次实现目标：在不改变 `NodeStore / TreeStore / TreeService` 上层语义、不改变 `advance` 业务流程的前提下，补齐 SQLite schema 版本检查、迁移执行与旧库自动升级能力。
- 本次不做 UI、不做总结 Agent、不做 ORM、不做多棵树、不重构业务表语义。

## 本次要修改的文件

- 修改 [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)
- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- 修改 [package.json](D:/code/Ascend/package.json)
- 新增 [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)
- 新增 [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)

## 本次不修改的范围

- 不修改 [src/persistence/sqlite/node-store.ts](D:/code/Ascend/src/persistence/sqlite/node-store.ts) 的对外接口语义
- 不修改 [src/persistence/sqlite/tree-store.ts](D:/code/Ascend/src/persistence/sqlite/tree-store.ts) 的对外接口语义
- 不修改 [src/persistence/sqlite/child-candidate-event-store.ts](D:/code/Ascend/src/persistence/sqlite/child-candidate-event-store.ts) 的对外接口语义
- 不修改 [src/workflows/advance/](D:/code/Ascend/src/workflows/advance) 内部 workflow 逻辑
- 不修改 [src/node-tree/](D:/code/Ascend/src/node-tree) 的业务职责
- 不做 UI
- 不做总结 Agent
- 不做 ORM
- 不做多棵树管理

## 实现步骤

### 1. 冻结当前目标版本与版本承载结构

文件：

- 修改 [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)
- 新增 [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)

变更：

- 在 `schema.ts` 中冻结当前 SQLite schema 目标版本常量，例如 `SQLITE_SCHEMA_VERSION`。
- 定义 schema 版本承载表，例如 `schema_version`，只保存当前数据库版本。
- 将“确保可用 schema”的职责从“只会 CREATE TABLE”升级为：
  - 识别空库
  - 识别无版本旧库
  - 识别已版本化数据库

新增接口与函数：

- `SQLITE_SCHEMA_VERSION`
- `ensureSqliteSchema(client: SqliteClient): void`
- `getCurrentSchemaVersion(client: SqliteClient): number | null`
- `ensureSchemaVersionTable(client: SqliteClient): void`

输入输出：

- 输入：`SqliteClient`
- 输出：数据库处于可识别版本状态；如失败则直接抛错

关键逻辑分支：

1. 空库：无业务表、无版本表
2. 旧库：有业务表、无版本表
3. 已版本化库：有版本表
4. 未来版本库：版本号高于当前代码支持值

关键异常路径：

- 版本表创建失败：直接抛错
- 读取版本失败：直接抛错
- 识别到未来版本：直接抛错

验证命令：

- `pnpm typecheck`

### 2. 把迁移逻辑从 schema 初始化中拆出来

文件：

- 新增 [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)
- 修改 [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)

变更：

- 在 `migrations.ts` 中集中定义：
  - 版本读取
  - 版本写入
  - 迁移列表
  - 按顺序执行迁移
- `schema.ts` 只负责“入口编排”，不直接堆叠全部迁移 SQL。

新增接口与函数：

- `migrateSqliteSchema(client: SqliteClient): void`
- `setSchemaVersion(client: SqliteClient, version: number): void`
- `initializeFreshSchema(client: SqliteClient): void`
- `migrateFromLegacySchema(client: SqliteClient): void`
- `runSchemaMigrations(client: SqliteClient, fromVersion: number, toVersion: number): void`

输入输出：

- 输入：`SqliteClient`
- 输出：数据库最终被升级到 `SQLITE_SCHEMA_VERSION`

关键逻辑分支：

1. 空库初始化到最新版本
2. 无版本旧库迁移到版本化结构
3. 低版本库按顺序升级到最新版本
4. 已是最新版本则跳过

关键异常路径：

- 任一步迁移失败时，不写入成功版本号
- 缺少某个中间迁移定义时，直接抛错

验证命令：

- `pnpm typecheck`

### 3. 明确 v1 旧库到当前版本的最小迁移

文件：

- 新增 [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)

变更：

- 冻结本里程碑至少支持的迁移路径：
  - 无版本旧库，但已存在 `nodes / tree_state / tree_relations / child_candidate_events`
  - `child_candidate_events` 缺少 `candidate_id`
- 迁移结果要求：
  - `child_candidate_events` 具备 `candidate_id`
  - 现有 `candidate_json / selected / created_at / parent_node_id` 数据保持可读

新增接口与函数：

- `migrateLegacyChildCandidateEvents(client: SqliteClient): void`
- `tableExists(client: SqliteClient, tableName: string): boolean`
- `getTableColumnNames(client: SqliteClient, tableName: string): string[]`

输入输出：

- 输入：旧库
- 输出：升级后的当前版本业务表结构

关键逻辑分支：

1. `child_candidate_events` 已有 `candidate_id`：跳过
2. `child_candidate_events` 缺 `candidate_id`：执行迁移
3. `child_candidate_events` 表不存在但库是空库：走初始化，不走旧库迁移

关键异常路径：

- 迁移后列仍不存在：直接抛错
- 迁移中数据复制失败：直接抛错

说明：

- 本次 plan 不预设必须使用 `ALTER TABLE ADD COLUMN` 还是“建新表搬迁替换”，但实现必须保证最终结构满足当前代码。
- 若需要为旧数据补 `candidate_id`，可以采用稳定可重现的生成方式，但不得留空并假装满足当前代码。

验证命令：

- `pnpm typecheck`

### 4. 让启动入口先迁移后装配 store

文件：

- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- 修改 [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)

变更：

- `src/index.ts` 启动时固定顺序改为：
  1. `createSqliteClient(...)`
  2. `ensureSqliteSchema(...)`
  3. 创建 SQLite `nodeStore / treeStore / candidateEventStore`
  4. 才进入 root 检查与业务主流程

输入输出：

- 输入：固定数据库路径 `D:\db\sqlite\data\ascend.db`
- 输出：主流程继续运行或顶层失败退出

关键逻辑分支：

1. 空库：初始化后继续
2. 旧库：迁移后继续
3. 最新版本库：直接继续
4. 未来版本库：启动失败

关键异常路径：

- 迁移失败：顶层捕获并 `process.exit(1)`
- 不新增新的运行模式或 fallback

验证命令：

- `pnpm build`

### 5. 补齐迁移测试

文件：

- 新增 [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)
- 修改 [package.json](D:/code/Ascend/package.json)

变更：

- 增加专门的迁移测试文件，不把迁移逻辑混进已有持久化测试里。
- `pnpm test` 纳入迁移测试。

必测场景：

1. 空库执行 `ensureSqliteSchema(...)` 后：
   - 创建版本表
   - 创建业务表
   - 版本号等于当前目标版本
2. 已是当前版本的数据库重复执行 `ensureSqliteSchema(...)`：
   - 不报错
   - 不破坏现有数据
3. 构造一个旧库：
   - 只有旧版 `child_candidate_events`
   - 没有版本表
   - 执行 `ensureSqliteSchema(...)` 后成功升级
4. 旧库迁移后：
   - `child_candidate_events` 包含 `candidate_id`
   - 当前代码写入不再失败
5. 构造“未来版本库”：
   - 版本号大于当前代码版本
   - `ensureSqliteSchema(...)` 直接失败

关键异常路径：

- 迁移过程中失败时，测试必须能看见显式错误，而不是静默通过

验证命令：

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## 公共接口冻结

本次编码后至少形成以下接口：

- `SQLITE_SCHEMA_VERSION`
- `ensureSqliteSchema(client)`
- `getCurrentSchemaVersion(client)`
- `migrateSqliteSchema(client)`

说明：

- 上层入口继续只调用 `ensureSqliteSchema(...)`
- 不把迁移细节泄漏到 `NodeStore / TreeStore / TreeService`

## 人工验收路径

1. 准备一个空数据库文件路径，执行 `pnpm dev`
2. 确认数据库被初始化到最新 schema，并能继续主流程
3. 准备一个旧库：
   - `child_candidate_events` 没有 `candidate_id`
   - 无版本表
4. 执行 `pnpm dev`
5. 确认程序自动迁移成功
6. 再执行一次候选确认流程，确认不再出现：
   - `table child_candidate_events has no column named candidate_id`
7. 再次执行 `pnpm dev`
8. 确认对已迁移数据库重复启动不报错、不重复破坏性改表

## 本次不做

- 不做通用迁移 CLI 工具
- 不做复杂历史版本矩阵
- 不做页面可视化
- 不做总结 Agent
- 不做 ORM
- 不做多棵树管理

## 完成标准

- 启动路径具备正式的 schema 版本检查与自动迁移能力
- 旧库缺少 `candidate_id` 时能自动修复
- 空库与旧库都能在同一入口下启动成功
- 已是最新版本的数据库重复启动保持幂等
- `pnpm test`、`pnpm typecheck`、`pnpm build` 全通过后，才进入下一步

## 默认假设

- 当前目标版本只覆盖 SQLite 主流程正常运行所需的最小结构
- 当前唯一必须覆盖的旧库差异仍是 `child_candidate_events` 缺少 `candidate_id`
- 若旧数据本身缺少稳定候选标识，本次迁移允许为历史记录生成确定性 `candidate_id`
