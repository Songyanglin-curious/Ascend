**最小数据模型落盘**
目标：先把“节点、树关系、场景结果”存下来。只做：

- `nodes`
- `tree_relations`
- `scene_results` 或把 `rawResult` 直接挂在 `nodes`
- `node.meta`

先不做：

- 页面
- 总结 Agent
- 多用户
- 复杂查询优化

验收：

- 创建 root node 后数据库里能看到
- 候选确认后创建的 child node 和父子关系能落盘
- 重启进程后数据还在
