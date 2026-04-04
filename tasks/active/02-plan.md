# 02-plan：推进场景最小闭环实现计划（审核意见修订版）

## 摘要

- 这版 plan 需要小幅完善，不需要重写。
- 本次补强 5 个点：`messages` 写入责任、`EMPTY` 语义、`HandoffRecord` 单一出口、`actionA/B/C` 输入完整性、图与测试脱离真实网络。
- 当前阶段仍是只产出 [02-plan.md](D:/code/Ascend/tasks/active/02-plan.md)，不做实现。

## 本次要改的文件

- 修改 [src/index.ts](D:/code/Ascend/src/index.ts)
- 修改 [package.json](D:/code/Ascend/package.json)
- 新增 [src/workflows/advance/types.ts](D:/code/Ascend/src/workflows/advance/types.ts)
- 新增 [src/workflows/advance/prompts.ts](D:/code/Ascend/src/workflows/advance/prompts.ts)
- 新增 [src/workflows/advance/model.ts](D:/code/Ascend/src/workflows/advance/model.ts)
- 新增 [src/workflows/advance/nodes.ts](D:/code/Ascend/src/workflows/advance/nodes.ts)
- 新增 [src/workflows/advance/graph.ts](D:/code/Ascend/src/workflows/advance/graph.ts)
- 新增 [src/workflows/advance/cli.ts](D:/code/Ascend/src/workflows/advance/cli.ts)
- 新增 [src/workflows/advance/workflow.test.ts](D:/code/Ascend/src/workflows/advance/workflow.test.ts)

## 实现计划

### 1. 状态与统一出口

- 在 `types.ts` 定义 `ProblemState`、`Phase`、`WorkflowEndReason`、`AgentState`、`HandoffRecord`、`createInitialAgentState()`、`buildHandoffRecord(state, endReason)`。
- `AgentState` 只保留 spec 已冻结字段，不新增 `turnStatus`、`controlResult` 一类临时字段。
- `buildHandoffRecord()` 只允许由 CLI runner 调用。
- 结束路径只有两种：
  - 显式退出：CLI 外层识别后直接调用 `buildHandoffRecord(state, "explicit_exit")`
  - confirm 结束：graph 返回 `phase=ended` 后，由 CLI 调用 `buildHandoffRecord(state, "confirm")`
- graph、nodes、model 层都不直接生成 `HandoffRecord`。

### 2. messages 写入责任矩阵

- CLI 只负责写入“进入真实处理轮的 user message”。
- `actionA/B/C` 只负责写入各自生成的 assistant message，并同步更新 `lastAssistantOutput`。
- `normalizeInputNode`、`evaluateStateNode`、`recognizeIntentNode` 不写 `messages`。
- CLI 可以写固定文案的 assistant message，但只限两类非节点输出：
  - `normalize=EMPTY` 的提醒
  - `await_c_intent` 下只回车/只发语气词时的提醒
- `reject` 同轮重评时，当前用户输入只在 CLI 进入本轮时写入一次，后续重评不得重复追加。
- 显式退出输入要写入 `messages`，这样交接记录包含完整结束动作。

### 3. 模型接口与提示词组织

- 在 `prompts.ts` 固化共享分析契约和 6 个节点提示词常量。
- 在 `model.ts` 定义 `WorkflowModel` 接口：
  - `complete(systemPrompt: string, userPrompt: string): Promise<string>`
- `buildAdvanceGraph(model)` 只依赖 `WorkflowModel`，不依赖真实网络。
- 全部自动化测试必须基于 `WorkflowModel` stub 跑通。
- 真实 DeepSeek 适配单独放在 `createDeepSeekWorkflowModel()`，固定模型名 `deepseek-reasoner`。
- 缺少 `DEEPSEEK_API_KEY` 直接抛错，不做 fallback。
- `process.exit(1)` 只允许出现在 [src/index.ts](D:/code/Ascend/src/index.ts) 顶层，不进入 `cli.ts`、`graph.ts`、`nodes.ts`。

### 4. 六节点与图路由

- 在 `nodes.ts` 实现 6 个节点。
- `normalizeInputNode`：
  - 输入：`rawInput`
  - 输出：`normalizedQuery`
  - 只做清洗归一化，空值返回字面量 `EMPTY`
- `evaluateStateNode`：
  - 输入：`normalizedQuery`、`messages`
  - 输出：`currentState`
  - 只允许返回 `A/B/C`
- `actionANode`：
  - 输入：`normalizedQuery`、`currentState`、`messages`
  - 输出：assistant message、`lastAssistantOutput`
- `actionBNode`：
  - 输入：`normalizedQuery`、`currentState`、`messages`
  - 输出：assistant message、`lastAssistantOutput`
- `actionCNode`：
  - 输入：`normalizedQuery`、`currentState`、`messages`
  - 输出：assistant message、`lastAssistantOutput`、`phase=await_c_intent`
- `recognizeIntentNode`：
  - 输入：`rawInput`、`phase`、`messages`
  - 输出：
    - `confirm` 时：`phase=ended`
    - `reject` 时：`phase=normal`、`currentState=null`
- 在 `graph.ts` 用 LangGraph `StateGraph` 组图。
- 路由规则写死为：
  - `phase=normal` 时从 `normalizeInputNode` 开始
  - `phase=await_c_intent` 时从 `recognizeIntentNode` 开始
  - `normalizedQuery === "EMPTY"` 时，本次 graph invocation 直接结束并把控制权交回 CLI
  - `evaluate -> actionA/B/C`
  - `actionC` 后结束本次 invocation，等待下一轮 CLI 输入
  - `recognizeIntent=reject` 时在同一 invocation 内回到 `normalize -> evaluate -> action`
  - `recognizeIntent=confirm` 时结束 invocation，并把 `phase` 留在 `ended`

### 5. CLI 闭环与结束语义

- 在 `cli.ts` 实现 `runAdvanceCli()`、`isExplicitExitInput()`、`isAwaitIntentFillerInput()`、`appendUserMessage()`、`appendFixedAssistantMessage()`。
- CLI 每轮顺序固定为：
  1. 读取一行原始输入
  2. 若命中显式退出：先写入 user message，再统一调用 `buildHandoffRecord(..., "explicit_exit")`
  3. 若当前 `phase=await_c_intent` 且输入只是回车/语气词：不写 user message，不进 graph，只写固定提醒 assistant message，保持 `phase=await_c_intent`
  4. 其余输入：先写入 user message，再调用 graph
  5. graph 返回后：
     - 若 `phase=ended`：统一调用 `buildHandoffRecord(..., "confirm")`
     - 若 `normalizedQuery === "EMPTY"`：不进入工作流结束，只写固定提醒 assistant message，继续下一轮
     - 其余情况：继续下一轮
- `normalize=EMPTY` 的准确语义写死为：
  - 不进入 `evaluate`
  - 不改变 `phase`
  - 不生成 `HandoffRecord`
  - 只结束本次 graph invocation，不结束工作流
- CLI 结束时可打印 handoff 摘要，但该摘要不反写到 `messages`。

### 6. 测试与验证

- 在 [package.json](D:/code/Ascend/package.json) 增加：
  - `"test": "node --import tsx --test src/workflows/advance/workflow.test.ts"`
- `workflow.test.ts` 只使用 `WorkflowModel` stub，不访问真实 API。
- 必测用例：
  - `normalize -> EMPTY` 只结束当前轮并提示重输
  - A 可多轮循环并转入 B/C
  - B 可多轮循环并转入 A/C
  - C 输出候选并进入 `await_c_intent`
  - C 下 `confirm` 正常结束并统一产出 handoff
  - C 下 `reject` 复用同轮输入重评，且 user message 不重复
  - `await_c_intent` 下回车/语气词只提醒，不改状态，不进 `recognizeIntent`
  - 任意时点显式退出，统一产出 handoff
- 实现后验证命令固定为：
  - `pnpm test`
  - `pnpm typecheck`
  - `pnpm build`
- 人工验收命令固定为：
  - `$env:DEEPSEEK_API_KEY='你的key'; pnpm dev`

## 本次不修改的范围

- 不做 UI
- 不做持久化
- 不做确认后的下游总结/建分支/调度
- 不改 [docs/architecture](D:/code/Ascend/docs/architecture)
- 不新增第 7 个业务节点
- 不把真实 DeepSeek 联网调用设为开发或测试前置条件

## 完成标准

- `messages` 不重复、不漏写，写入责任单点明确。
- `EMPTY` 只代表“当前轮无效”，不再与“工作流结束”混淆。
- `HandoffRecord` 只由 CLI 统一出口生成。
- `actionA/B/C` 都显式依赖 `normalizedQuery`、`currentState`、`messages`。
- 测试、类型检查、构建全部通过后，计划才算达到可直接编码程度。

## 默认假设

- `await_c_intent` 下的 filler 输入不进入对话转录，只保留提醒输出。
- `normalize=EMPTY` 的原始输入会进入转录，因为它已进入真实处理轮。
- 真实 DeepSeek 只影响人工验收，不影响本地开发闭环与自动化测试。
