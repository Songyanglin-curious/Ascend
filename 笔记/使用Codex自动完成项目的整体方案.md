
# 使用 Codex 自动完成项目的整体方案

## 1. 目标

这套方案的目标不是“让 AI 一次性把项目从 0 写到 100”，而是：

**当基础规则定义已经稳定后，让 Codex 在明确边界内，尽可能独立完成：细化、实现、测试、自审、修复。**

这里的前提很重要：

* 规则要先稳定
* 边界要先冻结
* 验收要先明确

一旦这三件事成立，Codex 的工作模式就不再是“聊天式辅助”，而会更接近 **长任务代理循环** ：先计划，再改代码，再跑测试 / 构建，再观察结果，再修复失败，再更新状态，然后重复。官方对 Codex 长任务的描述就是这个循环。([OpenAI 开发者](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex/?utm_source=chatgpt.com "Run long horizon tasks with Codex"))

## 2. 总体工作模式

整体上，Codex 在这个项目里分成三层工作面：

### 2.1 主施工面：Codex CLI

CLI 负责在本地仓库里真正落代码。
它适合当前项目，因为它的核心能力就是：

* 读仓库
* 改文件
* 跑命令
* 在当前目录持续迭代。([developers.openai.com](https://developers.openai.com/codex/cli/))

### 2.2 监督面：Codex App

App 不负责主施工，而负责：

* 并行线程
* 长任务观察
* diff review
* 多代理分工监督

官方对 Codex App 的定位就是多代理并行、项目线程、worktree、automations 和 Git 功能。([OpenAI](https://openai.com/index/introducing-the-codex-app/?utm_source=chatgpt.com "Introducing the Codex app"))

### 2.3 工作流面：Skills

Skills 负责把规则变成可复用工作流。
也就是说，51 / 52 / 53 / 54 不是只给人看的，
而是要被进一步压成：

* 实现 skill
* 验收 skill
* 边界检查 skill

官方文档里，skills 就是可复用 workflow bundle，且在 CLI、IDE extension、App 里都能用。([OpenAI 开发者](https://developers.openai.com/codex/app/features/?utm_source=chatgpt.com "Features – Codex app"))

## 3. 你这个项目最适合的 Codex 组织方式

我不建议你用“一个大 prompt + 一个 Codex 会话”搞完整个项目。
更合适的是：

### 3.1 一个仓库

仓库里固定放四类东西：

* `docs/`：冻结规则
* `skills/`：Codex 工作流
* `src/`：真实实现
* `tests/`：验收与反向验证

### 3.2 五个施工批次

Codex 只按批次推进：

1. Project 内部最小内核
2. 上层组织外壳
3. Round 最小承接
4. 最小协同与升格
5. 生命周期最小语义

这五批不是拍脑袋，而是按依赖顺序排的。
这样做的好处是：Codex 每次只需要解决一个收敛问题，不会一上来把系统写散。

### 3.3 三个并行角色

每个批次里，Codex 分成三个角色：

* **实现者** ：真正写代码
* **验收者** ：对照 54 检查是否通过
* **边界审查者** ：检查有没有混层和越界

其中：

* 实现者优先用 CLI
* 验收者和边界审查者更适合放到 App 的并行线程里

这样你就不再手动盯每一行代码，
你只需要在每批结束时做一次：

**通过 / 不通过裁决。**

## 4. 为什么这套方案能比“人工盯着 AI”更自动

因为它利用的不是单次提示词，而是 Codex 的三种正式能力：

### 4.1 长任务循环

Codex 官方已经明确强调：长任务的关键不是一个巨型 prompt，而是计划—编辑—运行工具—观察—修复—更新状态的循环。([OpenAI 开发者](https://developers.openai.com/blog/run-long-horizon-tasks-with-codex/?utm_source=chatgpt.com "Run long horizon tasks with Codex"))

### 4.2 多代理并行

Codex App 官方支持多代理并行、项目线程和长任务监督。
这意味着“实现”和“审查”不需要塞进同一个代理。([OpenAI](https://openai.com/index/introducing-the-codex-app/?utm_source=chatgpt.com "Introducing the Codex app"))

### 4.3 Skills 固化流程

当技能存在后，Codex 不再每次都从零理解你的规则，而是按技能描述和引用资料去触发对应工作流。

所以这套方案的自动化程度，来自：

**固定边界 + 固定批次 + 固定技能 + 固定验收**

而不是来自“让 AI 自由发挥”。

## 5. 这套方案里，人还要做什么

如果规则已经冻结，那么人后续不该再当“主施工员”，而应退到三个动作：

1. **定义批次入口**
   告诉 Codex 当前只做哪一批
2. **处理真正的产品判断题**
   例如边界口径、概念冲突、取舍问题
3. **做阶段裁决**
   看 54 是否通过，看边界是否守住，然后决定是否进入下一批

也就是说，理想状态下：

* AI 负责细化、实现、测试、自审
* 人负责边界、取舍、裁决

## 6. 当前建议的模型与使用方式

官方目前对 Codex 的建议是：大多数任务从 `gpt-5.4` 开始，轻量子任务再用 `gpt-5.4-mini`。([OpenAI 开发者](https://developers.openai.com/codex/models/?utm_source=chatgpt.com "Codex Models"))

所以在你这个项目里，我建议：

* **主实现任务** ：`gpt-5.4`
* **轻量补丁 / 小修复 / 辅助检查** ：`gpt-5.4-mini`

如果后面你要尝试更强的并行分工，也可以进一步用 Codex 的 subagents / 多线程能力，但 1.0 当前阶段不必一开始就上复杂编排。([OpenAI 开发者](https://developers.openai.com/codex/subagents/?utm_source=chatgpt.com "Subagents – Codex"))

## 7. 当前阶段的真正自动化上限

如果前置文档已经稳定到现在这个程度，
那 Codex 当前最现实的自动化上限是：

* 自己读规则
* 自己按批次写代码
* 自己跑测试
* 自己对照 54 做基本验收
* 自己修复同批次问题
* 自己更新当前批次状态

但它还不适合完全接管：

* 产品边界改写
* 需求再定义
* 高层概念重构
* 超出 51 / 52 / 53 / 54 的新方向决策

所以这套方案的核心不是“全自动”，
而是：

**高自动施工 + 低频人工裁决。**

## 8. 当前结论

这套项目如果要用 Codex 自动完成，正确方式不是：

* 一个会话从头写到尾
* 一大段 prompt 全包
* 人全程盯着逐步改

而是：

**Codex CLI 主施工，Codex App 并行监督，Skills 固化工作流，51/52/53/54 作为边界、顺序、输入和验收的统一约束，按批次推进。**
