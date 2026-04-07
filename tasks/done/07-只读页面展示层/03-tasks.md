# 03-tasks：里程碑 4 只读页面展示层编码任务拆分

## 使用方式

- 本文档用于把 [02-plan.md](D:/code/Ascend/tasks/active/02-plan.md) 继续拆到“拿着就能直接编码”的粒度。
- 当前仍处于文档阶段，不进入实现。
- 本轮有一个额外前提要写死：
  - `@xyflow/react` 与 `@assistant-ui/react` 已安装
  - 仓库当前还没有 `web` 模块
  - 本次必须使用 `Vite` 创建并承载前端页面骨架

## 任务 1：补齐前端脚手架与运行边界

目标文件：

- [package.json](D:/code/Ascend/package.json)
- [vite.config.ts](D:/code/Ascend/vite.config.ts)
- [tsconfig.web.json](D:/code/Ascend/tsconfig.web.json)
- [web/index.html](D:/code/Ascend/web/index.html)

要做的事：

1. 在根目录创建 `web` 模块，而不是把前端文件混进现有 `src/`
2. 用 `Vite` 作为前端开发与构建工具
3. 在 `package.json` 中增加页面相关脚本，例如：
   - `page:web`
   - `page:api`
   - `page:dev`
   - `page:build`
4. 新增 `tsconfig.web.json`，只编译 `web/**/*`
5. 新增 `vite.config.ts`，固定前端入口与本地 API 代理

编码要求：

- 不修改现有 Node `tsconfig.json` 的编译范围
- 不让 `web` 目录进入当前 `src/**/*.ts` 的 Node 构建
- `Vite` 必须成为页面的正式骨架，而不是临时文件服务器

完成后自检：

- 仓库结构中正式出现 `web/`
- 页面开发与 Node 构建边界清晰分离

## 任务 2：创建前端入口与最小页面壳

目标文件：

- [web/src/main.tsx](D:/code/Ascend/web/src/main.tsx)
- [web/src/app/App.tsx](D:/code/Ascend/web/src/app/App.tsx)
- [web/src/app/app.css](D:/code/Ascend/web/src/app/app.css)

要做的事：

1. 建立 React 入口 `main.tsx`
2. 建立 `App.tsx` 作为页面总入口
3. 建立最小全局样式文件

编码要求：

- `App.tsx` 当前只负责页面入口编排，不直接写树图和聊天细节
- 页面应有明确的左右布局容器，但具体模块暂时用占位组件也可以

完成后自检：

- 页面入口文件职责单一
- 页面骨架不直接耦合业务数据结构

## 任务 3：建立页面容器模块

目标文件：

- [web/src/modules/layout/PageShell.tsx](D:/code/Ascend/web/src/modules/layout/PageShell.tsx)

要做的事：

1. 提供左右布局外壳
2. 接收左侧树图区与右侧聊天区的渲染内容
3. 不负责查询数据、不负责数据映射

编码要求：

- `PageShell` 只做布局，不做业务判断
- 布局至少支持桌面正常阅读
- 不要把树图和聊天组件直接写死在样式文件里

完成后自检：

- 容器模块可以独立复用

## 任务 4：定义页面层只读数据类型

目标文件：

- [src/read-model/page-types.ts](D:/code/Ascend/src/read-model/page-types.ts)
- [web/src/modules/data/types.ts](D:/code/Ascend/web/src/modules/data/types.ts)

要做的事：

1. 在服务端只读层定义：
   - `PageReadModel`
   - `PageNodeRecord`
   - `PageMessageRecord`
2. 在前端定义：
   - `PageViewModel`
   - `FlowNodeViewModel`
   - `FlowEdgeViewModel`
   - `ChatThreadViewModel`
   - `ChatMessageViewModel`

编码要求：

- 前后端类型职责分离
- 前端类型不能直接照搬数据库结构
- 消息角色只保留当前只读页面所需的最小语义

完成后自检：

- 类型命名清楚
- 前端 ViewModel 已经和底层表结构脱钩

## 任务 5：实现只读查询服务

目标文件：

- [src/read-model/page-service.ts](D:/code/Ascend/src/read-model/page-service.ts)

要做的事：

1. 读取当前 SQLite 数据
2. 组装页面读取模型
3. 至少输出：
   - `rootNodeId`
   - 节点列表
   - 树关系
   - 每个节点的聊天历史

新增函数建议：

- `loadPageReadModel(databasePath)`
- `buildTreeSnapshotRecords(...)`
- `buildNodeMessages(...)`

编码要求：

- 节点无 `rawMessages` 时返回空消息数组
- 无 root 时返回明确空状态模型
- 不在这里引入 React Flow 或 assistant-ui 相关类型

完成后自检：

- 只读服务可独立于页面 UI 被测试

## 任务 6：实现本地只读 API 服务

目标文件：

- [src/web-api/server.ts](D:/code/Ascend/src/web-api/server.ts)

要做的事：

1. 提供一个本地只读 HTTP 服务
2. 暴露只读接口，例如：
   - `GET /api/page-read-model`
3. 从 `page-service.ts` 读取数据并输出 JSON

新增函数建议：

- `startReadOnlyWebApiServer(...)`
- `handlePageReadModelRequest(...)`

编码要求：

- 只读 API 不允许出现 POST/PUT/DELETE 写操作接口
- 读取失败返回显式错误 JSON
- 不把 CLI 主流程挪进这个服务

完成后自检：

- API 层只承担页面读取职责

## 任务 7：实现前端数据获取模块

目标文件：

- [web/src/modules/data/api.ts](D:/code/Ascend/web/src/modules/data/api.ts)

要做的事：

1. 提供前端读取函数
2. 请求本地只读接口
3. 返回 `PageReadModel`

新增函数建议：

- `fetchPageReadModel()`

编码要求：

- 不在组件里直接写 `fetch('/api/...')`
- API 异常要向上抛给容器层处理

完成后自检：

- 页面组件层不直接依赖请求细节

## 任务 8：实现前端映射模块

目标文件：

- [web/src/modules/data/mappers.ts](D:/code/Ascend/web/src/modules/data/mappers.ts)

要做的事：

1. 把 `PageReadModel` 转成页面容器可消费的 `PageViewModel`
2. 把节点与关系转成 React Flow 需要的数据
3. 把消息转成 assistant-ui 可消费的只读线程数据

新增函数建议：

- `toPageViewModel(...)`
- `toFlowNodes(...)`
- `toFlowEdges(...)`
- `toChatThreadViewModel(...)`

编码要求：

- 默认选中 root
- 若当前选中节点无效，则回退 root
- 节点无消息时返回空线程 ViewModel

完成后自检：

- React Flow 与 assistant-ui 相关映射都不散落在组件文件中

## 任务 9：实现树图展示模块

目标文件：

- [web/src/modules/tree/TreePanel.tsx](D:/code/Ascend/web/src/modules/tree/TreePanel.tsx)

要做的事：

1. 用 `@xyflow/react` 渲染只读树图
2. 支持当前选中节点高亮
3. 节点点击时回调 `onSelectNode`

编码要求：

- 禁止拖拽改树
- 禁止节点新增/删除操作入口
- 无节点时显示树图空状态

完成后自检：

- 树图模块不直接查数据
- 树图模块不直接控制右侧聊天内容

## 任务 10：实现聊天展示模块

目标文件：

- [web/src/modules/chat/ChatPanel.tsx](D:/code/Ascend/web/src/modules/chat/ChatPanel.tsx)

要做的事：

1. 用 `assistant-ui` 渲染当前选中节点的聊天线程
2. 清晰展示 user / assistant 消息
3. 无聊天历史时显示明确空状态

编码要求：

- 页面中不出现消息输入框
- 不出现发送按钮
- 不触发任何 runtime 写操作

完成后自检：

- 聊天模块是只读的
- 空线程状态清晰

## 任务 11：在 `App.tsx` 中完成模块装配

目标文件：

- [web/src/app/App.tsx](D:/code/Ascend/web/src/app/App.tsx)

要做的事：

1. 加载页面数据
2. 管理当前选中节点状态
3. 处理四种页面状态：
   - loading
   - error
   - empty
   - ready
4. 把数据分发给：
   - `PageShell`
   - `TreePanel`
   - `ChatPanel`

编码要求：

- `App.tsx` 不直接写映射细节
- `App.tsx` 不直接写 React Flow 节点配置
- `App.tsx` 不直接写 assistant-ui 消息构造

完成后自检：

- 页面总入口仍保持可读

## 任务 12：补齐只读查询测试

目标文件：

- [src/read-model/page-service.test.ts](D:/code/Ascend/src/read-model/page-service.test.ts)
- [package.json](D:/code/Ascend/package.json)

要做的事：

1. 测试空库返回空状态模型
2. 测试有 root / child 时返回正确树关系
3. 测试 `rawMessages` 被正确转成 user / assistant 顺序消息
4. 测试无 `rawMessages` 时返回空消息数组

编码要求：

- 测试使用临时 SQLite 数据，不写生产库
- 页面 UI 组件这轮不强求浏览器端自动化测试，重点先锁住 read model

完成后自检：

- 页面读取层逻辑已被测试覆盖

## 任务 13：最终验证顺序

执行顺序：

1. `pnpm typecheck`
2. `pnpm build`
3. `pnpm test`
4. `pnpm page:build`

完成标准：

- Node 侧构建通过
- 页面侧构建通过
- 页面读取服务测试通过
- 左树右聊的模块边界已在代码结构上落地

## 本次不做

- 不直接进入实现页面交互
- 不在页面内发送消息
- 不在页面内确认候选
- 不在页面内创建子节点
- 不做拖拽改树
- 不做多棵树
