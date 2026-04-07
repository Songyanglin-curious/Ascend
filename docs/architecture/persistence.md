## 最小持久化表结构

当前最小持久化层采用 SQLite（`better-sqlite3`），包含 4 张表：

1. `nodes`
2. `tree_state`
3. `tree_relations`
4. `child_candidate_events`

### 表职责

#### `nodes`

存储节点主体数据，对应当前 `SceneNode`。
保存场景输入、执行状态、原始结果、错误信息，以及节点元信息与来源信息。

#### `tree_state`

存储当前整棵树的全局状态。
当前仅保存 `root_node_id`，对应现在的树根节点引用。

#### `tree_relations`

存储树关系本身。
使用 `parent_id + position` 表达父子关系与子节点顺序，不在 `nodes` 表中冗余保存 `childrenIds`。

#### `child_candidate_events`

存储候选子节点事件。
用于记录某个父节点下产生过哪些候选项、是否被选中，给后续审计、页面展示、总结 Agent 保留原始依据。

### 设计约束

- `scene_input` 与 `raw_result` 先以 JSON 文本落盘。
- 当前优先保证完整保留与结构贴合，不提前为复杂查询拆表。
- 后续若出现稳定查询需求，再考虑将高频字段从 JSON 中提取。

### 当前选择理由

- 与现有代码结构最贴合，改造成本最低。
- 能完整保留 `AdvanceSceneRawResult`，避免过早拆碎结构。
- 便于后续总结、审计、回放直接读取原始结果。
- 树主体、树状态、树关系、候选事件四类信息边界清晰，便于逐步演进。
