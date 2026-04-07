# 03-tasks：页面内候选确认与子节点创建

## 目标

- 把 `02-plan.md` 继续细化到“拿着就能写代码”的粒度。
- 本文件只拆任务，不做实现。
- 本次特别收紧一个实现前必须想清楚的问题：页面读候选和页面确认候选之间，`candidateId` 必须稳定，不能依赖运行时随机值。

## 本次编码前固定边界

- 只允许修改 `02-plan.md` 已列出的文件：
  - [package.json](/D:/code/Ascend/package.json)
  - [web/src/app/App.tsx](/D:/code/Ascend/web/src/app/App.tsx)
  - [web/src/app/app.css](/D:/code/Ascend/web/src/app/app.css)
  - [web/src/modules/layout/PageShell.tsx](/D:/code/Ascend/web/src/modules/layout/PageShell.tsx)
  - [web/src/modules/data/api.ts](/D:/code/Ascend/web/src/modules/data/api.ts)
  - [web/src/modules/data/types.ts](/D:/code/Ascend/web/src/modules/data/types.ts)
  - [web/src/modules/data/mappers.ts](/D:/code/Ascend/web/src/modules/data/mappers.ts)
  - [web/src/modules/candidates/CandidatePanel.tsx](/D:/code/Ascend/web/src/modules/candidates/CandidatePanel.tsx)
  - [src/read-model/candidate-types.ts](/D:/code/Ascend/src/read-model/candidate-types.ts)
  - [src/read-model/candidate-service.ts](/D:/code/Ascend/src/read-model/candidate-service.ts)
  - [src/read-model/candidate-service.test.ts](/D:/code/Ascend/src/read-model/candidate-service.test.ts)
  - [src/web-api/server.ts](/D:/code/Ascend/src/web-api/server.ts)
  - [src/web-api/candidate-actions.ts](/D:/code/Ascend/src/web-api/candidate-actions.ts)
  - [src/web-api/candidate-actions.test.ts](/D:/code/Ascend/src/web-api/candidate-actions.test.ts)
- 不修改 `advance workflow`、`node-tree`、SQLite schema、页面聊天输入能力。
- 不新增计划外文件。

## 编码顺序

1. 先完成后端候选读模型与稳定 `candidateId`
2. 再完成后端确认动作与 HTTP 接口
3. 再完成前端候选 API/类型/映射
4. 再接入页面容器与候选面板
5. 最后补测试与脚本验证

## Task 1：定义候选读模型类型

文件：
- [src/read-model/candidate-types.ts](/D:/code/Ascend/src/read-model/candidate-types.ts)

直接要做的事：
- 定义后端读模型类型，至少包含：
  - `CandidateReadModel`
  - `CandidateReadItem`
  - `ConfirmCandidatesInput`
  - `ConfirmCandidatesResult`
- 字段至少覆盖：
  - `parentNodeId`
  - `candidates`
  - `candidateId`
  - `title`
  - `summary`
  - `type`
  - `reason`
  - `evidence`
- 明确 `ConfirmCandidatesResult` 里至少有：
  - `parentNodeId`
  - `createdNodes`
  - `createdCount`

完成后自检：
- 类型名和字段名与 `01-spec.md`、`02-plan.md` 语义一致。
- 不在类型层偷偷加入本里程碑未冻结的字段。

## Task 2：实现候选读服务，并固定 `candidateId` 稳定规则

文件：
- [src/read-model/candidate-service.ts](/D:/code/Ascend/src/read-model/candidate-service.ts)

直接要做的事：
- 实现 `loadNodeCandidates(...)`
- 读取父节点：
  - 父节点不存在直接抛错
  - 父节点存在但没有 `rawResult` 时返回空候选数组
- 复用现有候选提取能力生成候选
- 在本文件内补一个“稳定 candidateId”的纯函数，不依赖随机 UUID

稳定 `candidateId` 的实现要求：
- 不能直接使用提取器当前返回的随机 `candidateId`
- 必须根据候选语义内容稳定生成，例如组合：
  - `parentNodeId`
  - `title`
  - `summary`
  - `type`
  - `reason`
  - `evidence`
- 相同父节点下，同一候选重复提取时，生成的 `candidateId` 必须一致
- 不改 SQLite schema，不新增缓存表
- 不把稳定 id 逻辑散落到多个文件里，保持单点实现

建议实现方式：
- 先拿提取器结果
- 再在 `candidate-service.ts` 里做一次规范化映射，把随机 `candidateId` 覆盖成稳定值
- 同时导出一个供写动作复用的窄函数，例如：
  - `normalizeExtractedCandidatesForPage(...)`
  - 或 `buildStableCandidateId(...)`

关键分支：
- 提取结果为空数组：返回空数组
- 提取结果非空：全部转成稳定 `candidateId`
- 提取失败：直接抛错

完成后自检：
- 连续两次对同一父节点调用 `loadNodeCandidates(...)`，相同候选的 `candidateId` 不变
- 该服务不记录事件、不创建节点，只负责读模型

## Task 3：实现页面写动作

文件：
- [src/web-api/candidate-actions.ts](/D:/code/Ascend/src/web-api/candidate-actions.ts)

直接要做的事：
- 实现 `confirmNodeCandidatesAction(...)`
- 输入：
  - `databasePath`
  - `parentNodeId`
  - `selectedCandidateIds`
  - `model`
- 输出：
  - `parentNodeId`
  - `createdNodes`
  - `createdCount`

内部步骤必须固定：
1. 重新读取父节点
2. 重新提取候选
3. 用与 `candidate-service.ts` 相同的稳定规则重建 `candidateId`
4. 校验 `selectedCandidateIds`
5. 记录候选确认事件
6. 批量创建真实 child node
7. 挂到树上
8. 返回创建结果

关键分支：
- `selectedCandidateIds = []`：
  - 合法
  - 记录确认批次
  - `createdCount = 0`
- 包含非法 `candidateId`：
  - 直接抛错
  - 不伪造成功
- 父节点不存在：
  - 直接抛错
- 创建任一 child node 失败：
  - 整体失败

实现约束：
- 不复用 CLI 的 `ConfirmationIO`
- 只复用业务语义，不复制 CLI 交互层
- 不能本地“猜测”前端传来的 `candidateId`，必须和读服务用同一套稳定规则

完成后自检：
- 同一个页面刚读出来的 `candidateId`，提交确认后能被后端再次识别
- 空选择不会创建节点
- 多选会按输入顺序创建多个 child node

## Task 4：扩展本地页面 API

文件：
- [src/web-api/server.ts](/D:/code/Ascend/src/web-api/server.ts)

直接要做的事：
- 新增 `GET /api/node-candidates?parentNodeId=...`
- 新增 `POST /api/node-candidates/confirm`
- 把 HTTP handler 和业务动作拆开：
  - `server.ts` 只做请求解析、调用 service/action、写响应
  - 业务逻辑留在 `candidate-service.ts` 和 `candidate-actions.ts`

`GET` handler 要做的事：
- 校验 `parentNodeId` 存在
- 调 `loadNodeCandidates(...)`
- 成功返回 `200 + JSON`
- 失败返回显式错误 JSON

`POST` handler 要做的事：
- 解析 body
- 校验 `parentNodeId` 和 `selectedCandidateIds`
- 调 `confirmNodeCandidatesAction(...)`
- 成功返回 `200 + JSON`
- 失败返回显式错误 JSON

完成后自检：
- `GET` 空候选返回 `200`
- `POST` 空选择返回 `200`
- 不把业务判断塞进 handler

## Task 5：补前端数据类型

文件：
- [web/src/modules/data/types.ts](/D:/code/Ascend/web/src/modules/data/types.ts)

直接要做的事：
- 增加前端候选相关类型：
  - `CandidateDto`
  - `CandidatePanelViewModel`
  - `CandidateViewModel`
  - `ConfirmCandidatesPayload`
  - `ConfirmCandidatesResult`

字段要求：
- `CandidateViewModel` 至少有：
  - `candidateId`
  - `title`
  - `summary`
  - `type`
  - `reason`
  - `evidence`
- `CandidatePanelViewModel` 至少有：
  - `parentNodeId`
  - `items`
  - `isEmpty`

完成后自检：
- 前端类型命名区分清楚 DTO、ViewModel、写入 payload
- 不和已有页面 read model 类型混淆

## Task 6：补前端 API 封装

文件：
- [web/src/modules/data/api.ts](/D:/code/Ascend/web/src/modules/data/api.ts)

直接要做的事：
- 新增 `fetchNodeCandidates(parentNodeId)`
- 新增 `confirmNodeCandidates(payload)`
- 保持和现有 `fetchPageReadModel()` 相同的错误处理风格

关键分支：
- `parentNodeId` 为空时不发请求，直接抛调用层错误或由上层规避
- `confirmNodeCandidates` 提交空数组是合法请求
- 后端非 `2xx` 时抛出显式错误

完成后自检：
- 组件层不直接写 `fetch`
- API 函数返回结构和后端响应一致

## Task 7：补前端映射层

文件：
- [web/src/modules/data/mappers.ts](/D:/code/Ascend/web/src/modules/data/mappers.ts)

直接要做的事：
- 新增把后端候选读模型映射成页面候选 ViewModel 的函数
- 映射时只做展示转换，不改业务语义

映射要求：
- 后端空候选数组 -> 前端 `isEmpty = true`
- 后端非空数组 -> 前端 `items` 可直接渲染
- 不在映射层生成临时随机 key，直接使用稳定 `candidateId`

完成后自检：
- 同一候选在重渲染时 key 不变化
- 映射层不发请求、不改状态

## Task 8：实现候选面板组件

文件：
- [web/src/modules/candidates/CandidatePanel.tsx](/D:/code/Ascend/web/src/modules/candidates/CandidatePanel.tsx)
- [web/src/app/app.css](/D:/code/Ascend/web/src/app/app.css)

直接要做的事：
- 实现只负责展示与确认的候选模块
- 组件输入至少包括：
  - `viewModel`
  - `submitting`
  - `errorMessage`
  - `onConfirm`
- 组件内部维护多选状态

界面状态必须明确：
- 空候选状态
- 正常列表状态
- 提交中状态
- 提交失败提示状态

交互要求：
- 支持多选
- 支持空选直接确认
- 提交中禁用勾选和按钮
- 点击确认时把当前选中 `candidateId[]` 抛给上层

完成后自检：
- 组件内部不直接请求 API
- 组件内部不直接刷新树
- 组件切换父节点时本地多选状态能正确重置

## Task 9：扩展页面容器编排

文件：
- [web/src/app/App.tsx](/D:/code/Ascend/web/src/app/App.tsx)
- [web/src/modules/layout/PageShell.tsx](/D:/code/Ascend/web/src/modules/layout/PageShell.tsx)
- [web/src/app/app.css](/D:/code/Ascend/web/src/app/app.css)

直接要做的事：
- 在 `App.tsx` 增加候选读写状态：
  - `candidateLoadState`
  - `candidateSubmitState`
- 当选中节点变化时，拉取该节点候选
- 当确认成功时：
  1. 调 `confirmNodeCandidates(...)`
  2. 重新拉取整页 read model
  3. 重新拉取当前父节点候选
  4. 保持当前父节点仍为选中节点
- 把 `TreePanel / ChatPanel / CandidatePanel` 三块同时交给 `PageShell`

必须处理的状态：
- 页面初次 ready 后自动加载 root 候选
- 节点切换时候选区跟随变化
- 候选提交时局部 loading，不阻断整页
- 提交失败时保留现有树和聊天内容

实现约束：
- 不再引入新的加载死循环
- 不在前端本地伪造新 child node
- 只在后端成功后通过重新读取 read model 更新树

完成后自检：
- root 默认选中时能看到 root 候选
- 确认成功后树图新增 child node
- 当前父节点不会因为刷新丢失选中

## Task 10：补测试

文件：
- [src/read-model/candidate-service.test.ts](/D:/code/Ascend/src/read-model/candidate-service.test.ts)
- [src/web-api/candidate-actions.test.ts](/D:/code/Ascend/src/web-api/candidate-actions.test.ts)
- [package.json](/D:/code/Ascend/package.json)

`candidate-service.test.ts` 必测：
- 父节点不存在时直接失败
- 父节点无 `rawResult` 时返回空数组
- 有候选时返回合法候选数组
- 同一父节点连续两次读取，同一候选的 `candidateId` 稳定一致

`candidate-actions.test.ts` 必测：
- 空选择返回 `createdCount = 0`
- 非法 `candidateId` 直接失败
- 多选时创建多个 child node 并挂树成功
- 创建后 `tree_relations` 和 `nodes` 数量变化正确
- 记录候选事件后，`candidate_id` 写入符合预期

`package.json` 要做的事：
- 确认新测试文件纳入 `pnpm test`

完成后自检：
- 测试覆盖的是“后端语义”和“稳定 id 契约”，不是 UI 截图式测试

## Task 11：编码完成后的验证顺序

固定验证命令：

1. `pnpm test`
2. `pnpm typecheck`
3. `pnpm build`
4. `pnpm page:build`

人工验收路径：

1. 启动 `pnpm page:api`
2. 启动 `pnpm page:web`
3. 打开页面，默认选中 root
4. 查看 root 候选列表
5. 多选若干候选并确认
6. 树图刷新并出现新 child node
7. 聊天区仍显示当前父节点历史
8. 切换其他节点时候选区同步变化

## 实现时的单点风险提醒

### 风险 1：`candidateId` 现在不能用提取器原始值

原因：
- 现有候选提取链路会生成运行时随机 `candidateId`
- 页面先读候选、再提交确认时，如果后端再次提取候选而 id 改了，就会导致前端提交的 id 永远匹配不上

本次任务要求：
- 编码时必须先解决这个问题，再写确认动作
- 解决方式限定在本里程碑已列文件内完成
- 不允许通过“把候选缓存进数据库新表”绕开

### 风险 2：页面刷新顺序

原因：
- 如果确认成功后先清空选中节点，再刷新 read model，页面很容易丢失当前上下文

本次任务要求：
- 先记住当前父节点 id
- 刷新 read model 后恢复该父节点选中
- 再重新读取该父节点候选

## 本次完成标准

- `03-tasks.md` 足够细，开发时不需要再补任务拆分
- 每个文件的职责、函数、输入输出、关键分支、测试点都明确
- `candidateId` 稳定性问题已在任务层显式冻结，不留到编码时临场决定
