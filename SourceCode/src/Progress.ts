import type { Node, NodeStatus } from "./Node.ts";
import type { NodeTree } from "./NodeTree.ts";
import type { StepRecord } from "./StepRecord.ts";
import type { SchedulerInput } from "./Scheduler.ts";
import { selectCurrentNode } from "./Scheduler.ts";

export interface MinimalStepDraft {
    input: string;
    output: string;
    change: string;
    next: string;
    summary?: string;
    conclusion?: string;
    status?: NodeStatus;
}

export interface MinimalStepResult {
    record: StepRecord;
    node: Node;
}

export interface ProjectMinimalKernelInput extends SchedulerInput {
    step: MinimalStepDraft;
}

export interface ProjectMinimalKernelResult {
    currentNode: Node;
    record: StepRecord;
    updatedNode: Node;
    updatedTree: NodeTree[];
    updatedTreeNode: NodeTree | null;
    candidates: Node[];
    orderedCandidates: Node[];
}

export interface ProjectMinimalKernelVerificationResult extends ProjectMinimalKernelResult {
    nextEntry: string;
    passed: boolean;
}

function createId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createStepRecord(nodeId: string, draft: MinimalStepDraft): StepRecord {
    return {
        id: createId("step"),
        nodeId,
        input: draft.input,
        output: draft.output,
        change: draft.change,
        next: draft.next,
    };
}

export function applyStepRecordToNode(
    node: Node,
    record: StepRecord,
    draft: MinimalStepDraft,
): Node {
    return {
        ...node,
        summary: draft.summary ?? record.output,
        conclusion: draft.conclusion ?? record.output,
        next: record.next,
        status: draft.status ?? node.status ?? "进行中",
    };
}

export function applyWorkflowStepRecordToNode(
    node: Node,
    record: StepRecord,
    draft: MinimalStepDraft,
): Node {
    return {
        ...node,
        summary: draft.summary ?? node.summary,
        conclusion: draft.conclusion ?? node.conclusion,
        next: record.next,
        status: draft.status ?? node.status ?? "进行中",
    };
}

interface TreeUpdateResult {
    tree: NodeTree;
    matchedNode: NodeTree | null;
}

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

export function applyStepRecordToTree(
    tree: readonly NodeTree[],
    nodeId: string,
    record: StepRecord,
): { updatedTree: NodeTree[]; updatedTreeNode: NodeTree | null } {
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

export function runMinimalStep(node: Node, draft: MinimalStepDraft): MinimalStepResult {
    const record = createStepRecord(node.id, draft);
    const updatedNode = applyStepRecordToNode(node, record, draft);

    return {
        record,
        node: updatedNode,
    };
}

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

export function verifyProjectMinimalKernel(input: ProjectMinimalKernelInput): ProjectMinimalKernelVerificationResult {
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

