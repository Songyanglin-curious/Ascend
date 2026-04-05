# 05-review

## 结论

- 已完成“推进场景最小可运行闭环”的首个可执行版本。
- 已补充源码关键路径中文注释与配套学习说明文档。
- 本次实现严格落在 `02-plan.md` 范围内，没有扩到 UI、持久化或下游流程。

## 本次落实

- `messages` 写入责任已收敛为单点：
  - CLI 只写真实处理轮的 user message
  - `actionA/B/C` 只写各自 assistant message
  - `normalize/evaluate/recognizeIntent` 不写消息
  - CLI 仅对 `EMPTY` 和 `await_c_intent` filler 提醒写固定 assistant message
- `normalize=EMPTY` 只结束当前 graph invocation，不结束整个工作流。
- `HandoffRecord` 只在 CLI 出口统一生成。
- `actionA/B/C` 都显式依赖 `normalizedQuery`、`currentState`、`messages`。
- 自动化测试基于 `WorkflowModel` stub，可脱离真实网络运行。
- 已在源码中补充关于 Node.js 入口、LangGraph 状态合并、图路由、CLI 单轮调度的中文注释。
- 已新增 `tasks/active/06-代码设计与学习说明.md`，系统说明代码分层、Node.js 环境职责与 LangGraph 关键概念。

## 验证结果

## 本次增量修正

- `WorkflowModel` 已改为 `complete(messages: PromptMessage[])`，模型调用不再拍平成单个 user prompt
- `evaluate / action / recognizeIntent` 已切到结构化消息输入
- `recognizeIntent` 只接收 `system + assistant(lastAssistantOutput) + user(rawInput)`，已修复当前输入重复喂入
- `evaluate / action` 组装上下文时会剔除当前轮末尾的原始 user message，仅保留历史转录 + 当前 `normalizedQuery`，已修复同轮出现两个等价问题
- 自动化测试已新增 `recognizeIntent` prompt 结构断言，并通过验证

- `pnpm typecheck`：通过
- `pnpm build`：通过
- `pnpm test`：通过

## 残留风险

- 真实 DeepSeek 联调尚未执行，因为当前未提供 `DEEPSEEK_API_KEY`。
- `isExplicitExitInput()` 与 `isAwaitIntentFillerInput()` 当前是 v1 白名单规则，后续如果真实使用中误判，需要基于样本再扩充。

## 本次未做

- 未实现 UI
- 未实现持久化
- 未实现确认后的下游总结、建分支或调度
- 未修改 `docs/architecture`
