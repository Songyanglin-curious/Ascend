export interface NodeTree {
    /** 当前节点 ID */
    nodeId: string;

    /** 父节点 ID；根节点为 null */
    parentId: string | null;

    /** 同级顺序 */
    order: number;

    /** 子节点列表 */
    children: NodeTree[];
}