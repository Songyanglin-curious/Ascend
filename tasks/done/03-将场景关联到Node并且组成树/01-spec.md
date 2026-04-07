# 01-spec：推进场景节点化与最小树承载

## 摘要

- 本 spec 只定义“推进场景”如何被封装为一个可挂载到项目级 `Node` 的独立执行单元，以及多个 `Node` 如何以最小树关系组织。
- 本 spec 不改“推进场景”内部 A/B/C 推进逻辑，不改现有 LangGraph 路由，只在其外层新增一层 `Node / Tree` 承载模型。
- 本 spec 中的 `Node` 指“项目内的场景承载节点”，不是 LangGraph 里的 graph node。两者必须明确区分。
- 本批只冻结最小契约：节点数据结构、节点最小时序、树关系结构、最小操作、异常边界、验收场景；具体文件拆分与函数命名留到 `02-plan.md`。

## 目标与范围

本批目标只有 3 个：

1. 将“推进场景”封装为一个可独立执行的 `Node`
2. 固定 `Node` 的最小时序：`进入节点` -> `执行推进场景` -> `返回场景原始结果` -> `节点结束`
3. 建立最小 `Tree` 承载能力，让多个 `Node` 以父子关系组织

本批范围内：

- `Node` 承载一个具体场景实例
- `Node` 能执行“推进场景”并保留场景原始输入输出
- `Tree` 只维护父子关系，不维护节点内容
- 支持以下最小操作：
  - `createNode`
  - `getNodeById`
  - `createRoot`
  - `createChild`
  - `getChildren`

本批明确不做：

- 不改“推进场景”内部业务行为
- 不改 CLI 交互规则
- 不做 UI
- 不做总结生成
- 不做自动派生新节点
- 不做人工路由或动态调度
- 不做复杂树操作，例如移动节点、删除整棵子树、重排
- 不做图结构扩展，当前只允许树
- 不做持久化，v1 仅要求内存内可运行

## 事实基础

- 当前仓库已经存在一个可独立运行的“推进场景”工作流，位于 `src/workflows/advance/`
- 该工作流已经有明确结束产物；对节点层来说，它属于“场景原始结果”
- 当前工作流状态里已经区分原始转录与分析上下文，这意味着节点层不应重新解释或重组场景输出
- 因此，本批的正确方向不是“重写推进场景”，而是“把推进场景包进一个更高层的 Node 执行壳”

## 核心概念

### 1. Scene

- `Scene` 指一个已经能独立执行并返回结果的业务场景
- 本批只关心一个场景：`advance`
- `Scene` 的内部实现对 `Node` 层透明；`Node` 只知道如何调用它，以及如何接住它返回的原始结果

### 2. Node

- `Node` 是“场景承载单元”
- 一个 `Node` 在 v1 只承载一个 `Scene`
- 一个 `Node` 不负责树关系维护；树关系在 `Tree` 中单独维护
- 一个 `Node` 必须保留：
  - 自己是谁
  - 自己承载哪个场景
  - 自己的场景启动输入
  - 自己最近一次执行状态
  - 自己最近一次场景原始结果

### 3. Tree

- `Tree` 是“父子关系索引”
- `Tree` 不保存节点业务内容
- `Tree` 只保存：
  - 根节点是谁
  - 某节点的 `parentId`
  - 某节点的 `childrenIds`
- 节点内容通过 `nodeId` 与 `Tree` 关联

### 4. Node 与 LangGraph 的边界

- `Node` 是项目级抽象，作用是承载一个场景实例并把它挂到树上
- LangGraph node 是“推进场景内部的流程节点”
- 本批新增的 `Node` 不能侵入式改写 `src/workflows/advance/graph.ts` 内部节点职责
- 正确边界是：
  - `advance` 工作流继续负责场景内部推进
  - `Node` 负责场景级挂载与执行
  - `Tree` 负责多个节点的父子组织

## 数据契约

### 1. 基础类型

```ts
type NodeId = string;
type SceneType = "advance";
type NodeExecutionStatus = "idle" | "running" | "completed" | "failed";
```

### 2. 场景原始结果

- 对本仓库当前 `advance` 场景，节点层要承接的“场景原始结果”就是场景退出时交出的原始结果对象
- v1 不允许节点层对该结果做总结、裁剪、重命名或再封装成别的业务结构
- 节点层唯一允许做的事是“原样保存”和“原样返回”

当前应冻结的是“语义”，不是具体实现类型名。

spec 层明确要求：

- 节点必须原样保存场景退出时交出的原始结果
- 节点必须原样返回该原始结果
- 该原始结果至少能表达以下 4 类语义：
  - 原始消息转录
  - 结束原因
  - 结束时状态
  - 最后一次助手输出

spec 层此处不强制绑定具体类型别名，例如不要求必须命名为 `HandoffRecord`。

### 3. 场景启动输入

- `Node` 需要保存“启动这个场景所需的输入”
- 这个输入是节点级启动输入，不等于场景运行过程中的完整用户转录
- 运行过程中形成的原始输入输出属于 `rawResult` 中的原始转录部分

v1 只要求存在一个明确的“场景启动输入”字段，具体字段形状可在 `02-plan.md` 定义，但必须满足：

- 能表达“这是一个 `advance` 场景节点”
- 能表达场景启动所需的最小参数
- 运行时依赖，例如 model、io、runtime，不应直接塞进持久节点内容

### 4. Node 最小结构

```ts
interface SceneNode {
  id: NodeId;
  sceneType: SceneType;
  sceneInput: AdvanceSceneStartInput;
  executionStatus: NodeExecutionStatus;
  rawResult: unknown | null;
  errorMessage: string | null;
}
```

约束：

- `id` 全局唯一
- `sceneType` 在本批固定为 `"advance"`
- `executionStatus` 初始值必须为 `idle`
- `rawResult` 初始值必须为 `null`
- `errorMessage` 初始值必须为 `null`
- `rawResult` 只在成功完成场景执行后写入
- `errorMessage` 只在失败时写入，且不得吞错
- `rawResult` 在 spec 层只表示“场景原始结果槽位”，具体类型名与字段名留到实现层确定

### 5. Tree 最小结构

```ts
interface TreeRelation {
  parentId: NodeId | null;
  childrenIds: NodeId[];
}

interface NodeTree {
  rootNodeId: NodeId | null;
  relations: Record<NodeId, TreeRelation>;
}
```

约束：

- `rootNodeId` 为 `null` 表示空树
- 根节点关系的 `parentId` 必须为 `null`
- 非根节点关系的 `parentId` 必须指向存在的父节点
- `childrenIds` 只保存直接子节点
- 同一个子节点在 v1 只能有一个父节点
- 同一个 `childId` 不得在同一父节点下重复出现
- `NodeTree` 是 `TreeStore` 的纯关系结构，不直接承载节点内容

## 节点执行契约

### 1. 节点执行职责

`Node` 执行层必须完成 4 件事：

1. 进入节点
2. 调用推进场景
3. 接住场景原始结果并原样返回
4. 完成节点收尾

### 2. 最小时序

必须严格遵守以下逻辑顺序：

1. `进入节点`
   - 校验节点存在
   - 校验节点承载的是 `advance` 场景
   - 校验节点当前允许被执行
   - 将 `executionStatus` 从 `idle` 改为 `running`
2. `执行推进场景`
   - 调用 `advance` 场景执行器
   - 节点层不得改写场景内部推进逻辑
3. `返回场景原始结果`
   - 拿到场景原始结果
   - 原样写入 `node.rawResult`
   - 该原始结果就是节点执行接口对外返回值
4. `节点结束`
   - 将 `executionStatus` 置为 `completed`
   - 清空 `errorMessage`

需要特别写明：

- “返回场景原始结果”指“节点执行接口对调用方返回的值就是场景原始结果本身”
- 节点层不能把原始结果替换成总结文本、树节点摘要或别的包装结构
- “节点结束”是节点执行生命周期结束，不是树生命周期结束

### 3. 失败路径

本批虽只做最小闭环，但失败路径必须明确：

1. 节点进入后，如果场景执行抛错：
   - `executionStatus` 必须改为 `failed`
   - `errorMessage` 必须写入明确错误文本
   - `rawResult` 保持 `null`
   - 错误继续向上抛出，不做静默 fallback
2. 若节点不存在、节点类型不支持、节点状态不允许执行：
   - 直接抛错
   - 不得伪造一个“空结果”

### 4. 可执行状态约束

v1 先冻结最小规则：

- 只允许 `idle` 节点进入执行
- `completed` 节点默认不支持重复执行
- `failed` 节点默认不支持自动重试

是否支持重跑，留到后续任务，不在本批处理

## Tree 关系契约

本节先冻结一个层次边界：

- `TreeStore` 只负责保存 `rootNodeId / parentId / childrenIds`
- `TreeStore` 是纯关系存储，不返回完整节点对象
- `TreeService` 是组合层，负责联动 `TreeStore + NodeStore`
- 对外暴露的 `createRoot / createChild / getChildren` 属于 `TreeService` 语义，不代表底层 `TreeStore` 直接返回节点内容

### 1. createRoot

语义：

- 这是 `TreeService` 的对外操作，用于在空树中设置根节点

约束：

- 只允许空树调用一次
- 根节点必须已经存在于 Node 存储中
- 调用成功后：
  - `rootNodeId = node.id`
  - `relations[node.id].parentId = null`
  - `relations[node.id].childrenIds = []`

### 2. createChild

语义：

- 这是 `TreeService` 的对外操作，用于在已有父节点下挂入一个已存在的子节点

约束：

- 父节点必须存在
- 子节点必须存在
- 树必须已存在根节点
- 子节点当前不能已有父节点
- 成功后：
  - `relations[childId].parentId = parentId`
  - `relations[parentId].childrenIds` 追加该 `childId`

### 3. getChildren

语义：

- 这是 `TreeService` 的对外操作，用于返回某节点的直接子节点

约束：

- 只返回直接子节点，不递归
- `TreeStore` 自身不直接返回节点对象；它只提供 `childrenIds` 这一层关系事实
- `getChildren` 的节点对象返回能力来自 `TreeService` 对 `TreeStore + NodeStore` 的组合读取
- `getChildren` 的对外返回值是直接子节点对象集合，不只返回 id
- 其查找方式必须是：
  - 先从 `TreeStore` 读取 `childrenIds`
  - 再通过 `NodeStore` 取回节点内容

### 4. getNodeById

语义：

- 通过 `id` 读取节点内容

约束：

- 只读取节点内容，不负责树关系推导
- 未命中时返回 `null` 或明确未找到结果；具体形式留到 `02-plan.md`

## 模块边界

### 1. Node 模块

Node 模块负责：

- 创建节点
- 通过 id 获取节点
- 执行节点承载的场景
- 维护节点执行状态与结果

Node 模块不负责：

- 父子关系组织
- 场景内部推进逻辑
- 场景结束后的下游总结或派生处理

### 2. TreeStore 模块

TreeStore 模块负责：

- 维护 `rootNodeId`
- 维护 `parentId / childrenIds`
- 落地根节点关系
- 落地子节点关系
- 提供纯关系读取能力，例如读取某节点的 `childrenIds`

TreeStore 模块不负责：

- 存储节点业务内容
- 执行节点
- 直接返回完整节点对象
- 决定下一步该挂哪个子节点

### 3. TreeService 模块

TreeService 模块负责：

- 组合 `TreeStore + NodeStore`
- 对外提供 `createRoot`
- 对外提供 `createChild`
- 对外提供 `getChildren`

TreeService 模块不负责：

- 改写节点内部业务内容
- 执行推进场景

### 4. advance 场景模块

advance 场景模块继续负责：

- 场景内部工作流
- 场景退出时的原始结果

advance 场景模块不负责：

- 节点 id 管理
- 树关系组织
- 节点执行状态管理

## 最小公共接口

本批 spec 至少冻结以下公共接口语义：

```ts
createNode(...)
getNodeById(...)
executeSceneNode(...) // 名称可在 02-plan 决定，但节点执行接口必须存在
createRoot(...)
createChild(...)
getChildren(...)
```

说明：

- `executeSceneNode(...)` 是节点化封装成立所必需的行为接口
- 即使最终函数命名不叫这个，`02-plan.md` 也必须明确“谁负责执行节点”
- `createRoot / createChild / getChildren` 在本 spec 中按 `TreeService` 对外接口理解，而不是 `TreeStore` 的原始存储接口

## 验收场景

### 1. 节点创建

- 能创建一个 `sceneType="advance"` 的节点
- 新节点初始状态为：
  - `executionStatus = idle`
  - `rawResult = null`
  - `errorMessage = null`

### 2. 节点执行成功

- 能对一个 `advance` 节点发起执行
- 执行顺序满足：
  - 进入节点
  - 执行推进场景
  - 返回场景原始结果
  - 节点结束
- 执行完成后：
  - `executionStatus = completed`
  - `rawResult` 被写入
  - 返回值即该 `rawResult`

### 3. 节点执行失败

- 若推进场景执行时报错：
  - `executionStatus = failed`
  - `errorMessage` 被写入
  - `rawResult = null`
  - 错误继续向上抛出

### 4. 树根节点创建

- 能在空树中创建根节点关系
- 空树之外再次创建根节点必须失败

### 5. 子节点挂载

- 能在已存在父节点下挂入一个子节点
- 成功后能同时看到：
  - 子节点的 `parentId`
  - 父节点的 `childrenIds`

### 6. 直接子节点查询

- 能通过 `TreeService.getChildren(parentId)` 取回直接子节点对象集合
- 不递归返回孙节点

### 7. 树与节点分离

- `Tree` 删除或不读取节点内容时，仍只持有关系索引
- `Node` 内容变化不会要求改写树结构字段以外的数据

## 默认假设

- v1 的 Node/Tree 为内存态结构，不做数据库持久化
- `advance` 场景原始结果沿用现有工作流的结束产物，不另造一套新结果结构
- 节点执行接口的运行时依赖采用注入方式，不把 model、io 一类环境对象直接存进节点内容
- 当前主结构只做树，不处理 DAG 或图关系
- 本 spec 只冻结行为与契约；具体文件、函数名、测试命令、实现步骤统一放到 `02-plan.md`
