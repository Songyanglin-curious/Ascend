import type { Project, ProjectKernelInput, ProjectKernelResult } from "./Project.ts";
import { runProjectKernel } from "./Project.ts";
import type { Solution } from "./Solution.ts";
import { getSolutionProject, replaceProjectInSolution } from "./Solution.ts";

export interface Workspace {
    id: string;
    solutionId: string | null;
    currentProjectId: string | null;
    currentEntry: string | null;
}

export interface CreateWorkspaceInput {
    id: string;
    solution?: Solution | null;
    currentProjectId?: string | null;
    currentEntry?: string | null;
}

export interface WorkspaceProjectKernelInput extends ProjectKernelInput {
    solution: Solution;
    workspace: Workspace;
}

export interface WorkspaceProjectKernelResult {
    solution: Solution;
    workspace: Workspace;
    project: Project;
    kernel: ProjectKernelResult;
}

export function createWorkspace(input: CreateWorkspaceInput): Workspace {
    return {
        id: input.id,
        solutionId: input.solution?.id ?? null,
        currentProjectId: input.currentProjectId ?? null,
        currentEntry: input.currentEntry ?? null,
    };
}

export function bindWorkspaceToSolution(workspace: Workspace, solution: Solution): Workspace {
    return {
        ...workspace,
        solutionId: solution.id,
    };
}

export function focusWorkspaceProject(workspace: Workspace, project: Project): Workspace {
    return {
        ...workspace,
        solutionId: project.solutionId,
        currentProjectId: project.id,
        currentEntry: project.currentNodeId,
    };
}

export function getWorkspaceCurrentProject(solution: Solution, workspace: Workspace): Project | null {
    if (workspace.solutionId !== solution.id || !workspace.currentProjectId) {
        return null;
    }

    return getSolutionProject(solution, workspace.currentProjectId);
}

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
            currentEntry: kernel.updatedNode.next,
        },
        project: kernel.project,
        kernel,
    };
}

