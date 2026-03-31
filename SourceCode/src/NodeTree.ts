/** NodeTree 描述 Project 内部节点之间的树关系。 */
export interface NodeTree {
    /** 当前节点 ID */
    nodeId: string;

    /** 父节点 ID，根节点为 null */
    parentId: string | null;

    /** 同级顺序 */
    order: number;

    /** 子节点列表 */
    children: NodeTree[];

    /** 最近一次最小推进的 StepRecord ID，用于 Tree 层承接回写 */
    currentStepRecordId?: string | null;
}
