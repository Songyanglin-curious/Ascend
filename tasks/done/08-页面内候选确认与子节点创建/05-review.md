# 05-review：页面内候选确认与子节点创建

## 结论

本里程碑已完成编码与自动化验证。

当前页面能力从“只读树图 + 只读聊天历史”推进到了：
- 可按当前选中父节点读取候选子节点
- 可在页面内多选候选并提交确认
- 可通过本地 API 触发真实 child node 创建与挂树
- 确认成功后重新读取 read model 刷新树图，并保持当前父节点仍为选中状态

## 本次实现

### 后端

新增或修改：
- [candidate-types.ts](/D:/code/Ascend/src/read-model/candidate-types.ts)
- [candidate-service.ts](/D:/code/Ascend/src/read-model/candidate-service.ts)
- [candidate-actions.ts](/D:/code/Ascend/src/web-api/candidate-actions.ts)
- [server.ts](/D:/code/Ascend/src/web-api/server.ts)

落实内容：
- 新增候选读模型与候选确认结果类型。
- `loadNodeCandidates(...)` 可按父节点读取候选；父节点不存在直接失败；无 `rawResult` 返回空数组。
- 候选读取与候选确认共用稳定 `candidateId` 规则，不再依赖提取器的随机 UUID。
- `confirmNodeCandidatesAction(...)` 复用现有候选提取、事件记录、child node 创建与挂树语义。
- 新增页面 API：
  - `GET /api/node-candidates?parentNodeId=...`
  - `POST /api/node-candidates/confirm`

### 前端

新增或修改：
- [App.tsx](/D:/code/Ascend/web/src/app/App.tsx)
- [app.css](/D:/code/Ascend/web/src/app/app.css)
- [PageShell.tsx](/D:/code/Ascend/web/src/modules/layout/PageShell.tsx)
- [api.ts](/D:/code/Ascend/web/src/modules/data/api.ts)
- [types.ts](/D:/code/Ascend/web/src/modules/data/types.ts)
- [mappers.ts](/D:/code/Ascend/web/src/modules/data/mappers.ts)
- [CandidatePanel.tsx](/D:/code/Ascend/web/src/modules/candidates/CandidatePanel.tsx)

落实内容：
- 页面容器增加候选读取状态与候选提交状态。
- 页面默认 root 选中时，会自动拉取 root 候选。
- 切换树节点时，候选区随当前节点变化。
- 新增独立 `CandidatePanel` 模块，支持：
  - 候选列表展示
  - 多选
  - 空选提交
  - 提交中禁用
  - 提交错误提示
- `PageShell` 扩成“左侧树图 + 右侧聊天/候选上下堆叠”的三块区域布局。

### 测试

新增：
- [candidate-service.test.ts](/D:/code/Ascend/src/read-model/candidate-service.test.ts)
- [candidate-actions.test.ts](/D:/code/Ascend/src/web-api/candidate-actions.test.ts)

覆盖点：
- 父节点不存在
- 父节点无 `rawResult`
- 候选读取正常返回
- `candidateId` 稳定一致
- 空选择 `createdCount = 0`
- 非法 `candidateId` 直接失败
- 多选创建多个 child node 并挂树
- `child_candidate_events.candidate_id` 写入正确

## 验证结果

已通过：
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm page:build`

自动化测试当前为 `55/55` 通过。

## 风险与待验收项

当前仍待人工联调：
- `pnpm page:api`
- `pnpm page:web`
- 页面上实际选择候选并确认后的交互体验
- 树图刷新后新增 child node 的页面观感

本轮补充修复：
- 候选读取增加了前端超时降级，避免页面长时间停在“候选加载中...”。
- 页面布局改成左右区域各自受控高度，右侧聊天/候选区内部滚动，不再把左侧树图区整体撑高。
- 候选读取改成优先使用父节点最新一批 `child_candidate_events` 恢复当前可确认候选；当最新一批已全部选中时，页面会直接得到业务空状态，而不是继续长时间等待 AI 提取。
- 候选确认动作不再单独重跑另一套候选来源；读取候选与确认候选现在统一通过同一条“当前可确认候选”链路，避免页面提交的 `candidateId` 与后端校验来源不一致，导致“candidateId 不属于当前父节点”。

已知实现取舍：
- 本里程碑没有引入候选缓存或新表；候选读取与候选确认都通过“同一父节点 + 同一候选语义内容”生成稳定 `candidateId`。
- 页面仍然不支持聊天输入，也不支持继续推进 workflow。
