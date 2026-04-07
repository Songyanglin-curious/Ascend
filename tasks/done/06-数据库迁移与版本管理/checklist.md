# checklist：里程碑 3 数据库迁移与版本管理

## 当前阶段

- 已完成 `00-Requirement.md`
- 已完成 `01-spec.md`
- 已完成 `02-plan.md`
- 已完成 `03-tasks.md`
- 当前进度：里程碑 3 已编码完成，等待人工联调验收

## 本次里程碑目标

- [x] 数据库具备 schema 版本语义
- [x] 启动时先检查 schema 再装配 store
- [x] 空库可自动初始化到当前版本
- [x] 旧库可自动迁移到当前版本
- [x] `child_candidate_events` 缺少 `candidate_id` 时可自动修复
- [x] 已是当前版本的数据库重复启动保持幂等
- [x] 未来版本数据库会被显式拒绝

## 文件清单

- [x] 修改 [src/persistence/sqlite/schema.ts](D:/code/Ascend/src/persistence/sqlite/schema.ts)
- [x] 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- [x] 修改 [package.json](D:/code/Ascend/package.json)
- [x] 新增 [src/persistence/sqlite/migrations.ts](D:/code/Ascend/src/persistence/sqlite/migrations.ts)
- [x] 新增 [src/persistence/sqlite/migration.test.ts](D:/code/Ascend/src/persistence/sqlite/migration.test.ts)
- [x] 更新 [tasks/active/checklist.md](D:/code/Ascend/tasks/active/checklist.md)
- [x] 更新 [tasks/active/05-review.md](D:/code/Ascend/tasks/active/05-review.md)

## 实现检查项

### 1. schema 版本承载
- [x] 冻结 `SQLITE_SCHEMA_VERSION`
- [x] 建立 `schema_version` 表
- [x] 实现版本读取
- [x] 实现版本写入

### 2. 迁移入口与路径识别
- [x] 实现空库识别
- [x] 实现无版本旧库识别
- [x] 实现已版本化库识别
- [x] 实现未来版本库拒绝运行

### 3. 空库初始化
- [x] 空库能创建 `nodes`
- [x] 空库能创建 `tree_state`
- [x] 空库能创建 `tree_relations`
- [x] 空库能创建 `child_candidate_events`
- [x] 空库能创建索引
- [x] 空库初始化后会写入当前 schema 版本

### 4. 旧库迁移
- [x] 旧库会进入显式迁移路径
- [x] `child_candidate_events` 缺 `candidate_id` 时会自动修复
- [x] 历史记录会保留
- [x] 历史记录会补出确定性 `candidate_id`
- [x] 迁移完成后会写入当前 schema 版本

### 5. 启动顺序
- [x] `index.ts` 在创建 store 前调用 `ensureSqliteSchema(...)`
- [x] 迁移细节不泄漏到业务主流程

### 6. 测试补齐
- [x] 新增迁移测试文件
- [x] 覆盖空库初始化
- [x] 覆盖当前版本幂等启动
- [x] 覆盖旧版 `child_candidate_events` 自动迁移
- [x] 覆盖迁移后当前写入链路恢复
- [x] 覆盖未来版本拒绝运行

## 范围检查

- [x] 不修改 [src/persistence/sqlite/node-store.ts](D:/code/Ascend/src/persistence/sqlite/node-store.ts) 的公开接口语义
- [x] 不修改 [src/persistence/sqlite/tree-store.ts](D:/code/Ascend/src/persistence/sqlite/tree-store.ts) 的公开接口语义
- [x] 不修改 [src/persistence/sqlite/child-candidate-event-store.ts](D:/code/Ascend/src/persistence/sqlite/child-candidate-event-store.ts) 的公开接口语义
- [x] 不修改 [src/workflows/advance/](D:/code/Ascend/src/workflows/advance) 内部 workflow 逻辑
- [x] 不修改 [src/node-tree/](D:/code/Ascend/src/node-tree) 的业务职责
- [x] 不做 UI
- [x] 不做总结 Agent
- [x] 不做 ORM
- [x] 不做多棵树管理

## 验证清单

- [x] `pnpm typecheck`
- [x] `pnpm build`
- [x] `pnpm test`
- [ ] 人工执行 `pnpm dev`，确认空库初始化、旧库迁移与幂等启动
