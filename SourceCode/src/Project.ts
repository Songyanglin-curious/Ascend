import type { Node, NodeActiveStatus, NodeStatus } from "./Node.ts";
import type { NodeTree } from "./NodeTree.ts";
import type { ProjectMinimalKernelInput, ProjectMinimalKernelResult } from "./Progress.ts";
import { runProjectMinimalKernel, runProjectWorkflowStep } from "./Progress.ts";
import type { Solution } from "./Solution.ts";
import { addProjectToSolution } from "./Solution.ts";

/**
 * Project 是 Solution 内部一级工作对象。
 *
 * 当前实现把 Project 内部压成：
 * - nodes: 节点内容快照集合
 * - tree: 节点关系结构
 * - currentNodeId: 当前焦点节点
 * - lifecycleStage: 最小生命周期语义
 *
 * 注意：
 * 当前仓库已经提前把生命周期、升格、上层组织都写进来了，
 * 早于 docs/51-53 建议的实现顺序。这里保留注释，是为了后续纠偏时
 * 能快速区分“当前有实现”与“当前本不该先实现”的部分。
 */
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

/** `CreateProjectInput` 是构造 Project 快照所需的输入数据。 */
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

/** `CreateProjectNodeInput` 描述向 Project 新增节点时允许写入的字段。 */
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

/** `ProjectLifecycleStage` 表示当前代码承认的最小生命周期阶段。 */
export type ProjectLifecycleStage = "创建" | "活跃" | "暂停 / 封存" | "结束 / 归档";

/** `ProjectLifecycleSummary` 是便于上层判断的生命周期摘要视图。 */
export interface ProjectLifecycleSummary {
    stage: ProjectLifecycleStage;
    isArchived: boolean;
    isActive: boolean;
}

/** `ProjectKernelInput` 把 Project 包装成可传给推进内核的输入。 */
export interface ProjectKernelInput extends Omit<ProjectMinimalKernelInput, "nodes" | "tree" | "currentNodeId"> {
    project: Project;
}

/** `ProjectKernelResult` 是内核结果回写到 Project 之后的整体结果。 */
export interface ProjectKernelResult extends ProjectMinimalKernelResult {
    project: Project;
}

/** `AppendNodeToProjectInput` 描述新节点应如何挂入 Project 树。 */
export interface AppendNodeToProjectInput {
    project: Project;
    node: Node;
    parentNodeId?: string | null;
}

/** `FinishProjectNodeInput` 描述收尾节点时要回写的最终总结与结论。 */
export interface FinishProjectNodeInput {
    project: Project;
    nodeId: string;
    summary: string;
    conclusion: string;
}

/** 创建一个新的 `Project` 对象。 */
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
    // 当前实现会在创建节点时直接给 scenario 默认值。
    // 这与 docs 中“先创建 Node，再轻量初始化确定 scenario”的主链并不完全一致。
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

/** 返回 Project 当前记录的焦点节点 ID。 */
export function selectProjectCurrentNodeId(project: Project): string | null {
    return project.currentNodeId;
}

/** 根据 Project 的生命周期字段生成一个摘要视图。 */
export function getProjectLifecycleSummary(project: Project): ProjectLifecycleSummary {
    return {
        stage: project.lifecycleStage,
        isArchived: project.isLifecycleArchived,
        isActive: project.lifecycleStage === "活跃" && !project.isLifecycleArchived,
    };
}

/** 设置 Project 生命周期阶段，并保持归档标记与之同步。 */
export function setProjectLifecycleStage(project: Project, stage: ProjectLifecycleStage): Project {
    return {
        ...project,
        lifecycleStage: stage,
        isLifecycleArchived: stage === "结束 / 归档",
    };
}

/** 在 Project 上运行“最小内核”推进，并把结果回写到 Project。 */
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
    // 这是 CLI 主要使用的推进入口；它保留节点原有 summary / conclusion，
    // 因而更接近“先追加 stepRecord，再最小更新当前入口”的现状实现。
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

/** 把一个节点 ID 挂到指定父节点下的树结构里。 */
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

/** 把一个完整节点对象追加到 Project 及其树结构中。 */
export function appendNodeToProject(input: AppendNodeToProjectInput): Project {
    // 新节点默认挂到当前焦点下；当前实现没有独立的“创建后再初始化入场”阶段。
    const parentNodeId = input.parentNodeId ?? input.project.currentNodeId ?? null;
    const updatedNodes = [...input.project.nodes, input.node];
    const updatedTree = appendNodeToTree(input.project.tree, parentNodeId, input.node.id);

    return {
        ...input.project,
        nodes: updatedNodes,
        tree: updatedTree,
    };
}

/** 把 Project 的当前焦点切换到指定节点。 */
export function focusProjectNode(project: Project, nodeId: string): Project {
    if (!project.nodes.some((node) => node.id === nodeId)) {
        throw new Error(`项目中找不到节点：${nodeId}。`);
    }

    return {
        ...project,
        currentNodeId: nodeId,
    };
}

/** 通过写入最终总结与结论，把节点标记为结束。 */
export function finishProjectNode(input: FinishProjectNodeInput): Project {
    const nodeExists = input.project.nodes.some((node) => node.id === input.nodeId);
    if (!nodeExists) {
        throw new Error(`项目中找不到要结束的节点：${input.nodeId}。`);
    }

    // 当前 finish 只改节点快照，不生成对应 StepRecord。
    // 这是当前实现和 docs 中“先沉淀记录，再统一回写 Node”的一个关键偏差。
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

/** `PromoteProjectInput` 描述源 Project 如何派生出新 Project。 */
export interface PromoteProjectInput extends Omit<CreateProjectInput, "solutionId" | "sourceProjectId"> {
    sourceProject: Project;
}

/** `PromoteProjectResult` 同时返回源 Project、新 Project 和更新后的 Solution。 */
export interface PromoteProjectResult {
    sourceProject: Project;
    promotedProject: Project;
    solution: Solution;
}

/** 基于源 Project 创建一个派生 Project，但暂不写回 Solution。 */
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

/** 创建派生 Project，并把它写入目标 Solution。 */
export function promoteProjectIntoSolution(solution: Solution, input: PromoteProjectInput): PromoteProjectResult {
    const promotedProject = promoteProjectFromSource(input);

    return {
        sourceProject: input.sourceProject,
        promotedProject,
        solution: addProjectToSolution(solution, promotedProject),
    };
}

