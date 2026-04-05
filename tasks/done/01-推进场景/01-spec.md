# 方案：推进场景最小可运行闭环

## 摘要

* 目标文件定为 **tasks/active/01-spec.md**，内容只冻结“推进场景”最小闭环的行为、状态、输入输出契约与验收标准，不进入文件级实现方案。
* spec 以 **00-task.md**、**tasks/active** 下的 6 个节点说明、**docs/architecture/问题状态划分.md**、**docs/architecture/问题分析.md**、**docs/architecture/提示词规则.md** 为事实来源。
* 当前仓库虽然已安装 **@langchain/langgraph**、**openai**，但现有 **index.js** 入口无法运行，缺少 **requests/deepseekService.ts**。因此 spec 必须按“当前无可复用运行骨架”来写，不能假设已有可启动流程。

## 01-spec.md 应写定的内容

* **文档目标与范围**

  * 本工作流一次只推进一个核心问题。
  * 只做命令行纯文本闭环。
  * 不做 UI，不强制 JSON，不实现确认后的下游处理逻辑本体。
* **核心概念**

  * 明确区分“问题状态”与“流程阶段”。
  * 问题状态只允许 **A / B / C / null**。
  * 流程阶段只允许 **normal / await_c_intent / ended**。
* **全局状态契约**

  * **AgentState** 按 **00-task.md** 提供的字段原样冻结，不在 spec 阶段扩写业务默认值。
  * 终态交接信息单独定义为 **HandoffRecord**，不塞进 **AgentState**。
  * 退出判断发生在工作流外层、优先级高于节点路由、只接受“明确结束当前工作流”的表达，避免把普通否定误判成退出。
* **节点职责与输出契约**

  * **normalizeInputNode**：只做清洗归一化，输出整理后的文本或 **EMPTY**。
  * **evaluateStateNode**：只判 **A / B / C**，不对用户说话，不给建议。
  * **actionANode**：输出 **当前捕捉 / 当前区分 / 唯一追问**。
  * **actionBNode**：输出 **当前问题 / 关键判断 / 局部展开点**。
  * **actionCNode**：输出 **当前问题 / 候选方向 / 优先候选 / 确认提示**。
  * **recognizeIntentNode**：只在 C 后触发，只输出 **confirm** 或 **reject**。
  * 必须写明：**evaluate** 与 **action** 绝对分离，A/B/C 动作节点不自行判态。
  * 必须写明：核心分析规则采用“共享分析契约 + 核心节点增量约束”的方式组织。
* **轮次路由规则**

  * 每一轮用户输入先走“全局明确退出”判断；若命中，直接结束并产出交接记录。
  * **phase=normal** 时：**normalize -> EMPTY 判断 -> evaluate -> actionA/B/C**。
  * **normalize=EMPTY** 时，不进入 **evaluate**，系统只提示重新输入。
  * **actionC** 执行后必须把 **phase** 置为 **await_c_intent**，等待用户确认或打回。
  * **phase=await_c_intent** 时：下一条用户输入先做退出判断,C 后等待确认时，用户只回车/只发语气词,就提醒用户明确表达，再进 **recognizeIntentNode**。
  * **recognizeIntent=confirm** 时：工作流结束，产出交接记录。
  * **recognizeIntent=reject** 时：把 **currentState** 清为 **null**，并复用“同一条用户输入”继续走 **normalize -> evaluate -> action**，不要求用户再补一轮输入。
  * 必须写明：A/B/C 之间无强制顺序，每轮都以重新评估结果为准。
* **上下文与记录规则**

  * **messages** 只保留原始用户输入和面向用户的 assistant 输出，控制结果可单独记入运行日志，不进入对话转录。
  * **EMPTY**、**A/B/C**、**confirm/reject** 这类控制结果不写入对话转录，只用于流程控制。
  * **lastAssistantOutput** 始终保存最近一次面向用户的输出，供续轮和结束交接使用。
* **CLI 最小闭环**

  * spec 只要求存在一个命令行交互闭环：读取纯文本、打印当前输出、在结束时打印或返回交接结果。
  * spec 不定义具体目录结构，不定义具体命令，留到 **02-plan.md**。
* **结束与交接**

  * **WorkflowEndReason** V1 固定为 **confirm | explicit_exit**。
  * **HandoffRecord** V1至少包含：完整转录、结束原因、最终 **currentState**、**lastAssistantOutput**。
  * v1 只要求“交出原始记录”，不要求实现总结、建分支、后续场景调度。

## spec 中应明确的公共接口

* **AgentState**
* **ProblemState = "A" | "B" | "C" | null**
* **Phase = "normal" | "await_c_intent" | "ended"**
* **WorkflowEndReason = "confirm" | "explicit_exit"**
* **HandoffRecord**
  * **messages**
  * **endReason**
  * **currentState**
  * **lastAssistantOutput**

## spec 中必须列出的验收场景

* 无效输入或只有语气词时，**normalizeInputNode** 输出 **EMPTY**，系统要求重新输入。
* A 路径可多次循环，且后续可重新评估到 B 或 C。
* B 路径可多次循环，且后续可重新评估到 A 或 C。
* C 路径必须给出少量可比较候选、推荐候选与确认提示。
* 在 **await_c_intent** 下，用户明确确认时正常结束。
* 在 **await_c_intent** 下，用户补充前提、质疑或要求继续展开时，必须判为 **reject**，并把同轮输入带回重评。
* 用户在任意时点明确退出，都能直接结束并产生交接记录。
* 整个流程可在 CLI 环境下走通。

## 默认假设

* 目标文件名采用 **tasks/active/01-spec.md**，不是仓库根目录泛化的 **spec.md**。
* 全局退出采用工作流外层的显式退出判断，不新增第 7 个业务节点。
* spec 只冻结行为与契约；具体文件列表、模块命名、验证命令、测试实现方式统一放到 **02-plan.md**。
* 入口为  src\index.ts
