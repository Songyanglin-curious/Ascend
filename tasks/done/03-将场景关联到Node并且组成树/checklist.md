# checklist：推进场景节点化与最小树承载

## 当前阶段

- 已完成 `00-task.md`
- 已完成 `01-spec.md`
- 已完成 `02-plan.md`
- 当前进入：本里程碑已实现并完成自动化验证

## 本次里程碑目标

- 将“推进场景”封装为可挂载到 `Node` 的独立执行单元
- 固定 `Node` 的最小时序：`进入节点 -> 执行推进场景 -> 返回场景原始结果 -> 节点结束`
- 建立最小 `Tree` 承载能力，使多个 `Node` 能以父子关系组织

## 文件清单

- [x] 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- [x] 修改 [package.json](D:/code/Ascend/package.json)
- [x] 新增 [src/workflows/advance/scene.ts](D:/code/Ascend/src/workflows/advance/scene.ts)
- [x] 新增 [src/node-tree/types.ts](D:/code/Ascend/src/node-tree/types.ts)
- [x] 新增 [src/node-tree/node-store.ts](D:/code/Ascend/src/node-tree/node-store.ts)
- [x] 新增 [src/node-tree/tree-store.ts](D:/code/Ascend/src/node-tree/tree-store.ts)
- [x] 新增 [src/node-tree/tree-service.ts](D:/code/Ascend/src/node-tree/tree-service.ts)
- [x] 新增 [src/node-tree/execute-scene-node.ts](D:/code/Ascend/src/node-tree/execute-scene-node.ts)
- [x] 新增 [src/node-tree/node-tree.test.ts](D:/code/Ascend/src/node-tree/node-tree.test.ts)

## 实现检查项

### 0. 增量调整

- [x] `normalizeInputNode` 改为本地 `trim` 归一化
- [x] 空白输入直接落为 `EMPTY`
- [x] `normalizeInputNode` 不再消耗模型调用
- [x] `recognizeIntentNode` 继续通过 AI 判断 `confirm / reject`
- [x] 场景退出后打印当前 `Node` 与 `Tree` 快照
- [x] 快照输出只用于调试与人工验收，不作为长期契约

### 1. advance 场景封装

- [x] 定义 `AdvanceSceneStartInput = Record<string, never>`
- [x] 定义 `AdvanceSceneRuntime = { model: WorkflowModel; io?: CliIO }`
- [x] 定义 `AdvanceSceneRawResult = HandoffRecord`
- [x] 实现 `executeAdvanceScene(input, runtime)`
- [x] `scene.ts` 只负责组装 graph 与 CLI，不写 `Node` 状态，不写 `Tree` 关系
- [x] `scene.ts` 保持“原样返回场景原始结果”

### 2. Node / Tree 类型与存储

- [x] 定义 `NodeId`
- [x] 定义 `SceneType = "advance"`
- [x] 定义 `NodeExecutionStatus = "idle" | "running" | "completed" | "failed"`
- [x] 定义 `SceneNode`
- [x] 定义 `TreeRelation`
- [x] 定义 `NodeTree`
- [x] 实现 `NodeStore`
- [x] 实现 `TreeStore`
- [x] `createNode(...)` 创建出的节点默认满足：
- [x] `executionStatus = "idle"`
- [x] `rawResult = null`
- [x] `errorMessage = null`
- [x] `TreeStore` 只承载 `rootNodeId / parentId / childrenIds`

### 3. TreeService 与节点执行器

- [x] 实现 `createTreeService(nodeStore, treeStore)`
- [x] 实现 `treeService.createRoot(nodeId)`
- [x] 实现 `treeService.createChild(parentId, childId)`
- [x] 实现 `treeService.getChildren(parentId): SceneNode[]`
- [x] 定义 `SceneExecutorRegistry`
- [x] 实现 `executeSceneNode(nodeId, deps)`
- [x] `executeSceneNode(...)` 只允许执行 `idle` 节点
- [x] `executeSceneNode(...)` 成功路径满足：
- [x] `idle -> running -> completed`
- [x] 返回值就是场景原始结果
- [x] `rawResult` 被原样写回节点
- [x] `errorMessage` 被清空
- [x] `executeSceneNode(...)` 失败路径满足：
- [x] `executionStatus = "failed"`
- [x] `rawResult = null`
- [x] `errorMessage` 被写入
- [x] 错误继续向上抛出

### 4. 入口替换

- [x] `src/index.ts` 不再直接执行 `advance graph + CLI`
- [x] 入口改为创建 `NodeStore / TreeStore / TreeService`
- [x] 入口创建一个 `sceneType="advance"` 的 root node
- [x] 调用 `treeService.createRoot(rootNode.id)`
- [x] 通过 `executeSceneNode(rootNode.id, ...)` 执行 root node
- [x] `process.exit(1)` 仍只保留在 `src/index.ts`

### 5. 测试补齐

- [x] 调整 `package.json` 的 `test` 脚本，同时运行：
- [x] `src/workflows/advance/workflow.test.ts`
- [x] `src/node-tree/node-tree.test.ts`
- [x] 为 `createNode(...)` 补测试
- [x] 为 `getNodeById(...)` 补测试
- [x] 为 `createRoot(...)` 补测试
- [x] 为 `createChild(...)` 补测试
- [x] 为 `getChildren(...)` 补测试
- [x] 为 `executeSceneNode(...)` 成功路径补测试
- [x] 为 `executeSceneNode(...)` 失败路径补测试
- [x] 为“禁止重复执行 completed / failed 节点”补测试

## 范围检查

- [x] 不修改 [src/workflows/advance/graph.ts](D:/code/Ascend/src/workflows/advance/graph.ts) 的路由规则
- [x] 不修改 [src/workflows/advance/nodes.ts](D:/code/Ascend/src/workflows/advance/nodes.ts) 的业务职责
- [x] 不修改 [src/workflows/advance/prompts.ts](D:/code/Ascend/src/workflows/advance/prompts.ts) 的提示词契约
- [x] 不扩展第二种 `sceneType`
- [x] 不实现持久化
- [x] 不实现 UI
- [x] 不实现复杂树操作
- [x] 不实现确认退出后的下游总结或自动派生节点

## 验证清单

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test`
- [ ] 人工执行 `pnpm dev`，确认 root node 能承载并执行 `advance`

## 完成后必须更新

- [x] 更新 [tasks/active/checklist.md](D:/code/Ascend/tasks/active/checklist.md) 勾选状态
- [x] 新增或更新 [tasks/active/05-review.md](D:/code/Ascend/tasks/active/05-review.md)
- [x] 若实现改变全局设计，再评估是否需要更新 `docs/architecture/*.md`
