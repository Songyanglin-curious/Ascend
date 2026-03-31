/** `NodeStatus` 表示节点当前所处的推进阶段。 */
export type NodeStatus = "未开始" | "进行中" | "已冻结" | "已完成";
/** `NodeActiveStatus` 表示节点当前是否纳入调度范围。 */
export type NodeActiveStatus = "启用" | "停用";

/**
 * Node 是 Project 内部最小内容承载体。
 *
 * 当前实现把一个节点压成“当前内容快照”：
 * - raw: 节点级原始材料
 * - summary / conclusion / next: 当前可继续承接的结果面
 * - status / activeStatus: 当前推进资格与推进阶段
 *
 * 注意：
 * 这里还没有实现 docs 中提到的 NodeRuntime，也还没有把 raw 扩展成
 * “完整多轮原始对话体”。因此本文件反映的是当前代码的实际承接方式，
 * 不代表最终已经满足设计文档中的全部运行规则。
 */
export interface Node {
    /** 节点唯一标识 */
    id: string;

    /** 本轮节点的常见场景，例如：思考、学习、写作等 */
    scenario: string;

    /** 节点标题：当前在推进什么 */
    title: string;

    /** 原始内容：最完整、可追溯的原始材料 */
    raw: string;

    /** 总结：高信息密度、较高信息完整性的节点承接内容 */
    summary: string;

    /** 当前结论：目前已经可以暂时成立的判断 */
    conclusion: string;

    /** 下一步：下一轮最小推进入口 */
    next: string;

    /** 节点当前状态 */
    status: NodeStatus;

    /** 节点是否启用 */
    activeStatus: NodeActiveStatus;
}
