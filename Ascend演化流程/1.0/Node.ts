export type NodeStatus = "未开始" | "进行中" | "已冻结" | "已完成";
export type NodeActiveStatus = "启用" | "停用";

export interface Node {
    /** 节点唯一标识 */
    id: string;

    /** 节点标题：当前在推进什么 */
    title: string;

    /** 原始内容：最完整、可追溯的原始材料 */
    raw: string;

    /** 总结：中等信息密度的承接内容，适合复用/整理资料 */
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