import type { Node, NodeActiveStatus, NodeStatus } from "./Node.ts";
import type { NodeTree } from "./NodeTree.ts";
import type { ProjectMinimalKernelInput, ProjectMinimalKernelResult } from "./Progress.ts";
import { runProjectMinimalKernel, runProjectWorkflowStep } from "./Progress.ts";
import type { Solution } from "./Solution.ts";
import { addProjectToSolution } from "./Solution.ts";

export interface Project {
    id: string;
    solutionId: string;
    sourceProjectId?: string | null;
    title: string;
    goal: string;
    nodes: Node[];
    tree: NodeTree[];
    currentNodeId: string | null;
    lifecycleStage: ProjectLifecycleStage;
    isLifecycleArchived: boolean;
}

export interface CreateProjectInput {
    id: string;
    solutionId: string;
    sourceProjectId?: string | null;
    title: string;
    goal: string;
    nodes?: readonly Node[];
    tree?: readonly NodeTree[];
    currentNodeId?: string | null;
    lifecycleStage?: ProjectLifecycleStage;
    isLifecycleArchived?: boolean;
}

export interface CreateProjectNodeInput {
    id: string;
    scenario?: string;
    title: string;
    raw?: string;
    summary?: string;
    conclusion?: string;
    next?: string;
    status?: NodeStatus;
    activeStatus?: NodeActiveStatus;
}

export type ProjectLifecycleStage = "创建" | "活跃" | "暂停 / 封存" | "结束 / 归档";

export interface ProjectLifecycleSummary {
    stage: ProjectLifecycleStage;
    isArchived: boolean;
    isActive: boolean;
}

export interface ProjectKernelInput extends Omit<ProjectMinimalKernelInput, "nodes" | "tree" | "currentNodeId"> {
    project: Project;
}

export interface ProjectKernelResult extends ProjectMinimalKernelResult {
    project: Project;
}

export interface AppendNodeToProjectInput {
    project: Project;
    node: Node;
    parentNodeId?: string | null;
}

export interface FinishProjectNodeInput {
    project: Project;
    nodeId: string;
    summary: string;
    conclusion: string;
}

export function createProject(input: CreateProjectInput): Project {
    return {
        id: input.id,
        solutionId: input.solutionId,
        sourceProjectId: input.sourceProjectId ?? null,
        title: input.title,
        goal: input.goal,
        nodes: [...(input.nodes ?? [])],
        tree: [...(input.tree ?? [])],
        currentNodeId: input.currentNodeId ?? null,
        lifecycleStage: input.lifecycleStage ?? "创建",
        isLifecycleArchived: input.isLifecycleArchived ?? false,
    };
}

export function createProjectNode(input: CreateProjectNodeInput): Node {
    return {
        id: input.id,
        scenario: input.scenario ?? "思考",
        title: input.title,
        raw: input.raw ?? "",
        summary: input.summary ?? "",
        conclusion: input.conclusion ?? "",
        next: input.next ?? "",
        status: input.status ?? "未开始",
        activeStatus: input.activeStatus ?? "启用",
    };
}

export function selectProjectCurrentNodeId(project: Project): string | null {
    return project.currentNodeId;
}

export function getProjectLifecycleSummary(project: Project): ProjectLifecycleSummary {
    return {
        stage: project.lifecycleStage,
        isArchived: project.isLifecycleArchived,
        isActive: project.lifecycleStage === "活跃" && !project.isLifecycleArchived,
    };
}

export function setProjectLifecycleStage(project: Project, stage: ProjectLifecycleStage): Project {
    return {
        ...project,
        lifecycleStage: stage,
        isLifecycleArchived: stage === "结束 / 归档",
    };
}

export function runProjectKernel(input: ProjectKernelInput): ProjectKernelResult {
    const result = runProjectMinimalKernel({
        nodes: input.project.nodes,
        tree: input.project.tree,
        currentNodeId: input.currentNodeId ?? input.project.currentNodeId,
        manualNodeId: input.manualNodeId,
        focusNodeId: input.focusNodeId,
        currentScenario: input.currentScenario,
        allowFrozenNodeIds: input.allowFrozenNodeIds,
        step: input.step,
    });

    const updatedNodes = input.project.nodes.map((node) => (
        node.id === result.currentNode.id ? result.updatedNode : node
    ));

    return {
        ...result,
        project: {
            ...input.project,
            nodes: updatedNodes,
            tree: result.updatedTree,
            currentNodeId: result.updatedNode.id,
        },
    };
}

export function runProjectWorkflowKernel(input: ProjectKernelInput): ProjectKernelResult {
    const result = runProjectWorkflowStep({
        nodes: input.project.nodes,
        tree: input.project.tree,
        currentNodeId: input.currentNodeId ?? input.project.currentNodeId,
        manualNodeId: input.manualNodeId,
        focusNodeId: input.focusNodeId,
        currentScenario: input.currentScenario,
        allowFrozenNodeIds: input.allowFrozenNodeIds,
        step: input.step,
    });

    const updatedNodes = input.project.nodes.map((node) => (
        node.id === result.currentNode.id ? result.updatedNode : node
    ));

    return {
        ...result,
        project: {
            ...input.project,
            nodes: updatedNodes,
            tree: result.updatedTree,
            currentNodeId: result.updatedNode.id,
        },
    };
}

function appendNodeToTree(tree: readonly NodeTree[], parentNodeId: string | null, nodeId: string): NodeTree[] {
    if (parentNodeId === null) {
        return [
            ...tree,
            {
                nodeId,
                parentId: null,
                order: tree.length,
                children: [],
            },
        ];
    }

    let matched = false;

    const updateNode = (node: NodeTree): NodeTree => {
        if (node.nodeId === parentNodeId) {
            matched = true;
            return {
                ...node,
                children: [
                    ...node.children,
                    {
                        nodeId,
                        parentId: parentNodeId,
                        order: node.children.length,
                        children: [],
                    },
                ],
            };
        }

        return {
            ...node,
            children: node.children.map((child) => updateNode(child)),
        };
    };

    const updatedTree = tree.map((root) => updateNode(root));

    if (!matched) {
        throw new Error(`项目树中找不到父节点：${parentNodeId}。`);
    }

    return updatedTree;
}

export function appendNodeToProject(input: AppendNodeToProjectInput): Project {
    const parentNodeId = input.parentNodeId ?? input.project.currentNodeId ?? null;
    const updatedNodes = [...input.project.nodes, input.node];
    const updatedTree = appendNodeToTree(input.project.tree, parentNodeId, input.node.id);

    return {
        ...input.project,
        nodes: updatedNodes,
        tree: updatedTree,
    };
}

export function focusProjectNode(project: Project, nodeId: string): Project {
    if (!project.nodes.some((node) => node.id === nodeId)) {
        throw new Error(`项目中找不到节点：${nodeId}。`);
    }

    return {
        ...project,
        currentNodeId: nodeId,
    };
}

export function finishProjectNode(input: FinishProjectNodeInput): Project {
    const nodeExists = input.project.nodes.some((node) => node.id === input.nodeId);
    if (!nodeExists) {
        throw new Error(`项目中找不到要结束的节点：${input.nodeId}。`);
    }

    const updatedNodes = input.project.nodes.map((node) => (
        node.id === input.nodeId
            ? {
                ...node,
                summary: input.summary,
                conclusion: input.conclusion,
                status: "已完成",
            }
            : node
    ));

    return {
        ...input.project,
        nodes: updatedNodes,
        currentNodeId: input.nodeId,
    };
}

export interface PromoteProjectInput extends Omit<CreateProjectInput, "solutionId" | "sourceProjectId"> {
    sourceProject: Project;
}

export interface PromoteProjectResult {
    sourceProject: Project;
    promotedProject: Project;
    solution: Solution;
}

export function promoteProjectFromSource(input: PromoteProjectInput): Project {
    return createProject({
        id: input.id,
        solutionId: input.sourceProject.solutionId,
        sourceProjectId: input.sourceProject.id,
        title: input.title,
        goal: input.goal,
        nodes: input.nodes,
        tree: input.tree,
        currentNodeId: input.currentNodeId,
    });
}

export function promoteProjectIntoSolution(solution: Solution, input: PromoteProjectInput): PromoteProjectResult {
    const promotedProject = promoteProjectFromSource(input);

    return {
        sourceProject: input.sourceProject,
        promotedProject,
        solution: addProjectToSolution(solution, promotedProject),
    };
}

