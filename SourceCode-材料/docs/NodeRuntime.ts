export type NodeMode = string | null;

export interface NodeRuntime {
    /** 关联的节点 ID */
    nodeId: string;

    /** 当前处于场景工作流的哪个 mode */
    currentMode: NodeMode;

    /** 是否正在等待人工介入 */
    isWaitingHuman: boolean;
}