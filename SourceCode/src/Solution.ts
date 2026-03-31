import type { Project } from "./Project.ts";

/** Solution 是围绕同一最终目标组织多个 Project 的最上层容器。 */
export interface Solution {
    id: string;
    goal: string;
    projects: Project[];
}

/** 创建 Solution 时允许一次性注入现有 Project 列表。 */
export interface CreateSolutionInput {
    id: string;
    goal: string;
    projects?: readonly Project[];
}

/** 创建一个新的 Solution 数据对象。 */
export function createSolution(input: CreateSolutionInput): Solution {
    return {
        id: input.id,
        goal: input.goal,
        projects: [...(input.projects ?? [])],
    };
}

/** 通过项目 ID 从 Solution 中查找对应的 Project。 */
export function getSolutionProject(solution: Solution, projectId: string): Project | null {
    return solution.projects.find((project) => project.id === projectId) ?? null;
}

/** 把 Project 加入 Solution；若同 ID 已存在，则用新值覆盖。 */
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

/** 在保持其他 Project 不变的前提下，替换 Solution 中的指定 Project。 */
export function replaceProjectInSolution(solution: Solution, project: Project): Solution {
    return {
        ...solution,
        projects: solution.projects.map((item) => (item.id === project.id ? {
            ...project,
            solutionId: solution.id,
        } : item)),
    };
}
