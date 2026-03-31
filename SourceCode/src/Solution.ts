import type { Project } from "./Project.ts";

export interface Solution {
    id: string;
    goal: string;
    projects: Project[];
}

export interface CreateSolutionInput {
    id: string;
    goal: string;
    projects?: readonly Project[];
}

export function createSolution(input: CreateSolutionInput): Solution {
    return {
        id: input.id,
        goal: input.goal,
        projects: [...(input.projects ?? [])],
    };
}

export function getSolutionProject(solution: Solution, projectId: string): Project | null {
    return solution.projects.find((project) => project.id === projectId) ?? null;
}

export function addProjectToSolution(solution: Solution, project: Project): Solution {
    const normalizedProject: Project = {
        ...project,
        solutionId: solution.id,
    };

    const nextProjects = solution.projects.some((item) => item.id === project.id)
        ? solution.projects.map((item) => (item.id === project.id ? normalizedProject : item))
        : [...solution.projects, normalizedProject];

    return {
        ...solution,
        projects: nextProjects,
    };
}

export function replaceProjectInSolution(solution: Solution, project: Project): Solution {
    return {
        ...solution,
        projects: solution.projects.map((item) => (item.id === project.id ? {
            ...project,
            solutionId: solution.id,
        } : item)),
    };
}
