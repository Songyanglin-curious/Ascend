import type { Node, NodeStatus } from "./Node.ts";
import type { NodeTree } from "./NodeTree.ts";
import type { StepRecord } from "./StepRecord.ts";
import type { SchedulerInput } from "./Scheduler.ts";
import { selectCurrentNode } from "./Scheduler.ts";

/**
 * Progress 负责把“选中的当前节点”推进一步，并把结果同时回写到：
 * - StepRecord：保存这一步的局部留痕
 * - Node：保存节点当前快照
 * - Tree：保存该节点最近一次 StepRecord 的挂接
 *
 * 当前仓库里实际上有两条一步推进语义：
 * 1. runProjectMinimalKernel: 把 output 直接回写为节点 summary / conclusion
 * 2. runProjectWorkflowStep: 只更新 next，保留节点既有 summary / conclusion
 *
 * CLI 主要走第二条，所以这里特别保留了注释，方便后续纠偏时辨认。
 */
export interface MinimalStepDraft {
    input: string;
    output: string;
    change: string;
    next: string;
    summary?: string;
    conclusion?: string;
    status?: NodeStatus;
}

/** `MinimalStepResult` 表示一次单节点推进后的记录与节点结果。 */
export interface MinimalStepResult {
    record: StepRecord;
    node: Node;
}

/** `ProjectMinimalKernelInput` 把调度输入与一步草稿组合成最小推进输入。 */
export interface ProjectMinimalKernelInput extends SchedulerInput {
    step: MinimalStepDraft;
}

/** `ProjectMinimalKernelResult` 汇总一步推进后对节点、树和候选排序的影响。 */
export interface ProjectMinimalKernelResult {
    currentNode: Node;
    record: StepRecord;
    updatedNode: Node;
    updatedTree: NodeTree[];
    updatedTreeNode: NodeTree | null;
    candidates: Node[];
    orderedCandidates: Node[];
}

/** `ProjectMinimalKernelVerificationResult` 在最小推进结果上追加闭环校验结论。 */
export interface ProjectMinimalKernelVerificationResult extends ProjectMinimalKernelResult {
    nextEntry: string;
    passed: boolean;
}

/** 生成一个轻量的步骤记录 ID。 */
function createId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/** 为一次已沉淀的推进结果创建最小 `StepRecord` 对象。 */
export function createStepRecord(nodeId: string, draft: MinimalStepDraft): StepRecord {
    // 当前实现把“一步沉淀”压成最小 StepRecord，不保存中间 mode 过程。
    return {
        id: createId("step"),
        nodeId,
        input: draft.input,
        output: draft.output,
        change: draft.change,
        next: draft.next,
    };
}

/** 把最小推进结果直接回写到节点当前快照。 */
export function applyStepRecordToNode(
    node: Node,
    record: StepRecord,
    draft: MinimalStepDraft,
): Node {
    // 这是“最小内核”路径：output 直接成为节点当前快照。
    return {
        ...node,
        summary: draft.summary ?? record.output,
        conclusion: draft.conclusion ?? record.output,
        next: record.next,
        status: draft.status ?? node.status ?? "进行中",
    };
}

/** 按工作流语义回写一步结果，默认保留既有 `summary / conclusion`。 */
export function applyWorkflowStepRecordToNode(
    node: Node,
    record: StepRecord,
    draft: MinimalStepDraft,
): Node {
    // 这是 CLI 主要使用的“工作流”路径：默认不覆盖既有 summary / conclusion。
    return {
        ...node,
        summary: draft.summary ?? node.summary,
        conclusion: draft.conclusion ?? node.conclusion,
        next: record.next,
        status: draft.status ?? node.status ?? "进行中",
    };
}

/** `TreeUpdateResult` 是递归重写树时使用的局部返回结构。 */
interface TreeUpdateResult {
    tree: NodeTree;
    matchedNode: NodeTree | null;
}

/** 递归找到目标树节点，并更新它最近一次的步骤记录引用。 */
function updateTreeNode(
    node: NodeTree,
    targetNodeId: string,
    recordId: string,
): TreeUpdateResult {
    let matchedNode: NodeTree | null = null;

    const updatedChildren = node.children.map((child) => {
        const childResult = updateTreeNode(child, targetNodeId, recordId);
        if (!matchedNode && childResult.matchedNode) {
            matchedNode = childResult.matchedNode;
        }
        return childResult.tree;
    });

    const updatedNode = node.nodeId === targetNodeId
        ? {
            ...node,
            currentStepRecordId: recordId,
            children: updatedChildren,
        }
        : {
            ...node,
            children: updatedChildren,
        };

    if (node.nodeId === targetNodeId) {
        matchedNode = updatedNode;
    }

    return {
        tree: updatedNode,
        matchedNode,
    };
}

/** 把新的步骤记录引用回写到树结构中。 */
export function applyStepRecordToTree(
    tree: readonly NodeTree[],
    nodeId: string,
    record: StepRecord,
): { updatedTree: NodeTree[]; updatedTreeNode: NodeTree | null } {
    // Tree 当前只记“最近一次” step 记录，不承接完整多轮历史。
    let updatedTreeNode: NodeTree | null = null;

    const updatedTree = tree.map((root) => {
        const result = updateTreeNode(root, nodeId, record.id);
        if (!updatedTreeNode && result.matchedNode) {
            updatedTreeNode = result.matchedNode;
        }
        return result.tree;
    });

    return {
        updatedTree,
        updatedTreeNode,
    };
}

/** 只针对单个节点运行一步，不改动 Project 级状态。 */
export function runMinimalStep(node: Node, draft: MinimalStepDraft): MinimalStepResult {
    const record = createStepRecord(node.id, draft);
    const updatedNode = applyStepRecordToNode(node, record, draft);

    return {
        record,
        node: updatedNode,
    };
}

/** 按“最小内核”语义执行一次 Project 级推进。 */
export function runProjectMinimalKernel(input: ProjectMinimalKernelInput): ProjectMinimalKernelResult {
    const selection = selectCurrentNode(input);

    if (!selection.currentNode) {
        throw new Error("当前没有可用于最小推进的候选节点。");
    }

    const { record, node: updatedNode } = runMinimalStep(selection.currentNode, input.step);
    const { updatedTree, updatedTreeNode } = applyStepRecordToTree(input.tree, selection.currentNode.id, record);

    return {
        currentNode: selection.currentNode,
        record,
        updatedNode,
        updatedTree,
        updatedTreeNode,
        candidates: selection.candidates,
        orderedCandidates: selection.orderedCandidates,
    };
}

/** 按“工作流”语义执行一次 Project 级推进。 */
export function runProjectWorkflowStep(input: ProjectMinimalKernelInput): ProjectMinimalKernelResult {
    const selection = selectCurrentNode(input);

    if (!selection.currentNode) {
        throw new Error("当前没有可用于最小推进的候选节点。");
    }

    const { record } = runMinimalStep(selection.currentNode, input.step);
    const updatedNode = applyWorkflowStepRecordToNode(selection.currentNode, record, input.step);
    const { updatedTree, updatedTreeNode } = applyStepRecordToTree(input.tree, selection.currentNode.id, record);

    return {
        currentNode: selection.currentNode,
        record,
        updatedNode,
        updatedTree,
        updatedTreeNode,
        candidates: selection.candidates,
        orderedCandidates: selection.orderedCandidates,
    };
}

/** 校验一次最小推进后，当前闭环是否成立。 */
export function verifyProjectMinimalKernel(input: ProjectMinimalKernelInput): ProjectMinimalKernelVerificationResult {
    // 这里只验证“最小闭环是否成立”，不验证 docs 中更完整的一轮运行规则。
    const result = runProjectMinimalKernel(input);
    const nextEntry = result.updatedNode.next;
    const passed = Boolean(
        result.updatedTreeNode
        && result.updatedTreeNode.currentStepRecordId === result.record.id
        && result.record.nodeId === result.currentNode.id
        && result.updatedNode.next === result.record.next
        && nextEntry.trim().length > 0
        && result.record.next.trim().length > 0
    );

    return {
        ...result,
        nextEntry,
        passed,
    };
}

