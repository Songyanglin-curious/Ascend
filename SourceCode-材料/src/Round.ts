import type { Project } from "./Project.ts";
import type { Solution } from "./Solution.ts";
import type { Workspace } from "./Workspace.ts";

/**
 * Round 在 docs 中应是“跨 Project 变化组织单位”。
 *
 * 当前实现只保留了一个极小数据壳：
 * - 记录 solution / workspace / 焦点 project
 * - 记录 involvedProjectIds / goal / currentState / nextEntry
 *
 * CLI 还会在普通状态展示时临时构造一个 round-current，
 * 因而现状更像“当前工作快照”而不是严格意义上的跨 Project 轮次。
 */
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

/** `CreateRoundInput` 是构造一个 Round 所需的最小输入数据。 */
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

/** `CreateRoundFromContextInput` 允许从现有上下文对象快速推导一个 Round。 */
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

/** 合并 involvedProjectIds，并确保始终包含焦点 Project 的 ID。 */
function uniqueProjectIds(projectIds: readonly string[] | undefined, focusProjectId: string): string[] {
    const normalized = new Set<string>(projectIds ?? []);
    normalized.add(focusProjectId);
    return Array.from(normalized);
}

/** 创建一个新的 `Round` 对象。 */
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

/** 根据现有 solution/workspace/project 上下文构造一个 Round。 */
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

/** `RoundProjectLinkInput` 描述用于计算 involvedProjectIds 的项目集合。 */
export interface RoundProjectLinkInput {
    focusProject: Project;
    relatedProjects?: readonly Project[];
}

/** `RoundProjectLinkResult` 返回焦点 Project、相关 Project 及合并后的 ID 列表。 */
export interface RoundProjectLinkResult {
    focusProject: Project;
    relatedProjects: Project[];
    involvedProjectIds: string[];
}

/** 过滤出同一 Solution 内的相关 Project，并返回 involvedProjectIds。 */
export function linkRoundProjects(input: RoundProjectLinkInput): RoundProjectLinkResult {
    // 当前只做同一 Solution 内的 involvedProjectIds 归并，不做更完整的轮次组织。
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
