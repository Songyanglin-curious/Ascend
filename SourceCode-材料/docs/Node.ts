export type NodeStatus = "未开始" | "进行中" | "已冻结" | "已完成";
export type NodeActiveStatus = "启用" | "停用";

export interface Node {
    /** 节点唯一标识 */
    id: string;

    /** 本轮节点的常见比如：思考 学习 写作 等等 */
    scenario: string;

    /** 节点标题：当前在推进什么 */
    title: string;

    /** 原始内容：最完整、可追溯的原始材料 */
    raw: string;

    /** 总结：高信息密度、较高信息完整性的节点承接内容。
它有压缩，但压缩目标只是剔除噪音、重复、无价值信息，不是主动降低信息密度。适合复用/整理资料 */
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