# 05-review：里程碑 1 最小 SQLite 持久化

## 结论

- 本里程碑已按 `00-Requirement.md / 01-spec.md / 02-plan.md` 完成编码实现。
- 当前主路径已经从内存 store 切换为 `SQLite + better-sqlite3`，并保持上层 `NodeStore / TreeStore / TreeService` 语义不变。
- 自动化验证已通过；人工 `pnpm dev` 联调尚未执行。

## 已完成内容

- 新增 SQLite 客户端与 schema 初始化：
  - [src/persistence/sqlite/client.ts](D:/code/Ascend/src/persistence/sqlite/client.ts)
  - [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)
- 新增 SQLite 版持久化实现：
  - [src/persistence/sqlite/node-store.ts](D:/code/Ascend/src/persistence/sqlite/node-store.ts)
  - [src/persistence/sqlite/tree-store.ts](D:/code/Ascend/src/persistence/sqlite/tree-store.ts)
  - [src/persistence/sqlite/child-candidate-event-store.ts](D:/code/Ascend/src/persistence/sqlite/child-candidate-event-store.ts)
- 修改入口，使 root 创建、child 批量创建与树关系维护走 SQLite：
  - [src/index.ts](D:/code/Ascend/src/index.ts)
  - [src/child-candidates/flow.ts](D:/code/Ascend/src/child-candidates/flow.ts)
- 新增 SQLite 持久化测试：
  - [src/persistence/sqlite/sqlite-persistence.test.ts](D:/code/Ascend/src/persistence/sqlite/sqlite-persistence.test.ts)
- 更新依赖与测试脚本：
  - [package.json](D:/code/Ascend/package.json)

## 关键实现判断

- `nodes` 负责保存节点真身，包括 `sceneInput`、`executionStatus`、`rawResult`、`errorMessage` 与 `meta`。
- `tree_state / tree_relations` 继续只保存单树关系，不保存节点业务内容。
- `child_candidate_events` 记录全部候选的确认结果，已选与未选都落盘。
- root 创建与 child 批量创建都通过 SQLite 事务包裹，避免出现“节点已写入但树关系缺失”的半成功状态。
- 第二次启动若已存在 root，不会重复创建，只打印当前 `nodes/tree` 快照，满足本里程碑的最小恢复要求。

## 验证结果

- `pnpm typecheck`：通过
- `pnpm build`：通过
- `pnpm test`：通过，40/40

## 实施过程中的关键问题

- `better-sqlite3` 初次安装时因 `pnpm` 默认跳过 build script，导致原生 binding 缺失，SQLite 测试全部失败。
- 通过允许 build 并执行 `pnpm rebuild better-sqlite3 --pending` 后，原生模块成功编译，SQLite 持久化测试恢复通过。

## 未完成项

- 未执行人工 `pnpm dev` 联调
- 未在真实数据库 `D:\db\sqlite\data\ascend.db` 上做手工验收

## 范围确认

- 本次未改 `advance` workflow 内部行为
- 本次未实现 UI
- 本次未实现总结 Agent
- 本次未实现 ORM
- 本次未实现多棵树管理
