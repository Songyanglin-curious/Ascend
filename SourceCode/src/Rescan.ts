import type { Node } from "./Node.ts";
import type { NodeTree } from "./NodeTree.ts";

export interface RescanInput {
    sourceNodeId: string;
    nodes: readonly Node[];
    tree: readonly NodeTree[];
}

export interface RescanResult {
    sourceNodeId: string;
    affectedNodeIds: string[];
    affectedNodes: Node[];
    reenteredNodes: Node[];
}

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

export function getDirectlyAffectedNodeIds(input: RescanInput): string[] {
    return collectDirectChildren(input.tree, input.sourceNodeId);
}

export function rescan(input: RescanInput): RescanResult {
    const affectedNodeIds = getDirectlyAffectedNodeIds(input);
    const affectedNodeIdSet = new Set(affectedNodeIds);
    const affectedNodes = input.nodes.filter((node) => affectedNodeIdSet.has(node.id));
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
