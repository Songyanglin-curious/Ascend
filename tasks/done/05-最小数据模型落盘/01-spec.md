# 01-spec：最小 SQLite 持久化

## 摘要

- 本 spec 只定义“数据库优先”的当前批次：在保持当前 `NodeStore / TreeStore / TreeService` 上层语义不变的前提下，将节点、树关系、场景原始结果与候选确认记录持久化到 SQLite。
- 当前持久化方案固定为 `SQLite + better-sqlite3`，数据库路径固定为 `D:\db\sqlite\data\ascend.db`。
- 本 spec 不进入具体 SQL 语句、文件拆分、迁移脚本命名或测试命令，这些留到 `02-plan.md`。

## 目标与范围

本里程碑只解决 3 件事：

1. `nodes` 能保存真实节点内容，并在进程重启后仍可读取。
2. `tree_state / tree_relations` 能保存根节点与父子关系，并在进程重启后仍可读取。
3. `child_candidate_events` 能保存候选子节点确认结果，至少具备最小审计能力。

本里程碑范围内：

- 将当前内存态 `SceneNode` 持久化到 `nodes`
- 将当前根节点与父子关系持久化到 `tree_state / tree_relations`
- 将候选子节点的确认结果持久化到 `child_candidate_events`
- 保持现有 CLI 主路径和上层接口语义一致

本里程碑明确不做：

- 不做 UI
- 不做总结 Agent
- 不做 ORM
- 不重构现有表结构为另一套新模型
- 不做自动恢复到“执行中现场”
- 不做复杂查询优化
- 不做多用户会话

## 事实基础

- 当前仓库已存在基于内存的 `NodeStore / TreeStore / TreeService`
- 当前 `SceneNode` 至少包含：
  - `id`
  - `sceneType`
  - `sceneInput`
  - `executionStatus`
  - `rawResult`
  - `errorMessage`
  - `meta`
- 当前 `TreeStore` 只维护：
  - `rootNodeId`
  - `parentId`
  - `childrenIds`
- 当前系统已支持：
  - root node 执行
  - 子节点候选提取
  - 人工确认
  - 确认后创建真实 child node 并挂树
- 当前 AGENTS 约束已冻结持久化目标表为：
  - `nodes`
  - `tree_state`
  - `tree_relations`
  - `child_candidate_events`

## 核心设计原则

### 1. 存储层替换，不改业务层语义

- 上层继续通过 `NodeStore / TreeStore / TreeService` 工作。
- SQLite 只替换存储实现，不改变业务调用顺序。
- `executeSceneNode(...)`、候选确认流、批量挂树的行为语义保持不变。

### 2. 兼容现有表结构，不并行造第二套模型

- 持久化必须优先兼容既有 4 张表。
- 本里程碑不得新造“平行 nodes_v2 / tree_v2”一类结构。
- 是否需要补索引、迁移细节留到 plan。

### 3. 先保留完整原始信息，再谈复杂查询

- `sceneInput` 与 `rawResult` 在本里程碑只要求可完整保存与恢复。
- 本里程碑优先“可落盘、可读回、可审计”，不要求消息级复杂查询能力。

### 4. 树关系与节点内容继续分离

- `nodes` 保存节点真身。
- `tree_state / tree_relations` 保存树关系。
- `child_candidate_events` 保存候选确认事件。
- 不把树嵌套结构直接塞进 `nodes`。

## 持久化对象与语义契约

### 1. Node 持久化

系统必须能将一个真实 `SceneNode` 的最小语义持久化到 `nodes`，至少包括：

- 节点唯一标识
- `sceneType`
- `sceneInput`
- `executionStatus`
- `rawResult`
- `errorMessage`
- `meta.title`
- `meta.summary`
- `meta.sourceParentNodeId`
- `meta.sourceCandidateId`
- `meta.sourceCandidateType`

约束：

- `rawResult` 允许为空，仅当场景尚未完成或执行失败时为空。
- `errorMessage` 允许为空，仅当当前节点没有失败错误时为空。
- `meta` 必须保持显式空值语义，不能靠隐式缺省去猜业务含义。

### 2. Tree 持久化

系统必须能将树的最小语义持久化到 `tree_state / tree_relations`，至少包括：

- 当前根节点 id
- 每个节点的 `parentId`
- 子节点顺序

约束：

- 只有 1 个 root node。
- 子节点顺序必须可恢复，因为当前系统的 `childrenIds` 是有序的。
- `TreeStore` 对外仍继续表现为“关系层”，不是嵌套树视图层。

### 3. Child Candidate Event 持久化

系统必须能将候选子节点确认结果持久化到 `child_candidate_events`，至少表达：

- 事件唯一标识
- 来源父节点 id
- 候选本身的完整语义快照
- 该候选是否被确认选中

约束：

- 记录的是“候选确认事件”，不是“真实节点本身”。
- 候选快照必须能表达至少：
  - `title`
  - `summary`
  - `type`
  - `reason`
  - `evidence`
- 未选中的候选也应具备可审计记录。

## 运行时行为契约

### 1. 创建 root node

当系统创建 root node 时，必须完成以下最小时序：

1. 创建真实节点
2. 将节点写入 `nodes`
3. 将其设置为 `tree_state` 的 root
4. 将 root 关系写入 `tree_relations`

要求：

- 任一步失败都视为创建 root 失败。
- 不得对外伪造成“root 已存在但数据库未写全”。

### 2. 场景执行状态写回

当 `executeSceneNode(...)` 执行节点时，节点状态变化必须可持久化：

1. `idle -> running`
2. `running -> completed`，同时写入 `rawResult`
3. 或 `running -> failed`，同时写入 `errorMessage`

要求：

- `running`、`completed`、`failed` 都必须能在数据库中体现。
- `completed` 与 `failed` 的写回语义必须和当前内存实现保持一致。

### 3. 创建 child node 并挂树

当用户确认候选子节点后，最小时序固定为：

1. 创建真实 child node
2. 将 child node 写入 `nodes`
3. 将对应候选确认结果写入 `child_candidate_events`
4. 将 child node 挂到父节点下，写入 `tree_relations`

要求：

- 多选确认时，按用户确认顺序逐个创建与挂树。
- 父节点的子节点顺序必须与确认顺序一致。
- 不允许创建出 child node 却完全没有树关系。

### 4. 重启后的最小恢复能力

本里程碑要求的“恢复”只到以下程度：

- 进程重启后能重新读到既有 `nodes`
- 进程重启后能重新读到 `rootNodeId`
- 进程重启后能重新读到父子关系

本里程碑不要求：

- 自动恢复到中途执行现场
- 自动恢复终端交互
- 自动续跑未完成场景

## 模块边界

### 1. SQLite Store 层

负责：

- 读写 SQLite
- 将表记录映射为 `SceneNode` 和树关系语义
- 维持与当前 `NodeStore / TreeStore` 一致的对外行为

不负责：

- 场景业务判断
- 候选提取
- 总结生成

### 2. TreeService

继续负责：

- `createRoot`
- `createChild`
- `getChildren`

本里程碑不改变其业务职责，只改变底层持久化介质。

### 3. Child Candidate Flow

继续负责：

- 候选提取
- 人工确认
- 创建 child node

新增要求：

- 将确认结果写入 `child_candidate_events`

## 失败路径

### 1. 节点写入失败

- 视为创建或更新节点失败
- 错误必须显式抛出
- 不得静默回退到内存成功

### 2. 根关系写入失败

- 视为 root 创建失败
- 不得只写 `nodes` 而让 `tree_state / tree_relations` 缺失且继续运行

### 3. 子节点挂树失败

- 视为本次 child node 创建流程失败
- 不得伪造成“挂树成功”
- 是否做事务回滚留到 plan 决定

### 4. 候选事件写入失败

- 视为候选确认落盘失败
- 不得静默跳过 `child_candidate_events`

## 最小验收场景

### 1. root node 落盘

- 程序创建 root node 后，数据库中能看到 root 节点记录
- `tree_state` 中存在对应 root
- `tree_relations` 中存在 root 的关系记录

### 2. 场景结果落盘

- root node 执行完成后，数据库中能看到 `executionStatus=completed`
- 同一节点记录中能读回 `rawResult`

### 3. 失败状态落盘

- 节点执行失败后，数据库中能看到 `executionStatus=failed`
- 同一节点记录中能读回 `errorMessage`

### 4. child node 落盘与挂树

- 候选确认后，数据库中新增 child node
- `tree_relations` 中新增父子关系
- 父节点下能读到对应 child node

### 5. 多个 child node 顺序正确

- 多选确认多个候选后，数据库中存在多个 child node
- 恢复出的子节点顺序与用户确认顺序一致

### 6. 候选确认事件落盘

- 提取出的候选在确认结束后能在 `child_candidate_events` 中看到
- 已选候选与未选候选可被区分

### 7. 重启后可读

- 程序结束后重新启动
- 仍能从数据库中读回既有节点、根节点和树关系

## 默认假设

- 当前场景类型仍只有 `advance`
- `sceneInput` 与 `rawResult` 在本批次中允许以 JSON 文本或等价兼容方式存储
- 子节点候选事件在本里程碑中按“确认结束后统一落盘”处理即可
- 本 spec 只冻结行为与契约；具体 SQL、文件路径、事务边界、迁移步骤、测试命令放到 `02-plan.md`
