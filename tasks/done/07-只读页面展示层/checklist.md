# 里程碑 4：只读页面展示层 Checklist

- [x] 新增 `Vite + React` 的 `web/` 前端骨架
- [x] 新增页面只读 read model：`src/read-model/page-types.ts`
- [x] 新增页面只读查询服务：`src/read-model/page-service.ts`
- [x] 新增只读页面 API：`src/web-api/server.ts`
- [x] 新增前端数据层：`web/src/modules/data/api.ts`
- [x] 新增前端类型与映射层：`web/src/modules/data/types.ts`
- [x] 新增前端类型与映射层：`web/src/modules/data/mappers.ts`
- [x] 新增页面容器模块：`web/src/modules/layout/PageShell.tsx`
- [x] 新增树图展示模块：`web/src/modules/tree/TreePanel.tsx`
- [x] 新增聊天展示模块：`web/src/modules/chat/ChatPanel.tsx`
- [x] 新增页面入口：`web/src/app/App.tsx`
- [x] 新增页面样式：`web/src/app/app.css`
- [x] 新增只读查询测试：`src/read-model/page-service.test.ts`
- [x] 更新 `package.json` 页面相关脚本与测试入口
- [x] `pnpm typecheck` 通过
- [x] `pnpm build` 通过
- [x] `pnpm test` 通过
- [x] `pnpm page:build` 通过
- [x] 修复页面首次加载死循环，避免重复请求 `/api/page-read-model`

## 本次明确不做

- [x] 不做页面发送消息
- [x] 不做页面候选确认
- [x] 不做页面创建子节点
- [x] 不做页面继续推进 workflow
- [x] 不做节点编辑
- [x] 不做拖拽改树
