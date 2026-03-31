import type { Node } from "./Node.ts";
import type { NodeTree } from "./NodeTree.ts";

/**
 * Rescan 当前只实现了最小“直接子节点重新启用”能力。
 *
 * 它还没有完整接入运行主链：
 * - 没有在 step / finish 后自动触发
 * - 没有把结果正式交还给 Scheduler
 * - 也没有更复杂的影响传播
 *
 * 所以这里体现的是一个可调用的最小工具，而不是 docs 中完整的回流机制。
 */
export interface RescanInput {
    sourceNodeId: string;
    nodes: readonly Node[];
    tree: readonly NodeTree[];
}

/** `RescanResult` 汇总受影响节点及其重新启用后的结果。 */
export interface RescanResult {
    sourceNodeId: string;
    affectedNodeIds: string[];
    affectedNodes: Node[];
    reenteredNodes: Node[];
}

/** 从树结构中收集某个源节点的直接子节点 ID。 */
function collectDirectChildren(tree: readonly NodeTree[], sourceNodeId: string): string[] {
    const result: string[] = [];

    const visit = (nodes: readonly NodeTree[]): void => {
        nodes.forEach((node) => {
            if (node.parentId === sourceNodeId) {
                result.push(node.nodeId);
            }

            if (node.children.length > 0) {
                visit(node.children);
            }
        });
    };

    visit(tree);

    return result;
}

/** 返回应视为受源节点影响的直接子节点 ID 列表。 */
export function getDirectlyAffectedNodeIds(input: RescanInput): string[] {
    return collectDirectChildren(input.tree, input.sourceNodeId);
}

/** 执行最小 Rescan：找出直接受影响节点并重新启用它们。 */
export function rescan(input: RescanInput): RescanResult {
    const affectedNodeIds = getDirectlyAffectedNodeIds(input);
    const affectedNodeIdSet = new Set(affectedNodeIds);
    const affectedNodes = input.nodes.filter((node) => affectedNodeIdSet.has(node.id));
    // 当前“重新纳管”只体现为重新启用节点，不改写内容。
    const reenteredNodes = affectedNodes.map((node) => ({
        ...node,
        activeStatus: "启用" as const,
    }));

    return {
        sourceNodeId: input.sourceNodeId,
        affectedNodeIds,
        affectedNodes,
        reenteredNodes,
    };
}
