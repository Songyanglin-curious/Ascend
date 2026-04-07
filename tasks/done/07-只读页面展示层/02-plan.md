# 02-plan：里程碑 4 只读页面展示层实现计划

## 摘要

- 当前仓库还没有任何 React 前端骨架，也没有页面读取层。
- 本次实现目标是在不改变现有 CLI 主流程语义、不引入页面写操作的前提下，新增一套只读页面：
  - 左侧使用 `React Flow(@xyflow/react)` 展示树结构
  - 右侧使用 `assistant-ui` 展示当前选中节点的聊天历史
- 页面数据不直接从浏览器访问 SQLite，而是通过本地只读查询服务提供。
- 本次不做发送消息、不做候选确认、不做节点创建、不做拖拽改树。

## 本次要修改的文件

- 修改 [package.json](D:/code/Ascend/package.json)
- 新增 [vite.config.ts](D:/code/Ascend/vite.config.ts)
- 新增 [tsconfig.web.json](D:/code/Ascend/tsconfig.web.json)
- 新增 [web/index.html](D:/code/Ascend/web/index.html)
- 新增 [web/src/main.tsx](D:/code/Ascend/web/src/main.tsx)
- 新增 [web/src/app/App.tsx](D:/code/Ascend/web/src/app/App.tsx)
- 新增 [web/src/app/app.css](D:/code/Ascend/web/src/app/app.css)
- 新增 [web/src/modules/layout/PageShell.tsx](D:/code/Ascend/web/src/modules/layout/PageShell.tsx)
- 新增 [web/src/modules/tree/TreePanel.tsx](D:/code/Ascend/web/src/modules/tree/TreePanel.tsx)
- 新增 [web/src/modules/chat/ChatPanel.tsx](D:/code/Ascend/web/src/modules/chat/ChatPanel.tsx)
- 新增 [web/src/modules/data/api.ts](D:/code/Ascend/web/src/modules/data/api.ts)
- 新增 [web/src/modules/data/types.ts](D:/code/Ascend/web/src/modules/data/types.ts)
- 新增 [web/src/modules/data/mappers.ts](D:/code/Ascend/web/src/modules/data/mappers.ts)
- 新增 [src/read-model/page-types.ts](D:/code/Ascend/src/read-model/page-types.ts)
- 新增 [src/read-model/page-service.ts](D:/code/Ascend/src/read-model/page-service.ts)
- 新增 [src/read-model/page-service.test.ts](D:/code/Ascend/src/read-model/page-service.test.ts)
- 新增 [src/web-api/server.ts](D:/code/Ascend/src/web-api/server.ts)

## 本次不修改的范围

- 不修改 [src/workflows/advance/](D:/code/Ascend/src/workflows/advance) 内部 workflow 逻辑
- 不修改 [src/node-tree/](D:/code/Ascend/src/node-tree) 的业务职责
- 不修改 [src/persistence/sqlite/node-store.ts](D:/code/Ascend/src/persistence/sqlite/node-store.ts) 的公开接口语义
- 不修改 [src/persistence/sqlite/tree-store.ts](D:/code/Ascend/src/persistence/sqlite/tree-store.ts) 的公开接口语义
- 不修改 [src/persistence/sqlite/child-candidate-event-store.ts](D:/code/Ascend/src/persistence/sqlite/child-candidate-event-store.ts) 的公开接口语义
- 不替换现有 CLI 入口
- 不做页面写操作 API
- 不做多棵树管理
- 不做候选确认或继续推进的页面交互

## 实现步骤

### 1. 建立前端运行骨架

文件：

- 修改 [package.json](D:/code/Ascend/package.json)
- 新增 [vite.config.ts](D:/code/Ascend/vite.config.ts)
- 新增 [tsconfig.web.json](D:/code/Ascend/tsconfig.web.json)
- 新增 [web/index.html](D:/code/Ascend/web/index.html)
- 新增 [web/src/main.tsx](D:/code/Ascend/web/src/main.tsx)

变更：

- 在根包中补齐前端依赖：
  - `react`
  - `react-dom`
  - `vite`
  - `@vitejs/plugin-react`
  - `@xyflow/react`
  - `@assistant-ui/react`
- 在 `package.json` 新增只读页面相关脚本，例如：
  - `page:web`
  - `page:api`
  - `page:dev`
  - `page:build`
- 用独立 `tsconfig.web.json` 承载前端 TS/TSX 编译，不污染现有 Node `tsconfig.json`
- 用 `vite.config.ts` 固定前端入口目录和 API 代理

输入输出：

- 输入：无
- 输出：可启动的前端开发壳与前端构建入口

关键逻辑分支：

1. Node 构建与 Web 构建分离
2. Web 通过代理访问本地只读 API

关键异常路径：

- 不把前端 TSX 目录直接纳入当前 Node `tsc` 编译
- 不让前端依赖影响现有 CLI 启动脚本

验证命令：

- `pnpm typecheck`

### 2. 建立只读查询模型与服务

文件：

- 新增 [src/read-model/page-types.ts](D:/code/Ascend/src/read-model/page-types.ts)
- 新增 [src/read-model/page-service.ts](D:/code/Ascend/src/read-model/page-service.ts)

变更：

- 在 `page-types.ts` 定义页面只读层专用数据结构，而不是直接把 SQLite 行结构暴露给前端。
- 在 `page-service.ts` 中读取现有 SQLite store，并组装页面需要的只读数据。

新增接口与函数：

- `PageReadModel`
- `PageNodeRecord`
- `PageMessageRecord`
- `loadPageReadModel(databasePath: string): PageReadModel`
- `buildNodeMessages(...)`
- `buildTreeSnapshotRecords(...)`

输入输出：

- 输入：数据库路径
- 输出：页面只读模型，至少包含：
  - `rootNodeId`
  - 节点基础信息
  - 树关系
  - 节点对应聊天历史

关键逻辑分支：

1. 有 root：返回完整树与节点数据
2. 无 root 或无节点：返回空状态模型
3. 节点存在但无 `rawResult/rawMessages`：返回空消息数组

关键异常路径：

- 数据库打开失败：直接抛错
- 数据读取失败：直接抛错
- 不做静默 fallback 为伪空数据

验证命令：

- `pnpm typecheck`

### 3. 建立本地只读 HTTP 服务

文件：

- 新增 [src/web-api/server.ts](D:/code/Ascend/src/web-api/server.ts)

变更：

- 使用 Node 原生 `http` 或最小等价方案提供只读接口。
- 本里程碑只需要 1 个页面读取接口即可，例如：
  - `GET /api/page-read-model`

新增接口与函数：

- `startReadOnlyWebApiServer(...)`
- `handlePageReadModelRequest(...)`

输入输出：

- 输入：固定 SQLite 路径
- 输出：JSON 格式的 `PageReadModel`

关键逻辑分支：

1. 正常读取：返回 `200`
2. 空状态读取：仍返回 `200`，但模型为“无内容”
3. 读取异常：返回显式错误 JSON 与非 2xx 状态码

关键异常路径：

- 不暴露页面写操作接口
- 不把 CLI 主流程逻辑搬到 API 层

验证命令：

- `pnpm typecheck`

### 4. 定义前端模块边界与类型映射

文件：

- 新增 [web/src/modules/data/types.ts](D:/code/Ascend/web/src/modules/data/types.ts)
- 新增 [web/src/modules/data/api.ts](D:/code/Ascend/web/src/modules/data/api.ts)
- 新增 [web/src/modules/data/mappers.ts](D:/code/Ascend/web/src/modules/data/mappers.ts)

变更：

- `types.ts` 定义前端 ViewModel：
  - `PageViewModel`
  - `FlowNodeViewModel`
  - `FlowEdgeViewModel`
  - `ChatThreadViewModel`
  - `ChatMessageViewModel`
- `api.ts` 只负责读取 `/api/page-read-model`
- `mappers.ts` 负责：
  - `PageReadModel -> PageViewModel`
  - `PageNodeRecord -> React Flow nodes/edges`
  - `PageMessageRecord -> assistant-ui 可消费消息`

关键逻辑分支：

1. 默认选中 root
2. 选中节点无效时回退 root
3. 节点无聊天历史时返回空线程 ViewModel

关键异常路径：

- 前端组件不直接访问原始 API 数据结构
- 不把 React Flow/assistant-ui 组件细节混进 API 层

验证命令：

- `pnpm typecheck`

### 5. 实现页面容器与左右布局

文件：

- 新增 [web/src/app/App.tsx](D:/code/Ascend/web/src/app/App.tsx)
- 新增 [web/src/app/app.css](D:/code/Ascend/web/src/app/app.css)
- 新增 [web/src/modules/layout/PageShell.tsx](D:/code/Ascend/web/src/modules/layout/PageShell.tsx)

变更：

- `App.tsx` 负责页面数据加载、错误状态、空状态和选中节点状态。
- `PageShell.tsx` 负责左右布局，不直接承载树图与聊天数据转换逻辑。
- 布局固定为：
  - 左侧树图区
  - 右侧聊天区

关键逻辑分支：

1. 加载中
2. 读取失败
3. 无节点空状态
4. 正常展示状态

关键异常路径：

- 读取失败必须显式展示错误态
- 无数据必须显式展示空状态，不允许白屏

验证命令：

- `pnpm typecheck`

### 6. 实现树图展示模块

文件：

- 新增 [web/src/modules/tree/TreePanel.tsx](D:/code/Ascend/web/src/modules/tree/TreePanel.tsx)

变更：

- 用 `@xyflow/react` 渲染只读树图。
- 节点点击时向上抛出选中事件。
- 当前选中节点必须有明显高亮。

输入输出：

- 输入：树图 ViewModel、当前选中节点 id、`onSelectNode`
- 输出：只读树图 UI

关键逻辑分支：

1. 有节点：展示 nodes + edges
2. 无节点：展示树图空状态

关键异常路径：

- 不启用拖拽改树
- 不启用页面内新增/删除节点

验证命令：

- `pnpm typecheck`

### 7. 实现聊天历史展示模块

文件：

- 新增 [web/src/modules/chat/ChatPanel.tsx](D:/code/Ascend/web/src/modules/chat/ChatPanel.tsx)

变更：

- 用 `assistant-ui` 展示当前选中节点对应的只读聊天线程。
- 明确区分 user / assistant 消息。
- 若节点没有消息，显示空状态提示。

输入输出：

- 输入：聊天线程 ViewModel
- 输出：只读聊天线程 UI

关键逻辑分支：

1. 有消息：正常展示
2. 无消息：展示“当前节点没有聊天历史”

关键异常路径：

- 不暴露消息输入框
- 不触发任何发送/提交逻辑

验证命令：

- `pnpm typecheck`

### 8. 补齐只读查询测试

文件：

- 新增 [src/read-model/page-service.test.ts](D:/code/Ascend/src/read-model/page-service.test.ts)
- 修改 [package.json](D:/code/Ascend/package.json)

变更：

- 为 `page-service.ts` 增加 Node 侧单元测试。
- 把新测试纳入 `pnpm test`。

必测场景：

1. 空库返回空状态模型
2. 有 root 和 child 时返回正确树关系
3. 节点有 `rawMessages` 时，返回正确顺序的 user / assistant 消息
4. 节点无 `rawMessages` 时，返回空消息数组

说明：

- 本里程碑不强制加入浏览器端组件测试工具；最小测试重点放在 read model 与映射正确性

验证命令：

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## 公共接口冻结

本次编码后至少形成以下接口：

- `loadPageReadModel(databasePath)`
- `PageReadModel`
- `PageViewModel`
- `startReadOnlyWebApiServer(...)`

说明：

- 页面只消费只读模型
- 页面不直接依赖 SQLite store 细节

## 人工验收路径

1. 启动本地只读 API 服务
2. 启动页面开发服务
3. 打开页面后：
   - 左侧能看到当前树结构
   - 默认选中 root
   - 右侧能看到 root 对应聊天历史
4. 点击树中不同节点：
   - 右侧聊天区同步切换
5. 对于无消息节点：
   - 右侧显示明确空状态
6. 页面中不存在：
   - 发送消息
   - 候选确认
   - 创建子节点
   - 拖拽改树

## 本次不做

- 不做页面内交互写操作
- 不做页面内继续推进
- 不做候选确认面板
- 不做节点编辑
- 不做拖拽改树
- 不做页面权限与用户体系
- 不做多棵树管理

## 完成标准

- 仓库具备独立可启动的只读页面
- 页面左侧树图、右侧聊天联动可用
- 页面层按容器、树图、聊天、适配、映射分模块实现
- `pnpm test`、`pnpm typecheck`、`pnpm build` 通过后，才进入下一步

## 默认假设

- 当前页面可以通过本地只读 API 读取数据，而不是浏览器直接读 SQLite
- 当前只承载单树只读展示
- assistant-ui 在本里程碑中只用来展示线程，不承担交互 runtime
