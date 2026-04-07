# 05-review：候选子节点提取、人工确认与批量创建真实子节点

## 结论

本轮增量已完成。

系统现在支持：
- 从父节点原始对话中提取候选子节点
- CLI 一次选择多个候选
- 按用户确认顺序批量创建多个真实 child node
- 将多个 child node 依次挂到同一个父节点下

## 本轮变更

### 1. 确认结果从单个候选升级为数组

修改：
- [src/child-candidates/types.ts](D:/code/Ascend/src/child-candidates/types.ts)

结果：
- `ChildCandidateSelectionResult` 现在是 `ChildCandidate[]`
- 空数组 `[]` 统一表示“没有确认任何候选”

### 2. CLI 确认从单选升级为多选

修改：
- [src/child-candidates/confirmation.ts](D:/code/Ascend/src/child-candidates/confirmation.ts)

结果：
- `confirmChildCandidates(...)` 支持一次输入多个编号
- 支持 `1,3`、`1 3` 等格式
- 支持 `0` / `none` 拒绝全部
- 重复编号会去重，但保持输入顺序
- 非法输入会继续提示，不会静默跳过

### 3. 后处理流升级为批量建子节点

修改：
- [src/child-candidates/flow.ts](D:/code/Ascend/src/child-candidates/flow.ts)

结果：
- `processCompletedNodeChildCandidates(...)` 现在返回 `SceneNode[]`
- 人工多选后会逐个调用 `createChildNodeFromCandidate(...)`
- `childrenIds` 的写入顺序与用户确认顺序一致

### 4. 测试更新

修改：
- [src/child-candidates/child-candidate.test.ts](D:/code/Ascend/src/child-candidates/child-candidate.test.ts)

覆盖新增：
- 多编号输入
- 重复编号去重
- 拒绝全部返回空数组
- 批量创建多个 child node
- 父节点 `childrenIds` 顺序与确认顺序一致

## 验证结果

已通过：
- `pnpm typecheck`
- `pnpm build`
- `pnpm test`

当前自动化测试总数：35 条，全部通过。

## 本次不变的部分

以下部分本轮未改：
- [src/index.ts](D:/code/Ascend/src/index.ts) 主时序
- [src/node-tree/types.ts](D:/code/Ascend/src/node-tree/types.ts)
- [src/node-tree/node-store.ts](D:/code/Ascend/src/node-tree/node-store.ts)
- [src/node-tree/create-child-node-from-candidate.ts](D:/code/Ascend/src/node-tree/create-child-node-from-candidate.ts)
- `advance` 场景内部 workflow
- 自动执行新建子节点
- UI 与复杂树操作

## 残余风险

- 真实 `pnpm dev` 联调还没跑，所以多选确认的终端体验还需要人工验证
- 本轮批量创建不做事务回滚；如果批量创建到中途失败，会保留已创建成功的前序子节点，并直接抛错
