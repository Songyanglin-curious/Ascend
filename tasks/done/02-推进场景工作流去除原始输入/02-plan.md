# 02-plan：推进场景 rawMessages / analysisMessages 拆分

## 本次要改的文件

- 修改 [D:\code\Ascend\tasks\active\00-task.md](D:\code\Ascend\tasks\active\00-task.md)
- 新增 [D:\code\Ascend\tasks\active\01-spec.md](D:\code\Ascend\tasks\active\01-spec.md)
- 新增 [D:\code\Ascend\tasks\active\02-plan.md](D:\code\Ascend\tasks\active\02-plan.md)
- 修改 [D:\code\Ascend\src\index.ts](D:\code\Ascend\src\index.ts)
- 修改 [D:\code\Ascend\src\workflows\advance\types.ts](D:\code\Ascend\src\workflows\advance\types.ts)
- 修改 [D:\code\Ascend\src\workflows\advance\prompts.ts](D:\code\Ascend\src\workflows\advance\prompts.ts)
- 修改 [D:\code\Ascend\src\workflows\advance\nodes.ts](D:\code\Ascend\src\workflows\advance\nodes.ts)
- 修改 [D:\code\Ascend\src\workflows\advance\cli.ts](D:\code\Ascend\src\workflows\advance\cli.ts)
- 修改 [D:\code\Ascend\src\workflows\advance\workflow.test.ts](D:\code\Ascend\src\workflows\advance\workflow.test.ts)
- 新增 [D:\code\Ascend\tasks\active\checklist.md](D:\code\Ascend\tasks\active\checklist.md)
- 新增 [D:\code\Ascend\tasks\active\05-review.md](D:\code\Ascend\tasks\active\05-review.md)

## 实现计划

### 1. 状态与出口

- `AgentState.messages` 拆为 `rawMessages` 与 `analysisMessages`。
- `AdvanceStateAnnotation` 为两个消息数组都配置 append reducer。
- `createInitialAgentState()` 初始化两个空数组。
- `buildHandoffRecord()` 继续输出原始会话转录，对应 `rawMessages` 快照，字段名统一为 `HandoffRecord.rawMessages`。

### 2. 写入责任

- CLI：
  - 原始用户输入只写入 `rawMessages`。
  - 固定提醒只写入 `rawMessages`。
  - 固定提醒不覆盖 `lastAssistantOutput`。
- `actionA/B/C`：
  - `rawMessages` 追加业务 assistant 输出。
  - `analysisMessages` 追加 `HumanMessage(normalizedQuery)` 与 `AIMessage(output)`。
  - 更新 `lastAssistantOutput`。
- `normalize/evaluate/recognizeIntent` 不直接写消息数组。

### 3. Prompt 组装

- `buildEvaluatePromptMessages()` 改为只接收 `normalizedQuery + analysisMessages`。
- `buildActionPromptMessages()` 改为只接收 `systemPrompt + normalizedQuery + analysisMessages`。
- 删除 `getAnalysisHistoryMessages()` 及其基于当前 `rawInput` 的临时剔除逻辑。
- `recognizeIntent` 仍只接收 `system + assistant(lastAssistantOutput) + user(rawInput)`。

### 4. 测试

- 更新现有测试中的 `messages` 断言为 `rawMessages`。
- 新增 `analysisMessages` 断言：
  - 只包含规范化后的 user 与业务 assistant。
  - 不包含原始输入。
- 验证 filler 提醒不会写入 `analysisMessages`，也不会覆盖 `lastAssistantOutput`。

## 验证命令

- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

## 本次不做

- 不改 `graph.ts` 路由
- 不改 DeepSeek provider 适配
- 不做 UI、持久化、下游总结
