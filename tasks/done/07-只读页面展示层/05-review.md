# 里程碑 4：只读页面展示层 Review

## 已完成

1. 新增 `Vite + React` 的 `web/` 模块，并通过 `vite.config.ts` 固定开发入口、构建目录和 `/api` 代理。
2. 新增 `src/read-model/page-service.ts`，把现有 SQLite `nodes + tree_relations + rawMessages` 组装成页面专用 `PageReadModel`。
3. 新增 `src/web-api/server.ts`，提供 `GET /api/page-read-model` 只读接口。
4. 新增前端模块化展示层：
   - 页面容器：`web/src/modules/layout/PageShell.tsx`
   - 树图展示：`web/src/modules/tree/TreePanel.tsx`
   - 聊天展示：`web/src/modules/chat/ChatPanel.tsx`
   - 数据层与映射层：`web/src/modules/data/*`
5. 树图使用 `@xyflow/react` 只读展示当前树结构，点击节点会联动右侧聊天区域。
6. 聊天区域使用 assistant-ui primitives 展示当前节点消息历史，保持只读，不暴露输入框和发送入口。
7. 新增 `src/read-model/page-service.test.ts`，补齐空库、树关系、消息映射、空消息节点测试。
8. 修复页面首次加载时的 effect 死循环，避免重复把状态重置为 `loading` 并反复取消 `/api/page-read-model` 请求。

## 关键设计判断

1. 页面不直接读取 SQLite，而是先经过 `page-service -> web-api -> web/data/api` 这条只读链路，避免 UI 绑定底层表结构。
2. 页面层只消费 `PageReadModel` 与前端 `PageViewModel`，不让 React Flow 和 assistant-ui 细节泄漏回服务端。
3. 聊天展示没有继续使用 `ExternalThread` 作为 JSX 容器，而是改用 `ReadonlyThreadProvider + @assistant-ui/react` primitives，避免类型与运行时不兼容。

## 验证结果

- `pnpm typecheck`：通过
- `pnpm build`：通过
- `pnpm test`：通过
- `pnpm page:build`：通过

## 未完成

1. 还未人工启动 `pnpm page:api` 与 `pnpm page:web` 做浏览器联调。
2. 页面当前只读，不包含候选确认、继续推进、创建节点等交互。
