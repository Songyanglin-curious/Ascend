# checklist：页面内候选确认与子节点创建

## 使用说明

- 本清单用于执行里程碑 5。
- 已完成的自动化实现和验证已勾选。
- 人工联调项保留待验收状态，方便后续继续核对。

## 0. 开工确认

- [x] 已确认当前活跃文档为：
  - [00-Requirement.md](/D:/code/Ascend/tasks/active/00-Requirement.md)
  - [01-spec.md](/D:/code/Ascend/tasks/active/01-spec.md)
  - [02-plan.md](/D:/code/Ascend/tasks/active/02-plan.md)
  - [03-tasks.md](/D:/code/Ascend/tasks/active/03-tasks.md)
- [x] 已确认本里程碑只做“页面内候选确认与子节点创建”，不做页面聊天输入
- [x] 已确认本里程碑不修改 SQLite schema、不做多树支持、不做节点编辑

## 1. 后端候选读模型

- [x] 新增 [candidate-types.ts](/D:/code/Ascend/src/read-model/candidate-types.ts)
- [x] 定义 `CandidateReadModel`
- [x] 定义 `CandidateReadItem`
- [x] 定义 `ConfirmCandidatesInput`
- [x] 定义 `ConfirmCandidatesResult`
- [x] 新增 [candidate-service.ts](/D:/code/Ascend/src/read-model/candidate-service.ts)
- [x] 实现 `loadNodeCandidates(...)`
- [x] 父节点不存在时直接抛错
- [x] 父节点无 `rawResult` 时返回空候选数组
- [x] 候选提取结果为空时返回合法空状态

## 2. 稳定 candidateId

- [x] 在 [candidate-service.ts](/D:/code/Ascend/src/read-model/candidate-service.ts) 内落稳定 `candidateId` 规则
- [x] 稳定 id 不依赖随机 UUID
- [x] 稳定 id 至少绑定父节点与候选语义内容
- [x] 同一父节点重复读取时，相同候选的 `candidateId` 一致
- [x] 不通过新增数据库表或缓存表解决该问题
- [x] 该规则可被写动作复用，而不是只在读服务生效

## 3. 后端确认动作

- [x] 新增 [candidate-actions.ts](/D:/code/Ascend/src/web-api/candidate-actions.ts)
- [x] 实现 `confirmNodeCandidatesAction(...)`
- [x] 动作内部重新读取父节点
- [x] 动作内部读取当前可确认候选
- [x] 动作内部使用与读服务相同的稳定 `candidateId`
- [x] 候选读取与候选确认共用同一候选来源
- [x] 校验 `selectedCandidateIds`
- [x] 空选择时返回 `createdCount = 0`
- [x] 非法 `candidateId` 时直接失败
- [x] 复用现有候选确认事件记录语义
- [x] 复用现有 child node 创建与挂树语义
- [x] 多选时按提交顺序批量创建多个 child node

## 4. 本地页面 API

- [x] 修改 [server.ts](/D:/code/Ascend/src/web-api/server.ts)
- [x] 新增 `GET /api/node-candidates?parentNodeId=...`
- [x] 新增 `POST /api/node-candidates/confirm`
- [x] `GET` 成功时返回候选读模型 JSON
- [x] `GET` 空候选时返回 `200 + []` 语义
- [x] `POST` 空选择时返回 `200 + createdCount = 0`
- [x] `POST` 成功创建时返回创建结果 JSON
- [x] 任意失败路径返回显式错误 JSON
- [x] HTTP handler 只做请求解析与响应，不承载核心业务

## 5. 前端数据层

- [x] 修改 [types.ts](/D:/code/Ascend/web/src/modules/data/types.ts)
- [x] 增加 `CandidateDto`
- [x] 增加 `CandidateViewModel`
- [x] 增加 `CandidatePanelViewModel`
- [x] 增加 `ConfirmCandidatesPayload`
- [x] 增加 `ConfirmCandidatesResult`
- [x] 修改 [api.ts](/D:/code/Ascend/web/src/modules/data/api.ts)
- [x] 新增 `fetchNodeCandidates(parentNodeId)`
- [x] 新增 `confirmNodeCandidates(payload)`
- [x] 修改 [mappers.ts](/D:/code/Ascend/web/src/modules/data/mappers.ts)
- [x] 增加候选读模型到候选面板 ViewModel 的映射函数
- [x] 映射层直接复用稳定 `candidateId`，不生成前端随机 key

## 6. 候选面板组件

- [x] 新增 [CandidatePanel.tsx](/D:/code/Ascend/web/src/modules/candidates/CandidatePanel.tsx)
- [x] 修改 [app.css](/D:/code/Ascend/web/src/app/app.css) 支持候选区域样式
- [x] 候选面板支持空状态展示
- [x] 候选面板支持多选
- [x] 候选面板支持空选直接确认
- [x] 候选面板支持提交中禁用交互
- [x] 候选面板支持显示错误信息
- [x] 候选面板只抛出 `onConfirm(selectedIds)`，不直接请求 API

## 7. 页面容器与布局联动

- [x] 修改 [App.tsx](/D:/code/Ascend/web/src/app/App.tsx)
- [x] 修改 [PageShell.tsx](/D:/code/Ascend/web/src/modules/layout/PageShell.tsx)
- [x] 页面初始化后默认 root 选中时自动加载 root 候选
- [x] 切换树节点时同步刷新右侧聊天与候选区
- [x] 候选确认成功后重新拉取 page read model
- [x] 候选确认成功后重新拉取当前父节点候选
- [x] 刷新后保持当前父节点仍然选中
- [x] 候选提交失败时保留当前树图与聊天展示
- [x] 避免重新引入页面加载死循环

## 8. 测试

- [x] 新增 [candidate-service.test.ts](/D:/code/Ascend/src/read-model/candidate-service.test.ts)
- [x] 覆盖“父节点不存在时失败”
- [x] 覆盖“无 rawResult 时返回空数组”
- [x] 覆盖“有候选时返回合法结果”
- [x] 覆盖“同一候选重复读取时 `candidateId` 稳定”
- [x] 新增 [candidate-actions.test.ts](/D:/code/Ascend/src/web-api/candidate-actions.test.ts)
- [x] 覆盖“空选择 createdCount = 0”
- [x] 覆盖“非法 `candidateId` 直接失败”
- [x] 覆盖“多选创建多个 child node 并挂树”
- [x] 覆盖“创建后 nodes/tree_relations 数量变化正确”
- [x] 覆盖“候选事件写入的 `candidate_id` 正确”
- [x] 修改 [package.json](/D:/code/Ascend/package.json) 纳入新测试

## 9. 验证

- [x] `pnpm test`
- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm page:build`

## 10. 人工验收

- [ ] 启动 `pnpm page:api`
- [ ] 启动 `pnpm page:web`
- [ ] 页面默认选中 root
- [ ] root 能显示候选列表
- [ ] 可多选候选并确认
- [ ] 确认成功后树图新增多个 child node
- [ ] 当前父节点仍保持选中
- [ ] 聊天区仍显示当前父节点历史
- [ ] 切换其他节点时，候选区同步变化

## 11. 收尾

- [x] 更新本文件勾选状态
- [x] 更新 [05-review.md](/D:/code/Ascend/tasks/active/05-review.md)
- [x] 实现过程中未发现必须变更计划边界的额外文件
