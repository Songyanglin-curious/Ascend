import {
  createProject,
  createRoundFromContext,
  createSolution,
  createStepRecord,
  createWorkspace,
  runWorkspaceFocusedProjectKernel,
  setProjectLifecycleStage,
  verifyProjectMinimalKernel,
} from "./app.mjs";

/** 用于演示当前端到端运行链路的示例节点。 */
const node = {
  id: "node-1",
  scenario: "思考",
  title: "demo node",
  raw: "raw",
  summary: "summary",
  conclusion: "conclusion",
  next: "next",
  status: "未开始",
  activeStatus: "启用",
};

/** 把示例节点放在根部的演示树结构。 */
const tree = [{
  nodeId: "node-1",
  parentId: null,
  order: 0,
  children: [],
}];

/** 作为示例 Project 顶层容器的演示 Solution。 */
const solution = createSolution({ id: "solution-1", goal: "demo goal" });
/** 用来跑通当前最小工作流的演示 Project。 */
const project = createProject({
  id: "project-1",
  solutionId: solution.id,
  title: "demo project",
  goal: "demo goal",
  nodes: [node],
  tree,
});
/** 注入示例 Project 后的演示 Solution 快照。 */
const solutionWithProject = { ...solution, projects: [project] };
/** 聚焦到示例 Project 的演示 Workspace。 */
const workspace = createWorkspace({
  id: "workspace-1",
  solution: solutionWithProject,
  currentProjectId: project.id,
  currentEntry: "start",
});
/** 基于当前上下文对象构造出的演示 Round。 */
const round = createRoundFromContext({
  id: "round-1",
  solution: solutionWithProject,
  workspace,
  focusProject: project,
  goal: "demo round",
  currentState: "running",
  nextEntry: "continue",
});

/** 用于验证最小内核路径的演示运行结果。 */
const verification = verifyProjectMinimalKernel({
  nodes: project.nodes,
  tree: project.tree,
  currentNodeId: project.currentNodeId,
  step: {
    input: "input",
    output: "output",
    change: "change",
    next: "next-2",
  },
});

/** 展示状态如何向上回流的 Workspace 级演示运行。 */
const workspaceKernel = runWorkspaceFocusedProjectKernel({
  solution: solutionWithProject,
  workspace,
  project: {
    ...project,
    lifecycleStage: "活跃",
    isLifecycleArchived: false,
  },
  step: {
    input: "input",
    output: "output",
    change: "change",
    next: "next-2",
  },
});

/** 用于展示最小生命周期语义的演示生命周期更新。 */
const lifecycleProject = setProjectLifecycleStage(project, "活跃");

console.log(JSON.stringify({
  round,
  verification: {
    passed: verification.passed,
    nextEntry: verification.nextEntry,
    recordId: verification.record.id,
  },
  workspaceKernel: {
    workspace: workspaceKernel.workspace,
    projectId: workspaceKernel.project.id,
    currentEntry: workspaceKernel.workspace.currentEntry,
  },
  lifecycleProject: {
    stage: lifecycleProject.lifecycleStage,
    isArchived: lifecycleProject.isLifecycleArchived,
  },
  stepRecord: createStepRecord(node.id, {
    input: "input",
    output: "output",
    change: "change",
    next: "next-2",
  }),
}, null, 2));
