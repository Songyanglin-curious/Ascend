# 01-spec：数据库迁移与版本管理

## 摘要

- 本里程碑只解决一个问题：让 SQLite schema 能被显式识别版本、按顺序迁移，并在旧库启动时自动升级到当前代码所需结构。
- 当前持久化方案固定为 `SQLite + better-sqlite3`，数据库路径继续固定为 `D:\db\sqlite\data\ascend.db`。
- 本 spec 冻结迁移行为与契约，不进入文件拆分、具体 SQL 组织方式、测试命令与实现步骤，这些留到 `02-plan.md`。

## 目标与范围

本里程碑只覆盖以下能力：

1. 数据库必须有可读取的 schema 版本信息。
2. 应用启动时必须先检查版本，再决定是否执行迁移。
3. 旧库必须能自动迁移到当前版本，不要求人工先手改表。
4. 当前已知的旧结构 `child_candidate_events` 缺少 `candidate_id` 时，必须能被自动修复。

本里程碑范围内：

- 给现有 SQLite 数据库增加版本管理语义
- 为现有 4 张业务表建立“当前版本结构”的冻结定义
- 支持从无版本旧库迁移到当前版本
- 支持空库初始化到当前版本
- 保持现有 `NodeStore / TreeStore / TreeService` 与 CLI 主流程业务语义不变

本里程碑明确不做：

- 不改持久化方案
- 不引入 ORM
- 不改多棵树模型
- 不改 `advance` 工作流业务逻辑
- 不做页面
- 不做总结 Agent
- 不做复杂数据修复工具

## 事实基础

- 当前系统已经通过 SQLite 运行主流程，而不是只使用内存 store。
- 当前数据库主表仍以以下 4 张表为准：
  - `nodes`
  - `tree_state`
  - `tree_relations`
  - `child_candidate_events`
- 当前已知旧库问题：`child_candidate_events` 可能缺少 `candidate_id` 列。
- 当前代码已经按“存在 `candidate_id`”的结构在写入 `child_candidate_events`。

## 核心设计原则

### 1. 先判版本，再碰业务表

- 应用启动后，任何 `NodeStore / TreeStore / ChildCandidateEventStore` 的读写之前，必须先完成 schema 检查与必要迁移。
- 不允许业务写入阶段才因缺列、缺表而失败。

### 2. 迁移是启动路径的一部分，不是手工运维前置条件

- 空库启动时，系统应自动完成初始化。
- 旧库启动时，系统应自动完成迁移。
- 本里程碑完成后，正常用户不应依赖手工 `ALTER TABLE` 或手工删表来匹配代码版本。

### 3. 迁移按版本顺序执行，不跳步

- schema 版本必须是单调递增的显式值。
- 若数据库版本落后，必须按既定顺序逐步迁移到目标版本。
- 不允许“直接猜测当前库看起来像哪个版本”然后跳过中间语义。

### 4. 迁移失败必须显式中断

- 任一迁移失败都视为数据库初始化失败。
- 失败时必须显式抛错并阻止主流程继续运行。
- 不允许静默忽略迁移错误，不允许回退到内存模式继续跑。

## 版本语义契约

### 1. Schema Version

- 数据库必须存在单独的 schema 版本语义承载。
- schema 版本至少要能表达：
  - 当前数据库版本
  - 当前代码期望的目标版本
- 空库初始化后，数据库版本必须直接落到“当前目标版本”。

### 2. 旧库识别

- 若数据库中不存在显式 schema 版本信息，但业务表已经存在，则视为旧版本数据库。
- 旧版本数据库必须进入迁移路径，而不是当作全新空库覆盖重建。

### 3. 当前目标版本

- 本里程碑需冻结一个“当前目标版本”，其业务含义至少包括：
  - `nodes` 可被当前 SQLite NodeStore 正常读写
  - `tree_state` 可被当前 SQLite TreeStore 正常读写
  - `tree_relations` 可被当前 SQLite TreeStore 正常读写
  - `child_candidate_events` 至少包含当前代码要求的 `candidate_id`

## 表结构语义冻结

### 1. nodes

当前版本的 `nodes` 必须能表达：

- 节点唯一标识
- `scene_type`
- `scene_input_json`
- `execution_status`
- `raw_result_json`
- `error_message`
- `meta_title`
- `meta_summary`
- `source_parent_node_id`
- `source_candidate_id`
- `source_candidate_type`

本里程碑不新增新的业务语义字段。

### 2. tree_state

当前版本的 `tree_state` 必须继续表达：

- 单树模式下唯一 root 的引用

本里程碑不扩展为多棵树管理。

### 3. tree_relations

当前版本的 `tree_relations` 必须继续表达：

- `node_id`
- `parent_id`
- `position`

并保持能恢复父子顺序。

### 4. child_candidate_events

当前版本的 `child_candidate_events` 必须至少表达：

- 事件唯一标识
- `parent_node_id`
- `candidate_id`
- `candidate_json`
- `selected`
- `created_at`

其中 `candidate_id` 是当前版本冻结要求，不再允许缺失。

## 迁移行为契约

### 1. 空库初始化

当数据库文件不存在或不存在业务表时：

1. 系统创建版本承载结构
2. 系统创建当前版本所需业务表
3. 系统把 schema 版本写为当前目标版本
4. 之后业务主流程才允许继续

### 2. 旧库迁移

当数据库存在旧业务表但版本信息缺失或版本落后时：

1. 系统识别当前数据库版本
2. 系统按顺序执行迁移
3. 所有迁移完成后写入最新 schema 版本
4. 之后业务主流程才允许继续

### 3. 已知旧结构迁移

本里程碑至少必须支持以下迁移语义：

- `child_candidate_events` 旧结构没有 `candidate_id`
- 迁移后该表必须拥有 `candidate_id`
- 迁移完成后，当前代码对 `child_candidate_events` 的写入不能再因缺列失败

本 spec 只冻结结果，不冻结具体 SQL 方案。是否采用补列、建新表搬迁再替换，留到 plan 决定。

### 4. 幂等性

- 对已经处于当前目标版本的数据库重复启动，不应重复改表。
- 重复执行初始化/迁移入口，应得到稳定结果。

## 运行时时序

应用启动时，最小时序固定为：

1. 打开 SQLite 连接
2. 执行 schema 检查
3. 必要时执行迁移
4. 确认数据库已处于当前目标版本
5. 创建 SQLite store
6. 才允许进入 root 检查、场景执行、候选确认等业务流程

## 失败路径

### 1. 版本检查失败

- 视为数据库初始化失败
- 必须直接抛错
- 不允许继续主流程

### 2. 单步迁移失败

- 视为整体迁移失败
- 必须直接抛错
- 不允许写入“已升级完成”的版本号

### 3. 迁移后结构仍不满足目标版本

- 视为迁移失败
- 必须阻止业务继续运行

### 4. 不受支持的未来版本

- 若数据库版本高于当前代码支持的目标版本，必须显式失败
- 不允许当前旧代码擅自操作未来版本数据库

## 最小验收场景

### 1. 空库初始化

- 空库首次启动可自动建到当前目标版本
- 启动后业务主流程可继续

### 2. 旧库自动迁移

- 旧库首次启动时自动迁移
- 迁移完成后业务主流程可继续

### 3. child_candidate_events 缺列修复

- 对缺少 `candidate_id` 的旧表执行迁移后，表结构满足当前代码要求
- 候选确认写入不再报“no column named candidate_id”

### 4. 幂等启动

- 已完成迁移的数据库再次启动，不重复执行破坏性改表

### 5. 主流程语义不变

- `executeSceneNode` 仍可运行
- 候选确认与批量挂树仍可运行
- CLI 主流程业务语义不因迁移层而改变

## 默认假设

- 当前数据库仍处于单树模式
- 当前唯一必须覆盖的已知旧版本差异是 `child_candidate_events` 缺少 `candidate_id`
- 本里程碑只要求最小版本管理与最小迁移能力，不要求通用数据库运维框架
- 具体迁移脚本数量、版本号命名与文件组织方式，放到 `02-plan.md`
