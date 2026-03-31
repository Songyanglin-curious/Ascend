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

const tree = [{
  nodeId: "node-1",
  parentId: null,
  order: 0,
  children: [],
}];

const solution = createSolution({ id: "solution-1", goal: "demo goal" });
const project = createProject({
  id: "project-1",
  solutionId: solution.id,
  title: "demo project",
  goal: "demo goal",
  nodes: [node],
  tree,
});
const solutionWithProject = { ...solution, projects: [project] };
const workspace = createWorkspace({
  id: "workspace-1",
  solution: solutionWithProject,
  currentProjectId: project.id,
  currentEntry: "start",
});
const round = createRoundFromContext({
  id: "round-1",
  solution: solutionWithProject,
  workspace,
  focusProject: project,
  goal: "demo round",
  currentState: "running",
  nextEntry: "continue",
});

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
