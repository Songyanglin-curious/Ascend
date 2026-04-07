# 05-review：里程碑 3 数据库迁移与版本管理

## 结论

- 本里程碑已按 [00-Requirement.md](D:/code/Ascend/tasks/active/00-Requirement.md)、[01-spec.md](D:/code/Ascend/tasks/active/01-spec.md)、[02-plan.md](D:/code/Ascend/tasks/active/02-plan.md)、[03-tasks.md](D:/code/Ascend/tasks/active/03-tasks.md) 完成实现。
- 当前 SQLite 启动链路已经具备正式的 schema 版本检查与自动迁移能力。
- 真实遇到的旧库问题 `child_candidate_events` 缺少 `candidate_id` 已被纳入自动迁移覆盖。
- 自动化验证已通过；人工 `pnpm dev` 联调尚未执行。

## 已完成内容

- `schema.ts` 从“直接建最新表”收敛为单一公开入口，迁移细节下沉：
  - [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)
- 新增 SQLite 迁移模块：
  - [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)
- 启动入口明确为“先迁移，再装配 store”：
  - [src/index.ts](D:/code/Ascend/src/index.ts)
- 新增迁移测试并接入 `pnpm test`：
  - [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)
  - [package.json](D:/code/Ascend/package.json)

## 关键实现判断

- 当前目标 schema 版本冻结为 `2`。
- 空库初始化路径会直接创建：
  - `schema_version`
  - `nodes`
  - `tree_state`
  - `tree_relations`
  - `child_candidate_events`
  并把版本写为最新。
- 无版本旧库会进入显式迁移路径，而不是被误判为空库重建。
- 对旧版 `child_candidate_events`，迁移采用“新表复制后替换”的策略，确保迁移后的表结构真正具备 `candidate_id`，而不是只做不完整补列。
- 历史事件会用确定性的 `legacy:{eventId}` 方式回填 `candidate_id`，避免旧记录出现空标识。
- 对高于当前代码支持值的 schema 版本，系统会显式失败并阻止主流程继续运行。

## 验证结果

- `pnpm typecheck`：通过
- `pnpm build`：通过
- `pnpm test`：通过，45/45

## 覆盖到的核心场景

- 空库初始化到最新版本
- 当前版本库重复启动幂等
- 无版本旧库自动迁移
- `child_candidate_events` 缺失 `candidate_id` 自动修复
- 迁移后当前 `candidateEventStore` 写入恢复正常
- 未来版本数据库被显式拒绝

## 未完成项

- 未执行人工 `pnpm dev` 联调
- 未在真实数据库 `D:\db\sqlite\data\ascend.db` 上手工演练空库/旧库两条启动路径

## 范围确认

- 本次未修改 `advance` workflow 业务语义
- 本次未改 `NodeStore / TreeStore / ChildCandidateEventStore` 的对外接口语义
- 本次未实现 UI
- 本次未实现总结 Agent
- 本次未实现 ORM
- 本次未实现多棵树管理
