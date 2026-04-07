# 02-plan：候选子节点提取、人工确认与批量创建真实子节点

## 摘要

- 当前基线：仓库里已经有可运行的 `advance` 场景、最小 `NodeStore / TreeStore / TreeService`、以及子节点候选提取与人工确认链路。
- 本次增量只改“人工确认与创建结果”的表达：从“单选一个候选、创建一个 child node”升级为“可一次选择多个候选、批量创建多个 child node 并挂树”。
- 本次不改 `advance` 场景内部 A/B/C 逻辑，不改 `TreeStore` 结构，不做 UI，不做自动确认，不做自动执行新子节点。

## 本次要修改的文件

- 修改 [src/child-candidates/types.ts](D:/code/Ascend/src/child-candidates/types.ts)
- 修改 [src/child-candidates/confirmation.ts](D:/code/Ascend/src/child-candidates/confirmation.ts)
- 修改 [src/child-candidates/flow.ts](D:/code/Ascend/src/child-candidates/flow.ts)
- 修改 [src/child-candidates/child-candidate.test.ts](D:/code/Ascend/src/child-candidates/child-candidate.test.ts)
- 修改 [tasks/active/02-plan.md](D:/code/Ascend/tasks/active/02-plan.md)
- 修改 [tasks/active/checklist.md](D:/code/Ascend/tasks/active/checklist.md)
- 修改或新增 [tasks/active/05-review.md](D:/code/Ascend/tasks/active/05-review.md)

## 本次不修改的范围

- 不修改 [src/index.ts](D:/code/Ascend/src/index.ts) 的主时序
- 不修改 [src/node-tree/types.ts](D:/code/Ascend/src/node-tree/types.ts)
- 不修改 [src/node-tree/node-store.ts](D:/code/Ascend/src/node-tree/node-store.ts)
- 不修改 [src/node-tree/create-child-node-from-candidate.ts](D:/code/Ascend/src/node-tree/create-child-node-from-candidate.ts)
- 不修改 [src/workflows/advance/graph.ts](D:/code/Ascend/src/workflows/advance/graph.ts)
- 不修改 [src/workflows/advance/nodes.ts](D:/code/Ascend/src/workflows/advance/nodes.ts)
- 不修改 [src/workflows/advance/prompts.ts](D:/code/Ascend/src/workflows/advance/prompts.ts)
- 不做 UI
- 不做自动确认
- 不做自动执行新子节点
- 不做复杂树操作
- 不扩展第二种 `sceneType`

## 实现步骤

### 1. 调整候选确认结果类型

文件：
- 修改 [src/child-candidates/types.ts](D:/code/Ascend/src/child-candidates/types.ts)

变更：
- 将 `ChildCandidateSelectionResult` 从“单个 `ChildCandidate | null`”改为“`ChildCandidate[]`”。
- 约定：
  - 空数组 `[]` 表示拒绝全部或没有候选
  - 非空数组表示本轮确认通过的全部候选

输入输出：
- 输入：无
- 输出：供确认层和后处理流共享的新选择结果类型

关键分支与异常：
- 不再返回 `null`
- 不用默认值掩盖非法输入；非法输入仍由确认层显式提示并重试

验证命令：
- `pnpm typecheck`

### 2. 将 CLI 确认从单选升级为多选

文件：
- 修改 [src/child-candidates/confirmation.ts](D:/code/Ascend/src/child-candidates/confirmation.ts)

变更：
- `confirmChildCandidate(...)` 改为 `confirmChildCandidates(...)`
- 返回值改为 `Promise<ChildCandidateSelectionResult>`，即 `Promise<ChildCandidate[]>`
- `formatChildCandidateList(...)` 的提示文案改成明确支持多选
- 允许用户输入：
  - `0` 或 `none`：拒绝全部，返回 `[]`
  - `1,3`、`1 3`、`1, 3 5` 这类编号组合：确认多个候选

输入输出：
- 输入：`ChildCandidate[]`、`ConfirmationIO`
- 输出：确认通过的候选数组，或空数组

关键逻辑分支：
1. 候选为空时直接返回 `[]`
2. 输入 `0/none` 时返回 `[]`
3. 输入多个编号时：
   - 解析为编号数组
   - 校验每个编号都在 `1..N`
   - 去重但保持用户输入顺序
   - 返回对应候选数组
4. 非法输入时继续提示

关键异常路径：
- 非数字、越界编号、混入非法字符时直接提示重输
- 不接受静默跳过非法编号

验证命令：
- `pnpm typecheck`

### 3. 将后处理流升级为批量创建子节点

文件：
- 修改 [src/child-candidates/flow.ts](D:/code/Ascend/src/child-candidates/flow.ts)

变更：
- `processCompletedNodeChildCandidates(...)` 的返回值从 `Promise<SceneNode | null>` 改为 `Promise<SceneNode[]>`
- 提取候选后进入多选确认
- 对确认通过的每个候选逐个调用 `createChildNodeFromCandidate(...)`
- 按确认顺序返回创建出的 `SceneNode[]`

输入输出：
- 输入：`parentNodeId`、`nodeStore`、`treeService`、`model`、`io`
- 输出：创建成功的真实子节点数组；若无候选或用户拒绝则返回 `[]`

关键逻辑分支：
1. 父节点不存在：直接抛错
2. 父节点没有 `rawResult`：直接抛错
3. 候选为空：返回 `[]`
4. 人工拒绝全部：返回 `[]`
5. 人工确认多个候选：逐个创建 child node 并挂树

关键异常路径：
- 单个候选创建失败时直接抛错，不伪造成部分成功总结
- 本次不做事务回滚；若前几个已创建、后一个失败，保持真实执行痕迹并抛错

验证命令：
- `pnpm typecheck`

### 4. 测试补齐并锁定多选语义

文件：
- 修改 [src/child-candidates/child-candidate.test.ts](D:/code/Ascend/src/child-candidates/child-candidate.test.ts)

变更：
- 保留原有提取与字段校验测试
- 将确认测试从单选扩展为多选
- 将后处理流测试从“最多创建一个 child node”扩展为“可创建多个 child node”

必测场景：
1. `0/none` 返回空数组
2. `1,3` 可同时确认多个候选
3. `1 3 3` 会去重并按输入顺序返回
4. 非法输入会继续提示
5. 人工拒绝时不创建任何新节点
6. 人工多选时按顺序批量创建多个 child node
7. 批量创建后：
   - `NodeStore` 中新增多个节点
   - 每个节点的 `meta` 保留对应候选语义
   - `TreeStore` 中父节点的 `childrenIds` 顺序与确认顺序一致

验证命令：
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## 公共接口冻结

本次编码后至少形成以下实现接口：
- `confirmChildCandidates(...)`
- `processCompletedNodeChildCandidates(...): Promise<SceneNode[]>`

说明：
- `createChildNodeFromCandidate(...)` 保持单个候选 -> 单个节点的职责不变
- “批量”能力放在确认层与后处理流层，不塞进底层建节点函数

## 人工验收路径

1. `pnpm dev`
2. 程序启动后执行 root `advance` node
3. 场景结束后系统提取候选子节点
4. CLI 展示候选列表，并提示可输入多个编号
5. 用户输入如 `1,3`
6. 程序创建多个 child node，并把它们都挂到同一个父节点下
7. 程序最后打印 `nodes` 与 `tree` 快照，人工核对多个 child node 是否都存在且关系正确

## 本次不做

- 不支持编辑候选文案后再创建
- 不支持自动执行新建子节点
- 不支持自动递归生成孙节点
- 不支持第二种 `sceneType`
- 不支持持久化恢复
- 不支持复杂树操作
- 不修改 `advance` 内部 workflow 行为

## 完成标准

- 候选确认支持一次选择多个候选
- 确认后能批量创建多个真实子节点
- `childrenIds` 能按确认顺序挂到父节点下
- `pnpm test`、`pnpm typecheck`、`pnpm build` 全部通过
- [tasks/active/checklist.md](D:/code/Ascend/tasks/active/checklist.md) 与 [tasks/active/05-review.md](D:/code/Ascend/tasks/active/05-review.md) 已同步更新

## 默认假设

- v1 的多选确认仍采用 CLI 文本交互
- 用户输入顺序就是子节点创建顺序和挂树顺序
- 批量创建过程中不做事务回滚
