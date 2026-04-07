# checklist：候选子节点提取、人工确认与批量创建真实子节点

## 当前阶段

- 已完成 `00-task.md`
- 已完成 `01-spec.md`
- 已完成 `02-plan.md`
- 当前进度：多选批量挂树已实现并完成验证

## 本次里程碑目标

- [x] 候选确认支持一次选择多个候选
- [x] 多个候选可批量创建为真实子节点
- [x] 多个真实子节点能按确认顺序挂到父节点下

## 文件清单

- [x] 修改 [src/child-candidates/types.ts](D:/code/Ascend/src/child-candidates/types.ts)
- [x] 修改 [src/child-candidates/confirmation.ts](D:/code/Ascend/src/child-candidates/confirmation.ts)
- [x] 修改 [src/child-candidates/flow.ts](D:/code/Ascend/src/child-candidates/flow.ts)
- [x] 修改 [src/child-candidates/child-candidate.test.ts](D:/code/Ascend/src/child-candidates/child-candidate.test.ts)
- [x] 修改 [tasks/active/02-plan.md](D:/code/Ascend/tasks/active/02-plan.md)
- [x] 修改 [tasks/active/checklist.md](D:/code/Ascend/tasks/active/checklist.md)
- [x] 修改 [tasks/active/05-review.md](D:/code/Ascend/tasks/active/05-review.md)

## 实现检查项

### 1. 多选确认
- [x] `ChildCandidateSelectionResult` 改为数组结果
- [x] `confirmChildCandidates(...)` 支持一次输入多个编号
- [x] 支持 `0/none` 拒绝全部
- [x] 支持 `1,3` 与 `1 3` 这类多选输入
- [x] 输入重复编号时去重但保持顺序
- [x] 非法输入会继续提示

### 2. 批量创建子节点
- [x] `processCompletedNodeChildCandidates(...)` 返回 `SceneNode[]`
- [x] 候选为空时返回 `[]`
- [x] 人工拒绝时返回 `[]`
- [x] 人工确认多个候选时逐个创建 child node
- [x] `childrenIds` 顺序与确认顺序一致

### 3. 测试补齐
- [x] 更新 `child-candidate.test.ts` 覆盖多选输入
- [x] 覆盖重复编号去重
- [x] 覆盖批量创建多个 child node
- [x] 覆盖拒绝全部仍不创建任何节点

## 范围检查

- [x] 不修改 [src/index.ts](D:/code/Ascend/src/index.ts) 的主时序
- [x] 不修改 [src/node-tree/types.ts](D:/code/Ascend/src/node-tree/types.ts)
- [x] 不修改 [src/node-tree/node-store.ts](D:/code/Ascend/src/node-tree/node-store.ts)
- [x] 不修改 [src/node-tree/create-child-node-from-candidate.ts](D:/code/Ascend/src/node-tree/create-child-node-from-candidate.ts)
- [x] 不修改 [src/workflows/advance/graph.ts](D:/code/Ascend/src/workflows/advance/graph.ts)
- [x] 不修改 [src/workflows/advance/nodes.ts](D:/code/Ascend/src/workflows/advance/nodes.ts)
- [x] 不做 UI
- [x] 不做自动确认
- [x] 不做自动执行新子节点
- [x] 不做复杂树操作

## 验证清单

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test`
- [ ] 人工执行 `pnpm dev`，确认多选与批量挂树行为正确

## 完成后必须更新

- [x] 更新 [tasks/active/checklist.md](D:/code/Ascend/tasks/active/checklist.md) 勾选状态
- [x] 更新 [tasks/active/05-review.md](D:/code/Ascend/tasks/active/05-review.md)
