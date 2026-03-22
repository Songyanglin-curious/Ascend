# Temporal 

## 名称中英文对照

| 英文             | 中文          |
| ---------------- | ------------- |
| durable          | 持久          |
| reliable         | 可靠          |
| scalable         | 可扩展        |
| Event History    | 事件历史      |
| Timer / Schedule | 计时器 / 调度 |
| Schedule         | 计划调度      |

## 笔记随笔

### Durable Execution  持久执行

所谓的持久执行非程序的持久执行而是流程的持久执行 **即使执行过程中发生故障，只要逻辑上仍可继续，流程就能从已有进度继续推进**。

### Workflow  工作流

编排层  负责稳定地描述流程推进逻辑

一系列步骤  类比于计划书

Workflow = 一份“可被执行、可被恢复、可持续推进”的流程定义

### Workflow Execution 工作流执行

按Workflow实际展开的一次执行过程

### Activities  活动

执行层   负责和不稳定的外部世界打交道

Activity = 工作流里一个具体干活的步骤 / 可执行工作单元

**Activity 是一个普通函数或方法，用来执行一个单一、定义清晰的动作** ，比如调用其他服务、发邮件、转码文件；而且  **Activity 代码可以是非确定性的** 。

### SDK 软件开发工具包


## Temporal Service  Temporal 服务

Temporal Service = 负责保存流程历史、协调任务分发、推进状态流转、支撑故障恢复、提供可见性的后台中枢。

Temporal Service = 调度中心 + 历史账本 + 流程协调中枢

## Workers  工作者

Worker = 轮询 Temporal Service、接收任务并执行 Workflow/Activity 代码的应用进程。

## Visibility  可见性

面向流程实例集合的查询与观测能力。

### Event History  事件历史

一个完整且持久的日志，记录了 Workflow 执行生命周期中发生的一切，以及 Temporal Service 在重放期间持久化事件的能力。

Temporal 的 Event History，本质上是在记录“恢复执行状态所需的最小充分信息”。

记录关键动作 + 动作结果 + 状态变化

* 发起了什么动作
* 动作是否完成/失败
* 返回了什么结果
* 流程状态如何变化
