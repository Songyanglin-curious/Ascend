import type { Project, ProjectKernelInput, ProjectKernelResult } from "./Project.ts";
import { runProjectKernel } from "./Project.ts";
import type { Solution } from "./Solution.ts";
import { getSolutionProject, replaceProjectInSolution } from "./Solution.ts";

/**
 * Workspace 表示当前 Solution 下的工作上下文。
 *
 * 当前实现里最需要注意的是 currentEntry：
 * - 有时它承接“下一步文本入口”
 * - 有时 focusWorkspaceProject 又把它写成 currentNodeId
 *
 * 也就是说，currentEntry 在现状代码中已经发生了语义混用。
 * 这里先把事实写清，方便后续纠偏，而不是假装它已经稳定。
 */
export interface Workspace {
    id: string;
    solutionId: string | null;
    currentProjectId: string | null;
    currentEntry: string | null;
}

/** `CreateWorkspaceInput` 是创建 Workspace 对象所需的最小输入数据。 */
export interface CreateWorkspaceInput {
    id: string;
    solution?: Solution | null;
    currentProjectId?: string | null;
    currentEntry?: string | null;
}

/** `WorkspaceProjectKernelInput` 把 Workspace 上下文与 Project 内核输入组合起来。 */
export interface WorkspaceProjectKernelInput extends ProjectKernelInput {
    solution: Solution;
    workspace: Workspace;
}

/** `WorkspaceProjectKernelResult` 返回一步执行后更新的 solution/workspace/project 视图。 */
export interface WorkspaceProjectKernelResult {
    solution: Solution;
    workspace: Workspace;
    project: Project;
    kernel: ProjectKernelResult;
}

/** 创建一个新的 `Workspace` 对象。 */
export function createWorkspace(input: CreateWorkspaceInput): Workspace {
    return {
        id: input.id,
        solutionId: input.solution?.id ?? null,
        currentProjectId: input.currentProjectId ?? null,
        currentEntry: input.currentEntry ?? null,
    };
}

/** 把已有 Workspace 显式绑定到某个 Solution。 */
export function bindWorkspaceToSolution(workspace: Workspace, solution: Solution): Workspace {
    return {
        ...workspace,
        solutionId: solution.id,
    };
}

/** 把 Workspace 的焦点移动到指定 Project。 */
export function focusWorkspaceProject(workspace: Workspace, project: Project): Workspace {
    return {
        ...workspace,
        solutionId: project.solutionId,
        currentProjectId: project.id,
        // 当前实现会把 currentEntry 临时写成 currentNodeId。
        currentEntry: project.currentNodeId,
    };
}

/** 结合 Workspace 与 Solution 解析当前聚焦的 Project。 */
export function getWorkspaceCurrentProject(solution: Solution, workspace: Workspace): Project | null {
    if (workspace.solutionId !== solution.id || !workspace.currentProjectId) {
        return null;
    }

    return getSolutionProject(solution, workspace.currentProjectId);
}

/** 在 Workspace 当前聚焦的 Project 上执行一次最小推进。 */
export function runWorkspaceFocusedProjectKernel(input: WorkspaceProjectKernelInput): WorkspaceProjectKernelResult {
    const currentProject = getWorkspaceCurrentProject(input.solution, input.workspace);

    if (!currentProject) {
        throw new Error("当前工作区里没有可用的聚焦项目。");
    }

    const { solution, workspace, ...projectKernelInput } = input;
    const kernel = runProjectKernel({
        ...projectKernelInput,
        project: currentProject,
    });

    return {
        solution: replaceProjectInSolution(solution, kernel.project),
        workspace: {
            ...focusWorkspaceProject(workspace, kernel.project),
            // 这里又把 currentEntry 改回“下一步文本入口”。
            currentEntry: kernel.updatedNode.next,
        },
        project: kernel.project,
        kernel,
    };
}

