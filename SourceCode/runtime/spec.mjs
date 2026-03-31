import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  addProjectToSolution,
  appendNodeToProject,
  createProject,
  createProjectNode,
  createRoundFromContext,
  createSolution,
  createWorkspace,
  finishProjectNode,
  focusProjectNode,
  getProjectLifecycleSummary,
  promoteProjectIntoSolution,
  runProjectWorkflowKernel,
  runWorkspaceFocusedProjectKernel,
  setProjectLifecycleStage,
  verifyProjectMinimalKernel,
} from "./app.mjs";
import { generateDeepSeekAiStepDraft, generateDeepSeekFinishDraft, getLlmConfigPath, readLlmConfig } from "./llm.mjs";
import { main as runCliMain, planFocusedProjectStep, printProjectNodeDetails, printProjectNodeList } from "./cli.mjs";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function createDemoNode() {
  return {
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
}

function createDemoTree() {
  return [{
    nodeId: "node-1",
    parentId: null,
    order: 0,
    children: [],
  }];
}

function createDemoWorkspace(project) {
  return createWorkspace({ id: "workspace-1", solution: { id: "solution-1", goal: "demo goal", projects: [project] }, currentProjectId: project.id });
}

const runtimeDir = fileURLToPath(new URL(".", import.meta.url));
const cliScriptPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));

function runCliCommand(args, { preloadScript } = {}) {
  const spawnArgs = ["--experimental-strip-types"];
  if (preloadScript) {
    spawnArgs.push("--import", preloadScript);
  }
  spawnArgs.push(cliScriptPath, ...args);

  return spawnSync(process.execPath, spawnArgs, {
    cwd: runtimeDir,
    encoding: "utf8",
    env: {
      ...process.env,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ?? "test-key",
    },
  });
}

function createAiFinishPreloadFile() {
  const tempDir = fs.mkdtempSync(path.join(runtimeDir, "cli-ai-finish-"));
  const preloadPath = path.join(tempDir, "preload.mjs");
  fs.writeFileSync(
    preloadPath,
    [
      "globalThis.fetch = async () => ({",
      "  ok: true,",
      "  status: 200,",
      "  statusText: \"OK\",",
      "  text: async () => JSON.stringify({",
      "    choices: [{ message: { content: JSON.stringify({ summary: \"finish summary\", conclusion: \"finish conclusion\" }) } }],",
      "  }),",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );
  return { tempDir, preloadPath };
}
function setGlobalFetch(fetchImpl) {
  Object.defineProperty(globalThis, "fetch", {
    value: fetchImpl,
    configurable: true,
    writable: true,
  });
}

async function captureConsoleAsync(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const lines = [];

  console.log = (...args) => {
    lines.push(args.map((item) => String(item)).join(" "));
  };

  console.error = (...args) => {
    lines.push(args.map((item) => String(item)).join(" "));
  };

  try {
    const result = await fn();
    return { lines, result };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}
test("最小内核闭环", () => {
  const node = createDemoNode();
  const result = verifyProjectMinimalKernel({
    nodes: [node],
    tree: createDemoTree(),
    currentNodeId: node.id,
    step: {
      input: "input",
      output: "output",
      change: "change",
      next: "next-2",
    },
  });

  assert.equal(result.passed, true);
  assert.equal(result.currentNode.id, node.id);
  assert.equal(result.record.nodeId, node.id);
  assert.equal(result.updatedNode.next, "next-2");
  assert.equal(result.updatedTreeNode?.currentStepRecordId, result.record.id);
});

test("上层主链承接", () => {
  const node = createDemoNode();
  const solution = createSolution({ id: "solution-1", goal: "demo goal" });
  const project = createProject({
    id: "project-1",
    solutionId: solution.id,
    title: "demo project",
    goal: "demo goal",
    nodes: [node],
    tree: createDemoTree(),
  });
  const solutionWithProject = addProjectToSolution(solution, project);
  const workspace = createWorkspace({ id: "workspace-1", solution: solutionWithProject, currentProjectId: project.id });
  const round = createRoundFromContext({
    id: "round-1",
    solution: solutionWithProject,
    workspace,
    focusProject: project,
    goal: "round goal",
    currentState: "running",
    nextEntry: "next-round",
  });

  assert.equal(round.solutionId, solution.id);
  assert.equal(round.workspaceId, workspace.id);
  assert.equal(round.focusProjectId, project.id);
  assert.deepEqual(round.involvedProjectIds, [project.id]);

  const kernel = runWorkspaceFocusedProjectKernel({
    solution: solutionWithProject,
    workspace,
    project,
    step: {
      input: "input",
      output: "output",
      change: "change",
      next: "next-2",
    },
  });

  assert.equal(kernel.solution.projects[0].currentNodeId, node.id);
  assert.equal(kernel.workspace.currentProjectId, project.id);
  assert.equal(kernel.workspace.currentEntry, "next-2");
  assert.equal(kernel.project.currentNodeId, node.id);
  assert.equal(kernel.kernel.updatedNode.next, "next-2");
});

test("生命周期最小语义", () => {
  const sourceProject = createProject({
    id: "project-source",
    solutionId: "solution-1",
    title: "source",
    goal: "goal",
    nodes: [],
    tree: [],
  });
  const promoted = promoteProjectIntoSolution(
    createSolution({ id: "solution-1", goal: "goal" }),
    {
      id: "project-promoted",
      sourceProject,
      title: "promoted",
      goal: "goal",
      nodes: [],
      tree: [],
    },
  );

  assert.equal(promoted.promotedProject.sourceProjectId, sourceProject.id);
  assert.equal(promoted.solution.projects[0].sourceProjectId, sourceProject.id);

  const activeProject = setProjectLifecycleStage(sourceProject, "活跃");
  const summary = getProjectLifecycleSummary(activeProject);

  assert.equal(summary.stage, "活跃");
  assert.equal(summary.isActive, true);
  assert.equal(summary.isArchived, false);
});

test("节点工作流辅助", () => {
  const baseNode = createDemoNode();
  const project = createProject({
    id: "project-workflow",
    solutionId: "solution-1",
    title: "workflow",
    goal: "goal",
    nodes: [baseNode],
    tree: createDemoTree(),
    currentNodeId: baseNode.id,
  });
  const addedNode = createProjectNode({
    id: "node-2",
    title: "new node",
    scenario: "思考",
    raw: "raw-2",
    summary: "seed-summary",
    conclusion: "seed-conclusion",
  });
  const appendedProject = appendNodeToProject({ project, node: addedNode });
  const focusedProject = focusProjectNode(appendedProject, addedNode.id);
  const workflowKernel = runProjectWorkflowKernel({
    project: focusedProject,
    step: {
      input: "input",
      output: "output",
      change: "change",
      next: "next-workflow",
    },
  });
  const finishedProject = finishProjectNode({
    project: workflowKernel.project,
    nodeId: addedNode.id,
    summary: "final-summary",
    conclusion: "final-conclusion",
  });

  assert.equal(appendedProject.nodes.length, 2);
  assert.equal(appendedProject.tree[0].children[0].nodeId, addedNode.id);
  assert.equal(focusedProject.currentNodeId, addedNode.id);
  assert.equal(workflowKernel.record.nodeId, addedNode.id);
  assert.equal(workflowKernel.updatedNode.summary, "seed-summary");
  assert.equal(workflowKernel.updatedNode.conclusion, "seed-conclusion");
  assert.equal(workflowKernel.updatedNode.next, "next-workflow");
  assert.equal(finishedProject.nodes.find((node) => node.id === addedNode.id)?.status, "已完成");
  assert.equal(finishedProject.nodes.find((node) => node.id === addedNode.id)?.summary, "final-summary");
  assert.equal(finishedProject.nodes.find((node) => node.id === addedNode.id)?.conclusion, "final-conclusion");
});

test("DeepSeek 配置默认值与状态分离", () => {
  const config = readLlmConfig();

  assert.ok(getLlmConfigPath().endsWith(".ascend-llm.config.json"));
  assert.equal(config.provider, "deepseek");
  assert.equal(config.baseURL, "https://api.deepseek.com");
  assert.equal(config.model, "deepseek-chat");
  assert.equal(config.apiKeyEnv, "DEEPSEEK_API_KEY");
});

test("DeepSeek step 草稿校验", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const requests = [];
  const node = createDemoNode();
  const project = createProject({
    id: "project-ai",
    solutionId: "solution-1",
    title: "ai project",
    goal: "goal",
    nodes: [node],
    tree: createDemoTree(),
    currentNodeId: node.id,
  });
  const workspace = createDemoWorkspace(project);

  try {
    process.env.DEEPSEEK_API_KEY = "test-key";
    setGlobalFetch(async (endpoint, options) => {
      requests.push({ endpoint, options });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ input: "ai input", output: "ai output", change: "ai change", next: "ai next" }) } }],
        }),
      };
    });

    const draft = await generateDeepSeekAiStepDraft({
      project,
      node,
      workspace,
      recentStepRecords: [],
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].endpoint, "https://api.deepseek.com/chat/completions");
    const payload = JSON.parse(requests[0].options.body);
    assert.equal(payload.model, "deepseek-chat");
    assert.equal(payload.messages[0].role, "system");
    assert.equal(draft.input, "ai input");
    assert.equal(draft.output, "ai output");
    assert.equal(draft.change, "ai change");
    assert.equal(draft.next, "ai next");
  } finally {
    if (typeof originalKey === "undefined") {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalKey;
    }
    setGlobalFetch(originalFetch);
  }
});

test("step 草稿预览不落盘", () => {
  const node = createDemoNode();
  const solution = createSolution({ id: "solution-1", goal: "goal" });
  const project = createProject({
    id: "project-preview",
    solutionId: "solution-1",
    title: "preview project",
    goal: "goal",
    nodes: [node],
    tree: createDemoTree(),
    currentNodeId: node.id,
  });
  const solutionWithProject = addProjectToSolution(solution, project);
  const workspace = createWorkspace({ id: "workspace-1", solution: solutionWithProject, currentProjectId: project.id });
  const state = {
    solution: solutionWithProject,
    workspace,
    stepRecords: [],
    nextNodeIndex: 2,
  };
  const snapshot = JSON.stringify(state);

  const planned = planFocusedProjectStep(state, {
    input: "input",
    output: "output",
    change: "change",
    next: "next-2",
  });

  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(planned.kernel.record.nodeId, node.id);
  assert.equal(planned.nextState.stepRecords.length, 1);
  assert.equal(planned.nextState.workspace.currentEntry, "next-2");
  assert.equal(Object.hasOwn(planned, "persistedState"), false);
});


function captureConsole(fn) {
  const originalLog = console.log;
  const lines = [];
  console.log = (...args) => {
    lines.push(args.map((item) => String(item)).join(" "));
  };

  try {
    const result = fn();
    return { lines, result };
  } finally {
    console.log = originalLog;
  }
}
test("CLI 主入口回归", async () => {
  const originalArgv = process.argv;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalFetch = globalThis.fetch;

  try {
    process.argv = [process.argv[0], "runtime/cli.mjs", "reset"];
    const resetResult = await captureConsoleAsync(() => runCliMain());
    assert.equal(resetResult.result, undefined);

    process.argv = [process.argv[0], "runtime/cli.mjs", "status"];
    const statusResult = await captureConsoleAsync(() => runCliMain());
    assert.match(statusResult.lines.join("\n"), /状态文件/);
    assert.match(statusResult.lines.join("\n"), /状态文件/);

    process.argv = [process.argv[0], "runtime/cli.mjs", "show-state"];
    const showStateResult = await captureConsoleAsync(() => runCliMain());
    assert.match(showStateResult.lines.join("\n"), /"solution"/);
    assert.match(showStateResult.lines.join("\n"), /"stepRecords"/);

    process.argv = [process.argv[0], "runtime/cli.mjs", "nodes"];
    const listNodesResult = await captureConsoleAsync(() => runCliMain());
    assert.match(listNodesResult.lines.join("\n"), /node-1/);
    assert.match(listNodesResult.lines.join("\n"), /node-1/);

    process.argv = [process.argv[0], "runtime/cli.mjs", "node", "node-1"];
    const showNodeResult = await captureConsoleAsync(() => runCliMain());
    assert.match(showNodeResult.lines.join("\n"), /关联 stepRecords/);
    assert.match(showNodeResult.lines.join("\n"), /关联 stepRecords/);

    process.env.DEEPSEEK_API_KEY = "test-key";
    setGlobalFetch(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ summary: "finish summary", conclusion: "finish conclusion" }) } }],
      }),
    }));

    process.argv = [process.argv[0], "runtime/cli.mjs", "finish-ai", "node-1"];
    const aiFinishResult = await captureConsoleAsync(() => runCliMain());
    assert.match(aiFinishResult.lines.join("\n"), /已从 DeepSeek 生成 finish 草稿/);
    assert.match(aiFinishResult.lines.join("\n"), /已结束节点：node-1/);
  } finally {
    process.argv = originalArgv;
    if (typeof originalKey === "undefined") {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalKey;
    }
    setGlobalFetch(originalFetch);
  }
});

test("CLI 旧别名兼容", async () => {
  const originalArgv = process.argv;
  const originalKey = process.env.DEEPSEEK_API_KEY;
  const originalFetch = globalThis.fetch;

  try {
    process.env.DEEPSEEK_API_KEY = "test-key";
    setGlobalFetch(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ summary: "finish summary", conclusion: "finish conclusion" }) } }],
      }),
    }));

    process.argv = [process.argv[0], "runtime/cli.mjs", "list-nodes"];
    const listNodesResult = await captureConsoleAsync(() => runCliMain());
    assert.match(listNodesResult.lines.join("\n"), /node-1/);

    process.argv = [process.argv[0], "runtime/cli.mjs", "show-node", "node-1"];
    const showNodeResult = await captureConsoleAsync(() => runCliMain());
    assert.match(showNodeResult.lines.join("\n"), /关联 stepRecords/);
    assert.match(showNodeResult.lines.join("\n"), /关联 stepRecords/);

    process.argv = [process.argv[0], "runtime/cli.mjs", "ai-finish", "node-1"];
    const aiFinishResult = await captureConsoleAsync(() => runCliMain());
    assert.match(aiFinishResult.lines.join("\n"), /已从 DeepSeek 生成 finish 草稿/);
    assert.match(aiFinishResult.lines.join("\n"), /已结束节点：node-1/);
  } finally {
    process.argv = originalArgv;
    if (typeof originalKey === "undefined") {
      delete process.env.DEEPSEEK_API_KEY;
    } else {
      process.env.DEEPSEEK_API_KEY = originalKey;
    }
    setGlobalFetch(originalFetch);
  }
});

for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`通过 - ${name}`);
  } catch (error) {
    console.error(`未通过 - ${name}`);
    throw error;
  }
}

console.log("所有运行校验通过。");
