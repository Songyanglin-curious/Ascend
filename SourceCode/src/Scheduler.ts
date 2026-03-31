import type { Node, NodeStatus } from "./Node.ts";
import type { NodeTree } from "./NodeTree.ts";

export interface SchedulerInput {
    nodes: readonly Node[];
    tree: readonly NodeTree[];
    currentNodeId?: string | null;
    manualNodeId?: string | null;
    focusNodeId?: string | null;
    currentScenario?: string | null;
    allowFrozenNodeIds?: Iterable<string>;
}

export interface SchedulerCandidate {
    node: Node;
    treeOrder: string;
    distanceToFocus: number;
    nextScore: number;
    scenarioScore: number;
    statusScore: number;
}

export interface SchedulerResult {
    candidates: Node[];
    orderedCandidates: Node[];
    currentNode: Node | null;
}

interface TreeIndex {
    parentId: string | null;
    orderPath: number[];
}

const STATUS_SCORE: Record<NodeStatus, number> = {
    "进行中": 3,
    "未开始": 2,
    "已冻结": 1,
    "已完成": 0,
};

function normalizeAllowFrozenNodeIds(allowFrozenNodeIds: Iterable<string> | undefined): Set<string> {
    return new Set(allowFrozenNodeIds ? Array.from(allowFrozenNodeIds) : []);
}

function buildTreeIndex(tree: readonly NodeTree[]): Map<string, TreeIndex> {
    const index = new Map<string, TreeIndex>();

    const visit = (node: NodeTree, path: number[]): void => {
        const orderPath = [...path, node.order];
        index.set(node.nodeId, {
            parentId: node.parentId,
            orderPath,
        });

        node.children.forEach((child) => visit(child, orderPath));
    };

    tree.forEach((root, rootIndex) => visit(root, [rootIndex]));

    return index;
}

function compareOrderPath(left: number[], right: number[]): number {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const leftValue = left[index] ?? -1;
        const rightValue = right[index] ?? -1;
        if (leftValue !== rightValue) {
            return leftValue - rightValue;
        }
    }
    return 0;
}

function getDistanceBetweenNodes(
    leftId: string,
    rightId: string,
    index: Map<string, TreeIndex>,
): number {
    if (leftId === rightId) {
        return 0;
    }

    const leftDepths = new Map<string, number>();
    let currentLeft: string | null = leftId;
    let leftDepth = 0;
    while (currentLeft) {
        leftDepths.set(currentLeft, leftDepth);
        currentLeft = index.get(currentLeft)?.parentId ?? null;
        leftDepth += 1;
    }

    let currentRight: string | null = rightId;
    let rightDepth = 0;
    while (currentRight) {
        const leftDepthAtAncestor = leftDepths.get(currentRight);
        if (typeof leftDepthAtAncestor === "number") {
            return leftDepthAtAncestor + rightDepth;
        }

        currentRight = index.get(currentRight)?.parentId ?? null;
        rightDepth += 1;
    }

    return leftDepth + rightDepth;
}

function getScenarioScore(nodeScenario: string, currentScenario: string | null | undefined): number {
    if (!currentScenario) {
        return 0;
    }

    if (nodeScenario === currentScenario) {
        return 2;
    }

    if (nodeScenario.includes(currentScenario) || currentScenario.includes(nodeScenario)) {
        return 1;
    }

    return 0;
}

function getNextScore(node: Node): number {
    return node.next.trim().length > 0 ? 1 : 0;
}

function isFrozenAllowed(nodeId: string, allowFrozenNodeIds: Set<string>): boolean {
    return allowFrozenNodeIds.has(nodeId);
}

export function isCandidateNode(node: Node, allowFrozenNodeIds?: Iterable<string>): boolean {
    const allowFrozenNodeIdSet = normalizeAllowFrozenNodeIds(allowFrozenNodeIds);

    if (node.activeStatus !== "启用") {
        return false;
    }

    if (node.status === "已完成") {
        return false;
    }

    if (node.status === "已冻结" && !isFrozenAllowed(node.id, allowFrozenNodeIdSet)) {
        return false;
    }

    return true;
}

export function filterCandidateNodes(
    nodes: readonly Node[],
    allowFrozenNodeIds?: Iterable<string>,
): Node[] {
    return nodes.filter((node) => isCandidateNode(node, allowFrozenNodeIds));
}

function scoreNode(
    node: Node,
    input: SchedulerInput,
    index: Map<string, TreeIndex>,
    focusNodeId: string | null,
): SchedulerCandidate {
    const treeIndex = index.get(node.id);
    const treeOrder = treeIndex ? treeIndex.orderPath.join(".") : `9999.${node.id}`;
    const distanceToFocus = focusNodeId ? getDistanceBetweenNodes(node.id, focusNodeId, index) : Number.MAX_SAFE_INTEGER;

    return {
        node,
        treeOrder,
        distanceToFocus,
        nextScore: getNextScore(node),
        scenarioScore: getScenarioScore(node.scenario, input.currentScenario),
        statusScore: STATUS_SCORE[node.status],
    };
}

function compareCandidates(left: SchedulerCandidate, right: SchedulerCandidate): number {
    if (left.statusScore !== right.statusScore) {
        return right.statusScore - left.statusScore;
    }

    if (left.nextScore !== right.nextScore) {
        return right.nextScore - left.nextScore;
    }

    if (left.scenarioScore !== right.scenarioScore) {
        return right.scenarioScore - left.scenarioScore;
    }

    if (left.distanceToFocus !== right.distanceToFocus) {
        return left.distanceToFocus - right.distanceToFocus;
    }

    return compareOrderPath(
        left.treeOrder.split(".").map((value) => Number(value)),
        right.treeOrder.split(".").map((value) => Number(value)),
    );
}

export function selectCurrentNode(input: SchedulerInput): SchedulerResult {
    const allowFrozenNodeIds = normalizeAllowFrozenNodeIds(input.allowFrozenNodeIds);
    const index = buildTreeIndex(input.tree);
    const candidateNodes = filterCandidateNodes(input.nodes, allowFrozenNodeIds);
    const focusNodeId = input.focusNodeId ?? input.currentNodeId ?? null;

    const orderedCandidates = candidateNodes
        .map((node) => scoreNode(node, input, index, focusNodeId))
        .sort(compareCandidates)
        .map((candidate) => candidate.node);

    const manualNode = input.manualNodeId
        ? candidateNodes.find((node) => node.id === input.manualNodeId) ?? null
        : null;
    const currentNode = manualNode
        ?? (input.currentNodeId
            ? candidateNodes.find((node) => node.id === input.currentNodeId) ?? null
            : null)
        ?? orderedCandidates[0]
        ?? null;

    return {
        candidates: candidateNodes,
        orderedCandidates,
        currentNode,
    };
}
