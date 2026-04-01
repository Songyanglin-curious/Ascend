import type { Node, NodeStatus } from "./Node.ts";
import type { NodeTree } from "./NodeTree.ts";

/**
 * Scheduler 当前只实现“候选过滤 + 候选排序 + 选出当前节点”这部分。
 *
 * 它还没有实现 docs 中更完整的职责：
 * - scenario 约束下的 mode 入口选择
 * - 人工介入判断
 * - 真正的重新纳管回流主链
 *
 * 也就是说，本文件描述的是当前仓库里的最小调度器，而不是完整 1.0 调度规则。
 */
export interface SchedulerInput {
    nodes: readonly Node[];
    tree: readonly NodeTree[];
    currentNodeId?: string | null;
    manualNodeId?: string | null;
    focusNodeId?: string | null;
    currentScenario?: string | null;
    allowFrozenNodeIds?: Iterable<string>;
}

/** `SchedulerCandidate` 保存单个候选节点的排序计算结果。 */
export interface SchedulerCandidate {
    node: Node;
    treeOrder: string;
    distanceToFocus: number;
    nextScore: number;
    scenarioScore: number;
    statusScore: number;
}

/** `SchedulerResult` 返回候选列表、排序结果以及最终选中的当前节点。 */
export interface SchedulerResult {
    candidates: Node[];
    orderedCandidates: Node[];
    currentNode: Node | null;
}

/** `TreeIndex` 是调度器在计算树位置时使用的扁平索引。 */
interface TreeIndex {
    parentId: string | null;
    orderPath: number[];
}

// 当前排序实现遵循“先收口，再开新口”的近似版本：
// 进行中 > 未开始 > 已冻结（仅在显式允许时）> 已完成。
const STATUS_SCORE: Record<NodeStatus, number> = {
    "进行中": 3,
    "未开始": 2,
    "已冻结": 1,
    "已完成": 0,
};

/** 把可选的冻结节点白名单标准化为 `Set`。 */
function normalizeAllowFrozenNodeIds(allowFrozenNodeIds: Iterable<string> | undefined): Set<string> {
    return new Set(allowFrozenNodeIds ? Array.from(allowFrozenNodeIds) : []);
}

/** 构建从节点 ID 到父节点与顺序路径的查找表。 */
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

/** 比较两条树路径的顺序，判断哪个节点更靠前。 */
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

/** 计算两个节点在树上的距离。 */
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

/** 计算节点 `scenario` 与当前场景提示的贴近度分值。 */
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

/** 根据节点是否已有明确 `next` 入口给出分值。 */
function getNextScore(node: Node): number {
    return node.next.trim().length > 0 ? 1 : 0;
}

/** 判断某个冻结节点是否被显式允许重新进入候选池。 */
function isFrozenAllowed(nodeId: string, allowFrozenNodeIds: Set<string>): boolean {
    return allowFrozenNodeIds.has(nodeId);
}

/** 判断节点当前是否具备调度资格。 */
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

/** 从节点列表中过滤出当前可参与调度的候选节点。 */
export function filterCandidateNodes(
    nodes: readonly Node[],
    allowFrozenNodeIds?: Iterable<string>,
): Node[] {
    return nodes.filter((node) => isCandidateNode(node, allowFrozenNodeIds));
}

/** 为单个候选节点计算排序所需的元数据。 */
function scoreNode(
    node: Node,
    input: SchedulerInput,
    index: Map<string, TreeIndex>,
    focusNodeId: string | null,
): SchedulerCandidate {
    const treeIndex = index.get(node.id);
    const treeOrder = treeIndex ? treeIndex.orderPath.join(".") : `9999.${node.id}`;
    const distanceToFocus = focusNodeId ? getDistanceBetweenNodes(node.id, focusNodeId, index) : Number.MAX_SAFE_INTEGER;

    // 当前实现只看四类信号：状态、next 是否明确、scenario 贴近度、树位置。
    return {
        node,
        treeOrder,
        distanceToFocus,
        nextScore: getNextScore(node),
        scenarioScore: getScenarioScore(node.scenario, input.currentScenario),
        statusScore: STATUS_SCORE[node.status],
    };
}

/** 比较两个候选节点的分值并决定先后顺序。 */
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

/** 从当前候选节点中选出应当推进的当前节点。 */
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

    // manualNodeId 是当前实现里唯一明确的“人工覆盖自动排序”入口。
    return {
        candidates: candidateNodes,
        orderedCandidates,
        currentNode,
    };
}
