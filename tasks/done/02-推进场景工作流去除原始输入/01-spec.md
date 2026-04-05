# 方案：推进场景最小可运行闭环

## 目标

- 保留原始会话转录，供 handoff 与回放使用。
- 单独维护工作流分析上下文，避免原始输入与规范化输入同时进入同一轮分析。
- 不改变既有图路由与 CLI 闭环边界。

## 状态契约

```ts
interface AgentState {
  rawMessages: BaseMessage[];
  analysisMessages: BaseMessage[];
  rawInput: string;
  normalizedQuery: string;
  currentState: "A" | "B" | "C" | null;
  phase: "normal" | "await_c_intent" | "ended";
  shouldExit: boolean;
  lastAssistantOutput: string;
}
```

- `rawMessages`：只保存原始会话转录，包含用户真实输入、业务 assistant 输出、必要固定提醒。
- `analysisMessages`：只保存工作流分析真正依赖的历史上下文，包含“规范化后的用户问题 + 业务 assistant 输出”。
- 同一轮分析中，`analysisMessages` 与 `normalizedQuery` 不能再出现“原始输入 + 规范化输入”双份问题。
- `lastAssistantOutput` 只保存最近一次业务 assistant 输出，不包含 CLI 固定提醒。

## 节点与上下文规则

- `normalizeInputNode` 只处理 `rawInput`，输出 `normalizedQuery` 或 `EMPTY`。
- `evaluateStateNode` 只消费 `analysisMessages + normalizedQuery`，不读 `rawMessages`。
- `actionA/B/C` 只消费 `analysisMessages + normalizedQuery`，输出业务 assistant 文本。
- `actionA/B/C` 写入状态时：
  - `rawMessages` 追加业务 assistant 输出。
  - `analysisMessages` 追加“本轮 normalizedQuery + 本轮业务 assistant 输出”。
- `recognizeIntentNode` 只消费 `lastAssistantOutput + rawInput`，不消费 `analysisMessages`。

## CLI 规则

- 进入真实处理轮时，CLI 只向 `rawMessages` 追加原始用户输入。
- 显式退出输入写入 `rawMessages`，再生成 handoff。
- `EMPTY` 提醒与 `await_c_intent` filler 提醒只写入 `rawMessages`，不写入 `analysisMessages`，也不覆盖 `lastAssistantOutput`。

## 结束与交接

- `HandoffRecord.rawMessages` 继续承载原始会话转录，对应 `rawMessages` 快照。
- 结束原因仍只允许 `confirm | explicit_exit`。

## 验收点

- 原始会话完整保留在 `rawMessages` 中。
- `analysisMessages` 中不再出现当前轮 rawInput 与 normalizedQuery 双份问题。
- `evaluate/action` prompt 直接消费 `analysisMessages`，不再需要“按当前 rawInput 临时剔除”。
- `pnpm test`、`pnpm typecheck`、`pnpm build` 通过。
