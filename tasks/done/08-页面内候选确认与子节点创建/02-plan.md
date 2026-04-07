# 02-plan：里程碑 5 页面内候选确认与子节点创建实现计划

## 摘要

- 当前仓库已经有：
  - 只读页面展示层
  - 候选提取与批量确认创建子节点能力
  - `processCompletedNodeChildCandidates(...)` 这条 CLI 侧业务主链
- 本次实现目标是在不改动既有业务语义的前提下，把“候选展示与确认创建”接入页面。
- 页面仍然通过本地 API 与后端交互，不让浏览器直接读取或写入 SQLite。
- 本次不做页面聊天输入，不做页面内继续推进 workflow。

## 本次要修改的文件

- 修改 [package.json](/D:/code/Ascend/package.json)
- 修改 [web/src/app/App.tsx](/D:/code/Ascend/web/src/app/App.tsx)
- 修改 [web/src/app/app.css](/D:/code/Ascend/web/src/app/app.css)
- 修改 [web/src/modules/layout/PageShell.tsx](/D:/code/Ascend/web/src/modules/layout/PageShell.tsx)
- 修改 [web/src/modules/data/api.ts](/D:/code/Ascend/web/src/modules/data/api.ts)
- 修改 [web/src/modules/data/types.ts](/D:/code/Ascend/web/src/modules/data/types.ts)
- 修改 [web/src/modules/data/mappers.ts](/D:/code/Ascend/web/src/modules/data/mappers.ts)
- 新增 [web/src/modules/candidates/CandidatePanel.tsx](/D:/code/Ascend/web/src/modules/candidates/CandidatePanel.tsx)
- 新增 [src/read-model/candidate-types.ts](/D:/code/Ascend/src/read-model/candidate-types.ts)
- 新增 [src/read-model/candidate-service.ts](/D:/code/Ascend/src/read-model/candidate-service.ts)
- 新增 [src/read-model/candidate-service.test.ts](/D:/code/Ascend/src/read-model/candidate-service.test.ts)
- 修改 [src/web-api/server.ts](/D:/code/Ascend/src/web-api/server.ts)
- 新增 [src/web-api/candidate-actions.ts](/D:/code/Ascend/src/web-api/candidate-actions.ts)
- 新增 [src/web-api/candidate-actions.test.ts](/D:/code/Ascend/src/web-api/candidate-actions.test.ts)

## 本次不修改的范围

- 不修改 [src/workflows/advance/](/D:/code/Ascend/src/workflows/advance/) 内部 workflow
- 不修改 [src/node-tree/](/D:/code/Ascend/src/node-tree/) 的既有公开语义
- 不修改 [src/persistence/sqlite/node-store.ts](/D:/code/Ascend/src/persistence/sqlite/node-store.ts) 公开接口
- 不修改 [src/persistence/sqlite/tree-store.ts](/D:/code/Ascend/src/persistence/sqlite/tree-store.ts) 公开接口
- 不修改 [src/persistence/sqlite/child-candidate-event-store.ts](/D:/code/Ascend/src/persistence/sqlite/child-candidate-event-store.ts) 公开接口
- 不改现有 SQLite schema
- 不做页面聊天输入
- 不做页面继续推进 workflow
- 不做多树支持

## 实现步骤

### 1. 建立候选页面读模型

文件：

- 新增 [src/read-model/candidate-types.ts](/D:/code/Ascend/src/read-model/candidate-types.ts)
- 新增 [src/read-model/candidate-service.ts](/D:/code/Ascend/src/read-model/candidate-service.ts)

变更：

- 定义页面候选只读模型，至少表达：
  - `parentNodeId`
  - `candidates`
  - 每个候选的 `candidateId / title / summary / type / reason / evidence`
- 在 `candidate-service.ts` 中提供一个函数，用于根据父节点 id 生成当前节点对应候选列表

输入输出：

- 输入：`databasePath`、`parentNodeId`、`model`
- 输出：候选页面只读模型

关键逻辑分支：

1. 父节点存在且有 `rawResult`：调用现有候选提取能力，返回候选数组
2. 父节点不存在：直接抛错
3. 父节点存在但还没有 `rawResult`：返回空候选数组，而不是伪造候选
4. 候选提取返回空数组：合法空状态

关键异常路径：

- 候选提取输出非法 JSON：直接抛错
- 父节点无效：直接抛错

验证命令：

- `pnpm typecheck`

### 2. 把候选确认与子节点创建封装成页面可调用动作

文件：

- 新增 [src/web-api/candidate-actions.ts](/D:/code/Ascend/src/web-api/candidate-actions.ts)

变更：

- 提供一个页面写入动作函数，负责：
  - 接收 `parentNodeId + selectedCandidateIds`
  - 重新提取当前父节点候选
  - 只保留被选中的候选
  - 使用现有创建链路批量创建真实子节点并挂树
  - 记录候选确认事件

输入输出：

- 输入：
  - `databasePath`
  - `parentNodeId`
  - `selectedCandidateIds`
  - `model`
- 输出：
  - `parentNodeId`
  - `createdNodes`
  - `createdCount`

关键逻辑分支：

1. `selectedCandidateIds` 为空：视为合法提交，只记录事件，不创建节点
2. 有效选择：批量创建多个 child node
3. 父节点无效：直接失败
4. 选择中包含非法 `candidateId`：直接失败

关键异常路径：

- 候选提取结果和前端提交的 `candidateId` 不匹配：直接抛错
- 创建子节点失败：直接抛错，不伪造成功

说明：

- 这里不复用 CLI 的 `ConfirmationIO`
- 但要复用现有候选提取、事件记录、子节点创建和挂树语义

验证命令：

- `pnpm typecheck`

### 3. 扩展本地页面 API

文件：

- 修改 [src/web-api/server.ts](/D:/code/Ascend/src/web-api/server.ts)
- 新增 [src/web-api/candidate-actions.ts](/D:/code/Ascend/src/web-api/candidate-actions.ts)

变更：

- 在只读页面 API 基础上新增 2 类页面接口：
  - `GET /api/node-candidates?parentNodeId=...`
  - `POST /api/node-candidates/confirm`
- `GET` 负责读取当前父节点候选
- `POST` 负责确认候选并创建子节点

输入输出：

- `GET` 输入：父节点 id
- `GET` 输出：候选页面读模型
- `POST` 输入：`parentNodeId + selectedCandidateIds`
- `POST` 输出：创建结果

关键逻辑分支：

1. `GET` 无候选：返回 `200` + 空数组
2. `POST` 空选择：返回 `200` + `createdCount = 0`
3. `POST` 成功创建：返回 `200` + 新建节点信息
4. 任意读取或创建错误：返回显式错误 JSON

关键异常路径：

- 不新增页面写操作以外的多余接口
- 不把 CLI 逻辑直接搬进 HTTP handler

验证命令：

- `pnpm typecheck`

### 4. 定义前端候选数据类型与 API 封装

文件：

- 修改 [web/src/modules/data/types.ts](/D:/code/Ascend/web/src/modules/data/types.ts)
- 修改 [web/src/modules/data/api.ts](/D:/code/Ascend/web/src/modules/data/api.ts)
- 修改 [web/src/modules/data/mappers.ts](/D:/code/Ascend/web/src/modules/data/mappers.ts)

变更：

- 增加前端候选相关类型：
  - `CandidateViewModel`
  - `CandidatePanelViewModel`
  - `ConfirmCandidatesPayload`
  - `ConfirmCandidatesResult`
- 在 `api.ts` 中新增：
  - `fetchNodeCandidates(parentNodeId)`
  - `confirmNodeCandidates(payload)`
- 在 `mappers.ts` 中新增页面候选映射：
  - 后端候选读模型 -> `CandidatePanelViewModel`

关键逻辑分支：

1. 空候选 -> 空状态 ViewModel
2. 有候选 -> 可多选 ViewModel
3. 当前节点无效 -> 不请求候选，返回稳定空状态

关键异常路径：

- 组件不直接写 `fetch('/api/...')`
- 候选 API 失败统一抛给页面容器处理

验证命令：

- `pnpm typecheck`

### 5. 新增候选展示与确认模块

文件：

- 新增 [web/src/modules/candidates/CandidatePanel.tsx](/D:/code/Ascend/web/src/modules/candidates/CandidatePanel.tsx)
- 修改 [web/src/app/app.css](/D:/code/Ascend/web/src/app/app.css)

变更：

- 新增页面候选面板组件，负责：
  - 渲染候选列表
  - 维护本地多选状态
  - 渲染空状态
  - 渲染提交中状态
  - 渲染确认按钮
  - 抛出 `onConfirm(selectedIds)` 事件

输入输出：

- 输入：
  - 候选 ViewModel
  - `submitting`
  - `errorMessage`
  - `onConfirm`
- 输出：
  - 页面候选确认 UI

关键逻辑分支：

1. 无候选：显示空状态
2. 有候选：支持多选
3. 提交中：禁用交互并显示中间状态
4. 空选提交：允许提交

关键异常路径：

- 不在组件内部直接请求 API
- 不在组件内部伪造成功刷新

验证命令：

- `pnpm typecheck`

### 6. 扩展页面容器协调三块区域

文件：

- 修改 [web/src/app/App.tsx](/D:/code/Ascend/web/src/app/App.tsx)
- 修改 [web/src/modules/layout/PageShell.tsx](/D:/code/Ascend/web/src/modules/layout/PageShell.tsx)

变更：

- `App.tsx` 负责：
  - 当前节点切换时加载候选列表
  - 候选确认时提交写入请求
  - 写入成功后重新拉取页面 read model
  - 保持当前父节点选中稳定
- `PageShell.tsx` 从“两栏布局”扩成“树图 + 聊天 + 候选确认区”布局

输入输出：

- `App.tsx` 输入：页面 read model、候选读模型、候选确认结果
- `App.tsx` 输出：统一分发给 `TreePanel / ChatPanel / CandidatePanel`

关键逻辑分支：

1. 页面初始 ready 后，如果有有效选中节点，则拉取该节点候选
2. 选中节点切换，候选区域同步刷新
3. 确认成功后，重新拉取 page read model，再重新拉取当前节点候选
4. 确认失败后，保留当前树图，不伪造更新

关键异常路径：

- 避免再次出现页面加载死循环
- 页面刷新顺序必须稳定，不能在确认成功后丢失当前选中节点

验证命令：

- `pnpm typecheck`

### 7. 补充测试

文件：

- 新增 [src/read-model/candidate-service.test.ts](/D:/code/Ascend/src/read-model/candidate-service.test.ts)
- 新增 [src/web-api/candidate-actions.test.ts](/D:/code/Ascend/src/web-api/candidate-actions.test.ts)
- 修改 [package.json](/D:/code/Ascend/package.json)

变更：

- 为候选读模型和页面写入动作增加 Node 侧测试
- 把新测试接入 `pnpm test`

必测场景：

1. 父节点无 `rawResult` 时，候选服务返回空数组
2. 父节点有 `rawResult` 时，候选服务返回合法候选数组
3. 候选确认空选择时，返回 `createdCount = 0`
4. 候选确认多个选择时，创建多个真实 child node 并挂树
5. 非法 `candidateId` 时直接失败
6. 创建成功后，树关系和节点数量正确变化

验证命令：

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`
- `pnpm page:build`

## 公共接口冻结

本次编码后至少形成以下接口：

- `loadNodeCandidates(...)`
- `confirmNodeCandidatesAction(...)`
- `fetchNodeCandidates(...)`
- `confirmNodeCandidates(...)`
- `CandidatePanel`

说明：

- 页面候选读接口与确认写接口语义冻结
- 现有只读页面模型接口不改语义，只在页面容器层增加候选链路

## 人工验收路径

1. 启动页面 API 与前端页面
2. 打开页面后默认选中 root
3. 在候选区域看到 root 对应候选列表
4. 勾选多个候选并确认
5. 树图中出现多个新 child node
6. 当前父节点仍保持选中
7. 切换到其他节点时，候选区域同步切换

## 本次不做

- 不做页面聊天输入
- 不做页面内继续推进 workflow
- 不做页面节点编辑
- 不做拖拽改树
- 不做多树能力
- 不做候选历史审计可视化

## 完成标准

- 页面支持候选展示、多选确认、创建子节点和树图刷新
- 页面业务语义与现有 CLI 候选确认保持一致
- `pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm page:build` 全部通过后，才进入下一步

## 默认假设

- 候选读取允许在后端按当前父节点现算，不要求先做候选缓存
- 页面确认成功后采用重新拉取 read model 的方式刷新，不做前端本地乐观更新
- 当前页面仍然不承载聊天输入能力
