# 02-plan：推进场景节点化与最小树承载实现计划

## 摘要

- 当前基线：`src/workflows/advance/` 已经有可运行的“推进场景”工作流，能够在结束时返回原始结果。
- 本次实现不改推进场景内部 A/B/C 逻辑，只在其外层新增 `Node / Tree` 承载层。
- 本次里程碑只做 3 件事：
  - 把 `advance` 封装成可被 `Node` 调用的独立场景执行单元
  - 增加 `executeSceneNode(...)`，固定节点最小时序
  - 增加 `TreeStore + TreeService`，实现最小父子树承载
- 本次不做持久化、不做 UI、不做自动派生子节点、不做复杂树操作、不做多场景扩展。

## 本次要修改的文件

- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- 修改 [package.json](D:/code/Ascend/package.json)
- 修改 [src/workflows/advance/nodes.ts](D:/code/Ascend/src/workflows/advance/nodes.ts)
- 修改 [src/workflows/advance/workflow.test.ts](D:/code/Ascend/src/workflows/advance/workflow.test.ts)
- 修改 [tasks/active/checklist.md](D:/code/Ascend/tasks/active/checklist.md)
- 新增或修改 [tasks/active/05-review.md](D:/code/Ascend/tasks/active/05-review.md)
- 新增 [src/workflows/advance/scene.ts](D:/code/Ascend/src/workflows/advance/scene.ts)
- 新增 [src/node-tree/types.ts](D:/code/Ascend/src/node-tree/types.ts)
- 新增 [src/node-tree/node-store.ts](D:/code/Ascend/src/node-tree/node-store.ts)
- 新增 [src/node-tree/tree-store.ts](D:/code/Ascend/src/node-tree/tree-store.ts)
- 新增 [src/node-tree/tree-service.ts](D:/code/Ascend/src/node-tree/tree-service.ts)
- 新增 [src/node-tree/execute-scene-node.ts](D:/code/Ascend/src/node-tree/execute-scene-node.ts)
- 新增 [src/node-tree/node-tree.test.ts](D:/code/Ascend/src/node-tree/node-tree.test.ts)

## 本次不修改的范围

- 不修改 [src/workflows/advance/graph.ts](D:/code/Ascend/src/workflows/advance/graph.ts) 的路由规则
- 不修改 [src/workflows/advance/prompts.ts](D:/code/Ascend/src/workflows/advance/prompts.ts) 的提示词契约
- 不新增 UI、数据库、HTTP API
- 不实现节点移动、删除子树、重排、回扫祖先、图关系
- 不实现确认退出后的总结、派生节点建议、自动路由

## 实现步骤

### 0. 增量调整：退出后快照输出与本地 normalizeInput

文件：
- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- 修改 [src/workflows/advance/nodes.ts](D:/code/Ascend/src/workflows/advance/nodes.ts)
- 修改 [src/workflows/advance/workflow.test.ts](D:/code/Ascend/src/workflows/advance/workflow.test.ts)
- 修改 [src/node-tree/types.ts](D:/code/Ascend/src/node-tree/types.ts)
- 修改 [src/node-tree/node-store.ts](D:/code/Ascend/src/node-tree/node-store.ts)
- 修改 [src/node-tree/tree-store.ts](D:/code/Ascend/src/node-tree/tree-store.ts)
- 修改 [src/node-tree/node-tree.test.ts](D:/code/Ascend/src/node-tree/node-tree.test.ts)

变更：
- 为 `NodeStore` 增加“读取全部节点快照”的只读接口，供退出后打印当前节点状态。
- 为 `TreeStore` 增加“读取整棵树快照”的只读接口，供退出后打印父子关系。
- `src/index.ts` 在 root node 执行结束后打印：
  - 当前 node 快照
  - 当前 tree 快照
- `normalizeInputNode` 不再调用模型接口，只做本地字符串处理：
  - 先对 `rawInput` 做头尾空白裁剪
  - 若裁剪后为空则返回 `EMPTY`
  - 若裁剪后非空则直接作为 `normalizedQuery`
- `recognizeIntentNode` 继续调用 AI 接口完成 `confirm / reject` 判断，不在本次增量中本地化
- 相关自动化测试改为覆盖“normalize 不调用模型”和“退出后可读出 node/tree 快照”。

关键分支与异常：
- `normalizeInputNode` 不再依赖模型调用结果，因此相关轮次的模型调用次数应整体减少 1。
- `recognizeIntentNode` 仍要求 `lastAssistantOutput` 非空，且模型输出必须严格是 `confirm / reject`，否则直接抛错。
- 快照接口只读，不承担业务改写职责。

验证命令：
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

### 1. 把 advance 封装成可挂载场景执行单元

文件：

- 新增 [src/workflows/advance/scene.ts](D:/code/Ascend/src/workflows/advance/scene.ts)

新增接口与函数：

- `AdvanceSceneStartInput = Record<string, never>`
- `AdvanceSceneRuntime = { model: WorkflowModel; io?: CliIO }`
- `AdvanceSceneRawResult = HandoffRecord`
- `executeAdvanceScene(input: AdvanceSceneStartInput, runtime: AdvanceSceneRuntime): Promise<AdvanceSceneRawResult>`

输入输出：

- 输入：
  - `input`：v1 固定为空对象，表示当前 `advance` 场景启动不需要额外持久参数
  - `runtime.model`：现有 `WorkflowModel`
  - `runtime.io`：可选 CLI IO，未传时沿用当前控制台 IO
- 输出：
  - 直接返回当前 `advance` 工作流结束时的原始结果，即 `HandoffRecord`

关键逻辑：

- `scene.ts` 只做组装：
  - 创建 `advance` graph
  - 调用现有 `runAdvanceCli(graph, io?)`
  - 原样返回场景原始结果
- 不在 `scene.ts` 做任何 Node 状态更新、Tree 关系写入或结果重组

关键分支与异常：

- `input` 在 v1 不参与业务决策，不做伪默认值扩写
- `runAdvanceCli(...)` 抛错时，错误直接向上抛出
- `scene.ts` 不调用 `process.exit(1)`

验证命令：

- `pnpm typecheck`

### 2. 定义 Node / Tree 最小类型与内存存储

文件：

- 新增 [src/node-tree/types.ts](D:/code/Ascend/src/node-tree/types.ts)
- 新增 [src/node-tree/node-store.ts](D:/code/Ascend/src/node-tree/node-store.ts)
- 新增 [src/node-tree/tree-store.ts](D:/code/Ascend/src/node-tree/tree-store.ts)

新增类型：

- `NodeId = string`
- `SceneType = "advance"`
- `NodeExecutionStatus = "idle" | "running" | "completed" | "failed"`
- `SceneNode`
- `TreeRelation`
- `NodeTree`
- `NodeStore`
- `TreeStore`

实现选择：

- `NodeStore` 用内存 `Map<NodeId, SceneNode>` 承载节点内容
- `TreeStore` 用 `NodeTree` 对象承载纯关系索引
- `createNode(...)` 用 `randomUUID()` 生成 `NodeId`

NodeStore 接口：

- `createNode(sceneType: SceneType, sceneInput: AdvanceSceneStartInput): SceneNode`
- `getNodeById(nodeId: NodeId): SceneNode | null`
- `replaceNode(node: SceneNode): void`

TreeStore 接口：

- `createEmptyTree(): NodeTree`
- `getRootNodeId(): NodeId | null`
- `getRelation(nodeId: NodeId): TreeRelation | null`
- `setRoot(nodeId: NodeId): void`
- `attachChild(parentId: NodeId, childId: NodeId): void`
- `getChildIds(parentId: NodeId): NodeId[]`

输入输出：

- `createNode(...)` 输入场景类型和场景启动输入，输出初始化后的 `SceneNode`
- `getNodeById(...)` 输入 `nodeId`，输出节点或 `null`
- `TreeStore` 只输入/输出关系数据，不输出完整节点对象

关键分支与异常：

- `createNode(...)` 创建出的节点固定为：
  - `executionStatus = "idle"`
  - `rawResult = null`
  - `errorMessage = null`
- `setRoot(...)` 在非空树上再次调用必须抛错
- `attachChild(...)` 若子节点已存在父节点必须抛错
- `TreeStore` 不负责校验节点内容是否存在；这类校验交给 `TreeService`

验证命令：

- `pnpm typecheck`

### 3. 实现 TreeService 与节点执行器

文件：

- 新增 [src/node-tree/tree-service.ts](D:/code/Ascend/src/node-tree/tree-service.ts)
- 新增 [src/node-tree/execute-scene-node.ts](D:/code/Ascend/src/node-tree/execute-scene-node.ts)

新增接口与函数：

- `createTreeService(nodeStore: NodeStore, treeStore: TreeStore)`
- `treeService.createRoot(nodeId: NodeId): void`
- `treeService.createChild(parentId: NodeId, childId: NodeId): void`
- `treeService.getChildren(parentId: NodeId): SceneNode[]`
- `SceneExecutorRegistry = { advance: typeof executeAdvanceScene }`
- `executeSceneNode(nodeId: NodeId, deps: ExecuteSceneNodeDeps): Promise<AdvanceSceneRawResult>`

`ExecuteSceneNodeDeps` 至少包含：

- `nodeStore`
- `executors`
- `runtime`

输入输出：

- `createRoot(nodeId)`：
  - 输入已存在节点 id
  - 输出无返回值，只写根关系
- `createChild(parentId, childId)`：
  - 输入父节点 id 与已存在子节点 id
  - 输出无返回值，只写父子关系
- `getChildren(parentId)`：
  - 输入父节点 id
  - 输出直接子节点对象数组
- `executeSceneNode(nodeId, deps)`：
  - 输入待执行节点 id、节点存储、场景执行器注册表和运行时依赖
  - 输出该节点承载场景的原始结果

关键逻辑：

- `TreeService` 先校验节点存在，再调用 `TreeStore`
- `getChildren(...)` 固定走两步：
  - `TreeStore.getChildIds(parentId)`
  - `NodeStore.getNodeById(childId)` 逐个取回节点对象
- `executeSceneNode(...)` 固定遵守最小时序：
  1. 进入节点：读取节点并校验
  2. 写 `executionStatus = "running"`
  3. 调用对应场景执行器
  4. 成功后写入 `rawResult`
  5. 写 `executionStatus = "completed"`，清空 `errorMessage`
  6. 返回原始结果

关键分支与异常：

- 若 `nodeId` 不存在：直接抛错
- 若 `sceneType` 不在注册表中：直接抛错
- 若节点当前状态不是 `idle`：直接抛错
- 若场景执行器抛错：
  - 写 `executionStatus = "failed"`
  - 写 `errorMessage`
  - `rawResult` 保持 `null`
  - 错误继续向上抛出
- `getChildren(...)` 发现关系里引用了不存在的节点时直接抛错，不做静默跳过

验证命令：

- `pnpm typecheck`

### 4. 用 Node 入口替换直接跑 advance workflow 的入口

文件：

- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)

改动目标：

- 当前入口是“直接创建 model + graph + CLI”
- 改为“创建 NodeStore / TreeStore / TreeService / advance root node，再通过 `executeSceneNode(...)` 执行 root node”

主路径：

1. 创建 `WorkflowModel`
2. 创建 `NodeStore`
3. 创建 `TreeStore`
4. 创建 `TreeService`
5. 创建一个 `sceneType="advance"` 的 root node，`sceneInput = {}`
6. `treeService.createRoot(rootNode.id)`
7. 调用 `executeSceneNode(rootNode.id, ...)`

输入输出：

- 输入：现有 `.env`、控制台 IO、DeepSeek model
- 输出：沿用现有 CLI 输出；当场景结束时，由 `advance` 工作流自己打印 handoff 摘要

关键分支与异常：

- `index.ts` 仍然是唯一允许 `process.exit(1)` 的地方
- `index.ts` 不直接读写节点状态字段，只负责装配依赖与启动 root node
- 不在入口里提前创建子节点；本批只证明 root node 能承载场景

验证命令：

- `pnpm build`

### 5. 补 Node / Tree 测试并保留现有 advance 工作流测试

文件：

- 修改 [package.json](D:/code/Ascend/package.json)
- 新增 [src/node-tree/node-tree.test.ts](D:/code/Ascend/src/node-tree/node-tree.test.ts)

测试脚本调整：

- `test` 脚本改为同时运行：
  - `src/workflows/advance/workflow.test.ts`
  - `src/node-tree/node-tree.test.ts`

建议命令：

```json
"test": "node --import tsx --test src/workflows/advance/workflow.test.ts src/node-tree/node-tree.test.ts"
```

`node-tree.test.ts` 必测场景：

1. `createNode(...)` 返回的节点初始状态正确
2. `getNodeById(...)` 能读到节点，未命中返回 `null`
3. `createRoot(...)` 成功写入根关系；重复创建根失败
4. `createChild(...)` 成功挂载子节点；重复父节点或节点缺失时报错
5. `getChildren(...)` 只返回直接子节点，不返回孙节点
6. `executeSceneNode(...)` 成功路径：
   - 返回值就是场景原始结果
   - 节点状态从 `idle -> running -> completed`
   - `rawResult` 被写入
7. `executeSceneNode(...)` 失败路径：
   - 状态变为 `failed`
   - `errorMessage` 被写入
   - 错误继续抛出
8. `executeSceneNode(...)` 不允许对 `completed` 或 `failed` 节点重复执行

测试实现策略：

- Node / Tree 单元测试优先使用 fake scene executor，不依赖真实网络
- 如补一条轻量集成测试，则使用假 `CliIO` + stub `WorkflowModel` 跑真实 `executeAdvanceScene(...)`
- 不新增真实 DeepSeek 联网测试

验证命令：

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## 公共接口冻结

本次编码后至少形成以下实现接口：

- `executeAdvanceScene(...)`
- `createNode(...)`
- `getNodeById(...)`
- `createRoot(...)`
- `createChild(...)`
- `getChildren(...)`
- `executeSceneNode(...)`

## 人工验收路径

1. `pnpm dev`
2. 程序启动后，实际是先创建一个 root `advance` node
3. 进入该 node 后，运行现有推进场景 CLI
4. 用户完成场景后，节点拿到场景原始结果并结束
5. 若后续在代码里读取该 root node，应能看到：
   - `executionStatus = completed`
   - `rawResult` 已写入

## 本次不做

- 不支持 `advance` 之外的第二种 `sceneType`
- 不支持节点重跑
- 不支持子节点自动创建
- 不支持树持久化
- 不支持树删除、移动、重排
- 不支持根据场景结果自动派生新节点
- 不修改 `advance` 内部 workflow 行为
- 不在本里程碑中变更 `docs/architecture/*.md`

## 完成标准

- `advance` 已被封装成一个 Node 可调用的独立场景执行单元
- 存在明确的 `executeSceneNode(...)`，且时序符合 spec
- 存在最小 `NodeStore / TreeStore / TreeService`
- 能创建 root node，能挂子节点，能按父节点取直接子节点
- 入口已经通过 root node 执行 `advance`
- `pnpm test`、`pnpm typecheck`、`pnpm build` 全部通过后，才进入实现阶段
- [tasks/active/checklist.md](D:/code/Ascend/tasks/active/checklist.md) 与 [tasks/active/05-review.md](D:/code/Ascend/tasks/active/05-review.md) 已同步更新

## 默认假设

- v1 的 `advance` 场景启动输入固定为空对象 `{}`，因为当前交互真正发生在 CLI 内部
- v1 实现层会把 `rawResult` 具体落成现有 `HandoffRecord`，但这是实现选择，不再回写到 spec 层
- `TreeService.getChildren(...)` 返回节点对象集合；`TreeStore` 只保留 `childrenIds`
