
**数据库迁移与版本管理**

因为现在真正的风险点已经不是“能不能写入 SQLite”，而是：

- 旧库结构和新代码不一致
- 稍微改一次 schema，就可能再次跑崩
- 现在还没有正式的 schema 版本演进机制

这一步做完，后面的页面、总结 Agent、更多树能力才有稳定基础。

**为什么优先做它**

1. 你已经切到数据库版 store 了现在不是“要不要落盘”的问题，而是“落盘结构怎么安全演进”。
2. 你已经遇到真实问题了`child_candidate_events` 缺少 `candidate_id` 就是典型迁移问题，不是业务逻辑问题。
3. 不做迁移，后面每次改表都要手工修库
   这会越来越危险，也不适合长期维护。

**建议的里程碑目标**

- 给数据库增加明确的 schema version 管理
- 启动时自动检测当前版本
- 按顺序执行迁移脚本
- 把旧版 `child_candidate_events` 平滑迁到新版
- 迁移完成后，现有主流程无需手工修库即可启动

**建议范围**

做：

- `schema_version` 或同类版本表
- migration runner
- v1 -> v2 的 `child_candidate_events` 补列迁移
- 迁移测试
- 启动时自动迁移

不做：

- 页面
- 总结 Agent
- 多棵树
- ORM
- 大规模表重构

**建议验收标准**

- 空库启动时能自动建到最新结构
- 旧库启动时能自动迁到最新结构
- `child_candidate_events` 缺 `candidate_id` 的旧库能无手工干预修复
- `pnpm test / pnpm typecheck / pnpm build` 全通过
- `pnpm dev` 在旧库和新库上都能正常启动

**建议文档顺序**

按你当前规范继续走：

1. `tasks/active/00-Requirement.md`
2. `tasks/active/01-spec.md`
3. `tasks/active/02-plan.md`
4. `tasks/active/checklist.md`
5. 实现
6. 测试
7. `05-review.md`

如果你认可，我下一步就该先帮你写这个里程碑的 `01-spec.md`。
