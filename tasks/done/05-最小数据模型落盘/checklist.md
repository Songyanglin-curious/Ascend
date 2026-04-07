# checklist：里程碑 1 最小 SQLite 持久化

## 当前阶段

- 已完成 `00-Requirement.md`
- 已完成 `01-spec.md`
- 已完成 `02-plan.md`
- 当前进度：里程碑 1 已编码完成，等待人工联调验收

## 本次里程碑目标

- [x] `nodes` 能持久化真实节点内容
- [x] `tree_state / tree_relations` 能持久化单树关系
- [x] `child_candidate_events` 能持久化候选确认结果
- [x] 重启后能读回既有 root、nodes 与 tree

## 文件清单

- [x] 修改 [package.json](D:/code/Ascend/package.json)
- [x] 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- [x] 修改 [src/child-candidates/flow.ts](D:/code/Ascend/src/child-candidates/flow.ts)
- [x] 新增 [src/persistence/sqlite/client.ts](D:/code/Ascend/src/persistence/sqlite/client.ts)
- [x] 新增 [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)
- [x] 新增 [src/persistence/sqlite/node-store.ts](D:/code/Ascend/src/persistence/sqlite/node-store.ts)
- [x] 新增 [src/persistence/sqlite/tree-store.ts](D:/code/Ascend/src/persistence/sqlite/tree-store.ts)
- [x] 新增 [src/persistence/sqlite/child-candidate-event-store.ts](D:/code/Ascend/src/persistence/sqlite/child-candidate-event-store.ts)
- [x] 新增 [src/persistence/sqlite/sqlite-persistence.test.ts](D:/code/Ascend/src/persistence/sqlite/sqlite-persistence.test.ts)
- [x] 更新 [tasks/active/checklist.md](D:/code/Ascend/tasks/active/checklist.md)
- [x] 更新 [tasks/active/05-review.md](D:/code/Ascend/tasks/active/05-review.md)

## 实现检查项

### 1. SQLite 基础设施
- [x] 实现 `createSqliteClient(...)`
- [x] 实现 `ensureSqliteSchema(...)`
- [x] 建立 `nodes`
- [x] 建立 `tree_state`
- [x] 建立 `tree_relations`
- [x] 建立 `child_candidate_events`
- [x] 初始化 `tree_state` 单例记录

### 2. Node / Tree 持久化
- [x] 实现 SQLite 版 `NodeStore`
- [x] 实现 SQLite 版 `TreeStore`
- [x] `createNode(...)` 能落盘
- [x] `replaceNode(...)` 能持久化状态变化
- [x] `setRoot(...)` 能持久化 root
- [x] `attachChild(...)` 能持久化父子关系与顺序

### 3. 候选确认事件落盘
- [x] 实现 `ChildCandidateEventStore`
- [x] `processCompletedNodeChildCandidates(...)` 增加事件落盘
- [x] 已选与未选候选都能记录

### 4. 入口与恢复
- [x] 入口改用 SQLite store
- [x] 若数据库没有 root，则创建 root 并执行场景
- [x] 若数据库已有 root，则不重复创建
- [x] 退出时仍打印 `nodes/tree` 快照

### 5. 测试补齐
- [x] 新增 SQLite 持久化测试文件
- [x] 覆盖 schema 建表
- [x] 覆盖 node 落盘与读回
- [x] 覆盖 tree 落盘与顺序恢复
- [x] 覆盖 child_candidate_events 落盘
- [x] 覆盖重启后重新读回

## 范围检查

- [x] 不修改 [src/workflows/advance/graph.ts](D:/code/Ascend/src/workflows/advance/graph.ts)
- [x] 不修改 [src/workflows/advance/nodes.ts](D:/code/Ascend/src/workflows/advance/nodes.ts)
- [x] 不修改 [src/workflows/advance/prompts.ts](D:/code/Ascend/src/workflows/advance/prompts.ts)
- [x] 不修改 [src/workflows/advance/scene.ts](D:/code/Ascend/src/workflows/advance/scene.ts)
- [x] 不修改 [src/node-tree/types.ts](D:/code/Ascend/src/node-tree/types.ts) 的公开接口语义
- [x] 不做 UI
- [x] 不做总结 Agent
- [x] 不做 ORM
- [x] 不做多棵树管理

## 验证清单

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test`
- [ ] 人工执行 `pnpm dev`，确认 root/child/事件落盘与重启可读
