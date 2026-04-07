# 02-plan：里程碑 1 最小 SQLite 持久化实现计划

## 摘要

- 当前基线：仓库里已经有可运行的 `advance` 场景、基于内存的 `NodeStore / TreeStore / TreeService`、候选子节点提取与人工确认链路。
- 本次实现目标：保持上层业务语义不变，只把节点、树关系、场景结果、候选确认事件落到 SQLite。
- 当前持久化方案固定为 `SQLite + better-sqlite3`，生产数据库路径固定为 `D:\db\sqlite\data\ascend.db`。
- 本次不做 UI、不做总结 Agent、不做 ORM、不做自动恢复执行现场、不做复杂查询优化。

## 本次要修改的文件

- 修改 [package.json](D:/code/Ascend/package.json)
- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- 修改 [src/child-candidates/flow.ts](D:/code/Ascend/src/child-candidates/flow.ts)
- 新增 [src/persistence/sqlite/client.ts](D:/code/Ascend/src/persistence/sqlite/client.ts)
- 新增 [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)
- 新增 [src/persistence/sqlite/node-store.ts](D:/code/Ascend/src/persistence/sqlite/node-store.ts)
- 新增 [src/persistence/sqlite/tree-store.ts](D:/code/Ascend/src/persistence/sqlite/tree-store.ts)
- 新增 [src/persistence/sqlite/child-candidate-event-store.ts](D:/code/Ascend/src/persistence/sqlite/child-candidate-event-store.ts)
- 新增 [src/persistence/sqlite/sqlite-persistence.test.ts](D:/code/Ascend/src/persistence/sqlite/sqlite-persistence.test.ts)

## 本次不修改的范围

- 不修改 [src/workflows/advance/graph.ts](D:/code/Ascend/src/workflows/advance/graph.ts)
- 不修改 [src/workflows/advance/nodes.ts](D:/code/Ascend/src/workflows/advance/nodes.ts)
- 不修改 [src/workflows/advance/prompts.ts](D:/code/Ascend/src/workflows/advance/prompts.ts)
- 不修改 [src/workflows/advance/scene.ts](D:/code/Ascend/src/workflows/advance/scene.ts)
- 不修改 [src/node-tree/types.ts](D:/code/Ascend/src/node-tree/types.ts) 的公开接口语义
- 不修改 [src/node-tree/tree-service.ts](D:/code/Ascend/src/node-tree/tree-service.ts) 的业务职责
- 不做 UI
- 不做总结 Agent
- 不做 ORM
- 不做自动恢复执行中现场
- 不做复杂树操作

## 实现步骤

### 1. 建立 SQLite 客户端与迁移入口

文件：
- 新增 [src/persistence/sqlite/client.ts](D:/code/Ascend/src/persistence/sqlite/client.ts)
- 新增 [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)

变更：
- 在 `client.ts` 中封装 SQLite 打开与事务能力。
- 在 `schema.ts` 中封装“确保现有 4 张表可用”的建表逻辑。

新增接口与函数：
- `createSqliteClient(databasePath: string): SqliteClient`
- `SqliteClient.db`
- `SqliteClient.transaction<T>(fn: () => T): T`
- `SqliteClient.close(): void`
- `ensureSqliteSchema(client: SqliteClient): void`

输入输出：
- 输入：数据库路径
- 输出：可供 store 与入口复用的 SQLite 客户端实例

关键逻辑分支：
1. 打开数据库连接
2. 设置 `foreign_keys`
3. 设置 `journal_mode = WAL`
4. 执行建表 SQL，确保以下表存在：
   - `nodes`
   - `tree_state`
   - `tree_relations`
   - `child_candidate_events`
5. 确保 `tree_state` 的单例记录存在

关键异常路径：
- 数据库文件无法打开：直接抛错
- 建表失败：直接抛错
- 不做静默 fallback 到内存 store

验证命令：
- `pnpm typecheck`

### 2. 实现 SQLite 版 NodeStore

文件：
- 新增 [src/persistence/sqlite/node-store.ts](D:/code/Ascend/src/persistence/sqlite/node-store.ts)

变更：
- 实现与现有 `NodeStore` 接口兼容的 SQLite 版本。
- 保持 `createNode / getNodeById / getAllNodes / replaceNode` 外部语义不变。

新增接口与函数：
- `createSqliteNodeStore(client: SqliteClient): NodeStore`
- 内部映射函数：
  - `serializeSceneInput(...)`
  - `serializeRawResult(...)`
  - `deserializeSceneNode(row)`

输入输出：
- 输入：`SqliteClient`
- 输出：`NodeStore`

关键逻辑分支：
1. `createNode(...)`
   - 生成 `id`
   - 序列化 `sceneInput`
   - 初始化 `executionStatus=idle`
   - `rawResult=null`
   - `errorMessage=null`
   - 显式落下 `meta` 字段
2. `replaceNode(...)`
   - 根据 `id` 更新整条节点记录
   - `rawResult` 为空则写 `NULL`
   - `errorMessage` 为空则写 `NULL`
3. `getNodeById(...)`
   - 查不到返回 `null`
4. `getAllNodes(...)`
   - 返回全部节点

关键异常路径：
- `replaceNode(...)` 更新 0 行时，直接抛错
- JSON 序列化或反序列化失败，直接抛错
- 不用默认值掩盖脏数据

验证命令：
- `pnpm typecheck`

### 3. 实现 SQLite 版 TreeStore

文件：
- 新增 [src/persistence/sqlite/tree-store.ts](D:/code/Ascend/src/persistence/sqlite/tree-store.ts)

变更：
- 实现与现有 `TreeStore` 接口兼容的 SQLite 版本。
- 继续保持 `TreeStore` 只处理关系，不返回嵌套树视图。

新增接口与函数：
- `createSqliteTreeStore(client: SqliteClient): TreeStore`
- 内部函数：
  - `buildTreeSnapshot(...)`
  - `getNextChildPosition(parentId)`

输入输出：
- 输入：`SqliteClient`
- 输出：`TreeStore`

关键逻辑分支：
1. `setRoot(nodeId)`
   - 校验当前 `tree_state.root_node_id` 是否为空
   - 更新 `tree_state`
   - 插入 root 对应的 `tree_relations`
2. `attachChild(parentId, childId)`
   - 校验父节点关系存在
   - 校验子节点尚未挂树
   - 计算当前父节点下一个 `position`
   - 插入 child relation
3. `getChildIds(parentId)`
   - 按 `position ASC` 返回
4. `getTreeSnapshot()`
   - 从 `tree_state + tree_relations` 重建当前 `NodeTree`

关键异常路径：
- 重复设置 root：直接抛错
- 重复挂载 child：直接抛错
- 父节点尚未挂树：直接抛错

验证命令：
- `pnpm typecheck`

### 4. 实现候选确认事件落盘

文件：
- 新增 [src/persistence/sqlite/child-candidate-event-store.ts](D:/code/Ascend/src/persistence/sqlite/child-candidate-event-store.ts)
- 修改 [src/child-candidates/flow.ts](D:/code/Ascend/src/child-candidates/flow.ts)

变更：
- 新增专用事件写入层，负责把候选快照与是否选中落入 `child_candidate_events`。
- `processCompletedNodeChildCandidates(...)` 增加事件落盘能力。

新增接口与函数：
- `createSqliteChildCandidateEventStore(client: SqliteClient): ChildCandidateEventStore`
- `ChildCandidateEventStore.recordConfirmationBatch(params): void`

`recordConfirmationBatch(params)` 至少包含：
- `parentNodeId`
- `candidates`
- `selectedCandidateIds`

输入输出：
- 输入：父节点 id、全部候选、已选 candidate id 集合
- 输出：无，出错直接抛错

关键逻辑分支：
1. 提取候选成功后进入人工确认
2. 确认结束后，无论选中几个，都先把全部候选写入事件表
3. 每条事件都必须明确 `selected=0/1`
4. 再按确认顺序创建真实 child node 并挂树

关键异常路径：
- 事件写入失败：直接抛错
- 不允许静默跳过未选中候选的审计记录

说明：
- `processCompletedNodeChildCandidates(...)` 的对外行为保持不变：仍负责提取、确认、创建 child node
- 但内部增加一个新依赖：`candidateEventStore`

验证命令：
- `pnpm typecheck`

### 5. 用事务包住跨表主路径

文件：
- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- 修改 [src/child-candidates/flow.ts](D:/code/Ascend/src/child-candidates/flow.ts)

变更：
- root node 创建改为在一个 SQLite 事务内完成：
  - `nodeStore.createNode(...)`
  - `treeService.createRoot(...)`
- 候选确认后的批量 child node 创建改为在一个 SQLite 事务内完成：
  - 事件表写入
  - selected child node 创建
  - 树关系挂载

关键逻辑分支：
1. 启动时先打开数据库、确保 schema
2. 创建 SQLite 版 `nodeStore / treeStore / candidateEventStore`
3. 若当前还没有 root：
   - 在事务内创建 root node 与 root relation
   - 执行 root scene
   - 候选确认后在事务内批量落盘事件与 child node
4. 若当前已经有 root：
   - 不重复创建 root
   - 直接打印当前 `nodes/tree` 快照，作为“重启后可读”的最小恢复表现

关键异常路径：
- root 事务中任一步失败：整笔失败并抛错
- child 批量创建事务中任一步失败：整笔失败并抛错
- 不回退到内存模式

验证命令：
- `pnpm build`

### 6. 更新入口装配与依赖声明

文件：
- 修改 [package.json](D:/code/Ascend/package.json)
- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)

变更：
- 确保 `better-sqlite3` 在 `package.json` 中有明确依赖声明。
- 入口不再创建内存版 `NodeStore / TreeStore`，改为创建 SQLite 版 store。
- 入口关闭时显式关闭数据库连接。

输入输出：
- 输入：固定数据库路径 `D:\db\sqlite\data\ascend.db`
- 输出：CLI 保持现有输出语义，退出后继续打印 `nodes` 与 `tree` 快照

关键异常路径：
- 数据库初始化失败：顶层抛错，入口 `process.exit(1)`
- 不新增第二套 CLI 入口

验证命令：
- `pnpm build`

### 7. 自动化测试补齐

文件：
- 新增 [src/persistence/sqlite/sqlite-persistence.test.ts](D:/code/Ascend/src/persistence/sqlite/sqlite-persistence.test.ts)
- 修改 [package.json](D:/code/Ascend/package.json)

测试策略：
- 不碰真实生产数据库路径
- 测试中使用临时 SQLite 文件或 `:memory:` 数据库

新增测试覆盖：
1. `ensureSqliteSchema(...)` 能建立 4 张表并初始化 `tree_state`
2. SQLite `NodeStore.createNode(...)` 后，能重新读回同一节点
3. `replaceNode(...)` 后，`executionStatus/rawResult/errorMessage` 能正确持久化
4. SQLite `TreeStore.setRoot(...)` 后，能读回 `rootNodeId`
5. SQLite `TreeStore.attachChild(...)` 后，能按顺序读回 `childrenIds`
6. `processCompletedNodeChildCandidates(...)` 执行后：
   - `child_candidate_events` 有完整事件记录
   - selected/unselected 可区分
   - `nodes` 中新增 child node
   - `tree_relations` 中新增父子关系
7. 模拟“关闭连接再重新打开”后：
   - 既有节点仍可读
   - 根节点仍可读
   - 父子关系仍可读

测试脚本调整：
- 将新测试文件加入 `pnpm test`

验证命令：
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## 公共接口冻结

本次编码后至少形成以下实现接口：

- `createSqliteClient(databasePath)`
- `ensureSqliteSchema(client)`
- `createSqliteNodeStore(client)`
- `createSqliteTreeStore(client)`
- `createSqliteChildCandidateEventStore(client)`

说明：
- 上层继续使用现有 `NodeStore / TreeStore / TreeService`
- 里程碑 1 不新增第二套业务接口

## 人工验收路径

1. 删除或备份现有测试数据库后，执行 `pnpm dev`
2. 若数据库为空：
   - 程序创建 root node
   - 执行 root `advance` scene
   - 候选确认后创建 child node
   - 退出时打印 `nodes/tree` 快照
3. 重新执行 `pnpm dev`
4. 程序应检测到已有 root，不重复创建
5. 程序直接打印已有 `nodes/tree` 快照
6. 到 `D:\db\sqlite\data\ascend.db` 中核对：
   - `nodes`
   - `tree_state`
   - `tree_relations`
   - `child_candidate_events`

## 本次不做

- 不做页面可视化
- 不做总结 Agent
- 不做 ORM
- 不做自动恢复未完成执行现场
- 不做复杂索引优化
- 不改 `advance` 内部 workflow 行为

## 完成标准

- root node 能落盘到 `nodes / tree_state / tree_relations`
- 场景执行状态与 `rawResult` 能落盘到 `nodes`
- 候选确认事件能落盘到 `child_candidate_events`
- child node 与树关系能落盘并在重启后读回
- 第二次启动时不会重复创建 root
- `pnpm test`、`pnpm typecheck`、`pnpm build` 全部通过后，才进入下一步

## 默认假设

- `sceneInput` 与 `rawResult` 在本里程碑中以 JSON 文本持久化
- 当前只有一个 `sceneType="advance"`
- 批量 child node 创建使用单事务处理，不做部分成功回退外的补偿逻辑
- 测试使用临时数据库，不直接写生产数据库路径
