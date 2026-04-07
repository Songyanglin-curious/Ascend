# 05-review

## 结论

- 已完成“推进场景节点化与最小树承载”的首个可执行版本。
- 本次实现严格落在 [02-plan.md](D:/code/Ascend/tasks/active/02-plan.md) 范围内，没有扩到 UI、持久化、多场景或复杂树操作。
- 自动化验证已通过；人工 `pnpm dev` 联调尚未执行。

## 本次落实

- 新增 [scene.ts](D:/code/Ascend/src/workflows/advance/scene.ts)，把现有 `advance` workflow 封装成可被项目级 `Node` 调用的独立场景执行单元。
- 新增 [types.ts](D:/code/Ascend/src/node-tree/types.ts)、[node-store.ts](D:/code/Ascend/src/node-tree/node-store.ts)、[tree-store.ts](D:/code/Ascend/src/node-tree/tree-store.ts)、[tree-service.ts](D:/code/Ascend/src/node-tree/tree-service.ts)，建立了最小 `NodeStore / TreeStore / TreeService`。
- 新增 [execute-scene-node.ts](D:/code/Ascend/src/node-tree/execute-scene-node.ts)，把节点执行时序固定为：进入节点 -> 标记 `running` -> 执行场景 -> 写回原始结果 -> 标记 `completed`；失败时写入 `failed + errorMessage` 并继续抛错。
- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)，入口不再直接跑 `advance graph + CLI`，而是先创建 root `advance` node，再通过 `executeSceneNode(...)` 执行。
- 修改 [src/workflows/advance/nodes.ts](D:/code/Ascend/src/workflows/advance/nodes.ts)，`normalizeInputNode` 改为本地 `trim` 归一化；空白输入直接落为 `EMPTY`，不再为 normalize 额外调用一次模型。
- `recognizeIntentNode` 继续保留 AI 判断路径，仍通过提示词让模型返回严格的 `confirm / reject`。
- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)，在场景退出后额外打印当前 `Node` 与 `Tree` 快照，方便人工验收当前根节点与树关系；该输出只用于调试和验收，不作为长期契约。
- 修改 [package.json](D:/code/Ascend/package.json)，测试脚本已同时运行 `advance` workflow 测试和 `node-tree` 测试。
- 新增 [node-tree.test.ts](D:/code/Ascend/src/node-tree/node-tree.test.ts)，补齐 Node / Tree / SceneExecutor 的关键行为测试。

## 验证结果

- `pnpm typecheck`：通过
- `pnpm build`：通过
- `pnpm test`：通过，共 19 条用例

## 残留风险

- 尚未执行真实 `DEEPSEEK_API_KEY` 下的人工 `pnpm dev` 联调，因此 root node 驱动下的真实终端交互只经过了自动化 fake IO 验证。
- 退出后打印的 `Node / Tree` 快照目前是调试输出，后续如 CLI 需要收口为正式产品形态，应单独决定是否保留。
- 当前 `TreeStore` 是纯内存实现，本里程碑不覆盖持久化恢复。
- 当前 `SceneType` 只支持 `"advance"`，没有做第二种场景的注册扩展。

## 本次未做

- 未实现 UI
- 未实现持久化
- 未实现节点重跑
- 未实现复杂树操作，例如移动节点、删除整棵子树、重排
- 未实现根据场景结果自动派生新节点
- 未修改 `docs/architecture/*.md`
