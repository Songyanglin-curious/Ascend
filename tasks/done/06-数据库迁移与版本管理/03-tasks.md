# 03-tasks：里程碑 3 数据库迁移与版本管理编码任务拆分

## 使用方式

- 本文档用于把 [02-plan.md](D:/code/Ascend/tasks/active/02-plan.md) 继续拆到“拿着就能直接编码”的粒度。
- 当前仍处于文档阶段，不进入实现。
- 每个任务块都包含：目标文件、要新增或修改的函数、具体编码点、完成后最小自检点。

## 任务 1：在 `schema.ts` 冻结版本常量与入口职责

目标文件：

- [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)

要做的事：

1. 新增当前目标版本常量，例如：
   - `export const SQLITE_SCHEMA_VERSION = 1`
2. 保留 `ensureSqliteSchema(client)` 作为上层唯一入口，不把迁移细节暴露给 `index.ts`
3. 让 `ensureSqliteSchema(client)` 内部固定只做三件事：
   - 确保版本表可读
   - 判断当前库属于空库、旧库、已版本化库还是未来版本库
   - 调用迁移/初始化函数，把数据库收敛到当前版本

编码要求：

- 不在 `schema.ts` 里堆大量迁移 SQL
- 不在 `schema.ts` 里直接实现具体旧表迁移细节
- `ensureSqliteSchema(client)` 只做编排，不做 store 装配

完成后自检：

- `ensureSqliteSchema(client)` 仍然只有一个对外入口职责
- `index.ts` 后续不需要了解版本号或迁移步骤

## 任务 2：在 `migrations.ts` 建立版本表与版本读写函数

目标文件：

- [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)

要做的事：

1. 新增 `ensureSchemaVersionTable(client)`：
   - 创建版本表
   - 不破坏已有数据
2. 新增 `getCurrentSchemaVersion(client)`：
   - 读版本表
   - 若版本表存在但无记录，返回 `null`
3. 新增 `setSchemaVersion(client, version)`：
   - 把版本号写成单值
   - 重复写入时覆盖旧值，而不是追加多条记录

编码要求：

- 版本表只承载 schema 版本，不混入别的业务元信息
- `getCurrentSchemaVersion(client)` 返回值语义必须清晰：
   - `null` 代表当前无可用版本信息
   - `number` 代表明确版本
- 不得在读取失败时偷偷返回默认版本

完成后自检：

- 版本表可以被重复初始化
- 版本号可以稳定读写

## 任务 3：定义“空库”和“旧库”的识别函数

目标文件：

- [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)

要做的事：

1. 新增 `tableExists(client, tableName)`：
   - 查 `sqlite_master`
2. 新增 `getTableColumnNames(client, tableName)`：
   - 用 `PRAGMA table_info(...)` 取列名
3. 新增内部判断函数，至少能表达：
   - 是否是空库
   - 是否是无版本旧库
   - 是否是已版本化库

编码要求：

- “空库”判断不能只看数据库文件是否存在，要看业务表是否存在
- “旧库”判断必须建立在：
   - 没有版本信息
   - 但已经有业务表
- 不允许把“版本表损坏”误判成空库

完成后自检：

- 能正确区分：
  - 全新空库
  - 旧表存在但无版本信息的库
  - 正常已版本化库

## 任务 4：实现空库初始化函数

目标文件：

- [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)

要做的事：

1. 新增 `initializeFreshSchema(client)`，负责：
   - 创建 `nodes`
   - 创建 `tree_state`
   - 创建 `tree_relations`
   - 创建 `child_candidate_events`
   - 创建索引
   - 初始化 `tree_state`
   - 写入当前 schema 版本

编码要求：

- 这里复用当前已冻结的“最新表结构”
- `child_candidate_events` 必须包含 `candidate_id`
- 初始化完成后数据库直接是“当前最新版本”，而不是无版本状态
- 整体放在事务里，避免只建一半

完成后自检：

- 空库执行后 4 张表都在
- `tree_state` 单例记录存在
- 版本号已写成当前目标版本

## 任务 5：实现旧库主迁移入口

目标文件：

- [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)

要做的事：

1. 新增 `migrateFromLegacySchema(client)`：
   - 处理“无版本信息，但业务表已存在”的旧库
2. 这个函数内部至少做：
   - 检查旧库表结构
   - 执行 `child_candidate_events` 迁移
   - 补写 schema version

编码要求：

- 旧库迁移必须是显式路径，不和空库初始化混在一起
- 若旧库已经满足当前结构，也要补写版本号
- 若旧库不满足当前最低可迁移前提，直接抛错，不要胡乱修

完成后自检：

- 无版本旧库执行后，数据库会变成当前版本
- 再次运行不会重复走破坏性逻辑

## 任务 6：实现 `child_candidate_events` 缺列迁移

目标文件：

- [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)

要做的事：

1. 新增 `migrateLegacyChildCandidateEvents(client)`：
   - 检查 `child_candidate_events` 是否存在 `candidate_id`
   - 若已存在则直接返回
   - 若不存在则执行迁移
2. 迁移后必须保证：
   - `candidate_id` 存在
   - 历史数据仍在
   - 后续代码写入不会因缺列失败

编码要求：

- 可选方案：
  - `ALTER TABLE ... ADD COLUMN`
  - 或“新表 -> 复制 -> 替换”
- 无论采用哪种方案，都必须为历史记录补一个确定性的 `candidate_id`
- 不允许把旧记录的 `candidate_id` 留成无意义空值然后假装迁移完成

推荐实现约束：

- 如果用“补列”方案：
  - 先加列
  - 再回填所有旧行
  - 最后校验没有空 `candidate_id`
- 如果用“重建表”方案：
  - 新表结构直接是最新结构
  - 迁移完成后旧表被替换

完成后自检：

- 旧表的全部历史记录仍可读
- 每条记录都有非空 `candidate_id`

## 任务 7：实现顺序迁移执行器

目标文件：

- [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)

要做的事：

1. 新增 `runSchemaMigrations(client, fromVersion, toVersion)`
2. 新增 `migrateSqliteSchema(client)`：
   - 统一编排空库、旧库、已版本化库、未来版本库四条路径

编码要求：

- 若 `fromVersion === toVersion`，直接跳过
- 若 `fromVersion > toVersion`，直接抛“未来版本不受支持”
- 若缺某个中间版本迁移步骤，直接抛错
- 每次只在迁移真正完成后再写版本号

完成后自检：

- 同一入口能处理：
  - 空库
  - 无版本旧库
  - 低版本库
  - 最新版本库
  - 未来版本库

## 任务 8：回接 `schema.ts` 对外入口

目标文件：

- [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)

要做的事：

1. 让 `ensureSqliteSchema(client)` 只委托给迁移编排函数
2. 保持外部调用方式不变

编码要求：

- 不要让 `index.ts` 直接调 `migrateSqliteSchema(client)`
- `schema.ts` 仍然是 SQLite schema 层的公开入口

完成后自检：

- 旧调用方不需要改调用签名

## 任务 9：让 `index.ts` 启动顺序严格先迁移后装配

目标文件：

- [src/index.ts](D:/code/Ascend/src/index.ts)

要做的事：

1. 检查当前启动流程中 `ensureSqliteSchema(client)` 的位置
2. 确保顺序固定为：
   - `createSqliteClient(...)`
   - `ensureSqliteSchema(...)`
   - `createSqliteNodeStore(...)`
   - `createSqliteTreeStore(...)`
   - `createSqliteChildCandidateEventStore(...)`
   - 主流程执行

编码要求：

- 不新增备用模式
- 迁移失败仍由顶层统一退出
- 不把迁移逻辑散落到业务主流程中

完成后自检：

- 主流程任何 store 创建前，schema 已经是最新版本

## 任务 10：新增迁移测试文件骨架

目标文件：

- [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)
- [package.json](D:/code/Ascend/package.json)

要做的事：

1. 建立独立测试文件
2. 复用 SQLite 临时库测试方式，不写生产数据库
3. 把该测试加入 `pnpm test`

编码要求：

- 不把迁移测试塞回已有 `sqlite-persistence.test.ts`
- 测试命名要直接体现迁移场景

完成后自检：

- `pnpm test` 会自动跑到迁移测试

## 任务 11：写“空库初始化到最新版本”测试

目标文件：

- [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)

要做的事：

1. 构造空数据库
2. 调 `ensureSqliteSchema(client)`
3. 断言：
   - 版本表存在
   - 4 张业务表存在
   - `tree_state` 单例记录存在
   - 版本号等于当前目标版本

完成后自检：

- 测试不依赖已有库状态

## 任务 12：写“最新版本库重复启动幂等”测试

目标文件：

- [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)

要做的事：

1. 先初始化一次最新版本库
2. 人工插入一条业务数据
3. 再跑一次 `ensureSqliteSchema(client)`
4. 断言：
   - 不报错
   - 数据仍在
   - 版本号不乱

完成后自检：

- 测试能证明“重复启动不破坏现有库”

## 任务 13：写“旧版 child_candidate_events 自动迁移”测试

目标文件：

- [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)

要做的事：

1. 手工建一个旧版 `child_candidate_events`：
   - 无 `candidate_id`
   - 有历史记录
2. 不创建版本表
3. 跑 `ensureSqliteSchema(client)`
4. 断言：
   - 表结构里已经出现 `candidate_id`
   - 历史记录仍在
   - 历史记录的 `candidate_id` 已被回填

完成后自检：

- 测试能覆盖你这次真实遇到的错误场景

## 任务 14：写“迁移后当前写入链路恢复正常”测试

目标文件：

- [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)

要做的事：

1. 构造旧版数据库
2. 执行 `ensureSqliteSchema(client)`
3. 创建当前版 `candidateEventStore`
4. 调一次 `recordConfirmationBatch(...)`
5. 断言：
   - 不再报 `no column named candidate_id`
   - 新写入数据成功落盘

完成后自检：

- 这个测试直接验证“迁移真的修复了运行时问题”

## 任务 15：写“未来版本库拒绝运行”测试

目标文件：

- [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)

要做的事：

1. 手工创建版本表
2. 插入一个高于当前代码目标版本的版本号
3. 调 `ensureSqliteSchema(client)`
4. 断言直接抛错

完成后自检：

- 错误必须是显式失败，不是被吞掉

## 任务 16：最终验证顺序

执行顺序：

1. `pnpm typecheck`
2. `pnpm build`
3. `pnpm test`

完成标准：

- 迁移层代码全部通过类型检查
- 构建通过
- 空库、旧库、幂等、未来版本、缺列修复全部有测试覆盖并通过
- 到这一步才允许生成 `checklist.md` 并进入实现收尾

## 本次不做

- 不直接修改真实生产库
- 不写一次性手工 SQL 修库脚本作为正式方案
- 不提前做页面
- 不提前做总结 Agent
- 不提前做多棵树管理
