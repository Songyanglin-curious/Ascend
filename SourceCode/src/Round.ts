import type { Project } from "./Project.ts";
import type { Solution } from "./Solution.ts";
import type { Workspace } from "./Workspace.ts";

export interface Round {
    id: string;
    solutionId: string;
    workspaceId: string;
    focusProjectId: string;
    involvedProjectIds: string[];
    goal: string;
    currentState: string;
    nextEntry: string;
}

export interface CreateRoundInput {
    id: string;
    solutionId: string;
    workspaceId: string;
    focusProjectId: string;
    involvedProjectIds?: readonly string[];
    goal: string;
    currentState: string;
    nextEntry: string;
}

export interface CreateRoundFromContextInput {
    id: string;
    solution: Solution;
    workspace: Workspace;
    focusProject: Project;
    involvedProjectIds?: readonly string[];
    goal: string;
    currentState: string;
    nextEntry: string;
}

function uniqueProjectIds(projectIds: readonly string[] | undefined, focusProjectId: string): string[] {
    const normalized = new Set<string>(projectIds ?? []);
    normalized.add(focusProjectId);
    return Array.from(normalized);
}

export function createRound(input: CreateRoundInput): Round {
    return {
        id: input.id,
        solutionId: input.solutionId,
        workspaceId: input.workspaceId,
        focusProjectId: input.focusProjectId,
        involvedProjectIds: uniqueProjectIds(input.involvedProjectIds, input.focusProjectId),
        goal: input.goal,
        currentState: input.currentState,
        nextEntry: input.nextEntry,
    };
}

export function createRoundFromContext(input: CreateRoundFromContextInput): Round {
    return createRound({
        id: input.id,
        solutionId: input.solution.id,
        workspaceId: input.workspace.id,
        focusProjectId: input.focusProject.id,
        involvedProjectIds: input.involvedProjectIds,
        goal: input.goal,
        currentState: input.currentState,
        nextEntry: input.nextEntry,
    });
}

export interface RoundProjectLinkInput {
    focusProject: Project;
    relatedProjects?: readonly Project[];
}

export interface RoundProjectLinkResult {
    focusProject: Project;
    relatedProjects: Project[];
    involvedProjectIds: string[];
}

export function linkRoundProjects(input: RoundProjectLinkInput): RoundProjectLinkResult {
    const projects = new Map<string, Project>();

    projects.set(input.focusProject.id, input.focusProject);
    (input.relatedProjects ?? []).forEach((project) => {
        if (project.solutionId === input.focusProject.solutionId) {
            projects.set(project.id, project);
        }
    });

    const relatedProjects = Array.from(projects.values());

    return {
        focusProject: input.focusProject,
        relatedProjects,
        involvedProjectIds: relatedProjects.map((project) => project.id),
    };
}
