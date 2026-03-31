import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

import {
  appendNodeToProject,
  createProject,
  createProjectNode,
  createRoundFromContext,
  createSolution,
  createWorkspace,
  finishProjectNode,
  focusProjectNode,
  focusWorkspaceProject,
  getProjectLifecycleSummary,
  getSolutionProject,
  replaceProjectInSolution,
  runProjectWorkflowKernel,
} from "./app.mjs";
import { generateDeepSeekAiStepDraft, generateDeepSeekFinishDraft, getLlmConfigPath } from "./llm.mjs";

/**
 * 这个 CLI 是当前仓库里最直接的运行入口。
 *
 * 它的主要作用不是复刻 docs 中完整运行规则，而是把当前最小实现串成
 * 一个可落盘、可查看、可演示的状态机外壳：
 * - 维护 runtime/.ascend-cli-state.json
 * - 维护当前 project / focused node
 * - 承接 step / ai-step / finish / new-node 这些演示级命令
 *
 * 也正因为它承担了“最先跑起来”的职责，很多当前偏差都集中体现在这里：
 * - currentEntry 会在 nodeId 和 next 文本之间来回切换
 * - status/show-state 会临时构造一个 round-current
 * - finish 会直接改节点而不新增 stepRecord
 */
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.join(runtimeDir, ".ascend-cli-state.json");

/** 在读写 CLI 状态文件前，确保运行目录已经存在。 */
function ensureRuntimeDir() {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
}

/** 创建 `init/reset` 使用的默认演示节点。 */
function createDefaultNode() {
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

/** 创建指向默认节点的演示树根。 */
function createDefaultTree() {
  return [{
    nodeId: "node-1",
    parentId: null,
    order: 0,
    children: [],
  }];
}

/** 创建 `init/reset` 使用的完整演示状态快照。 */
function createInitialState() {
  // init/reset 目前只是创建一个 demo 级初始状态，不是 docs 中“真实原始输入入场链”。
  const solution = createSolution({ id: "solution-1", goal: "demo goal" });
  const project = createProject({
    id: "project-1",
    solutionId: solution.id,
    title: "demo project",
    goal: "demo goal",
    nodes: [createDefaultNode()],
    tree: createDefaultTree(),
    currentNodeId: "node-1",
    lifecycleStage: "活跃",
  });
  const solutionWithProject = { ...solution, projects: [project] };
  const workspace = createWorkspace({
    id: "workspace-1",
    solution: solutionWithProject,
    currentProjectId: project.id,
    currentEntry: "start",
  });

  return {
    solution: solutionWithProject,
    workspace,
    stepRecords: [],
    nextNodeIndex: 2,
  };
}

/** 根据当前 Project 中的节点推导下一个节点编号。 */
function deriveNextNodeIndex(state) {
  const project = getCurrentProject(state);
  if (!project) {
    return 2;
  }

  const maxIndex = project.nodes
    .map((node) => {
      const match = /^node-(\d+)$/.exec(node.id);
      return match ? Number(match[1]) : 0;
    })
    .reduce((max, value) => Math.max(max, value), 0);

  return maxIndex + 1;
}

/** 标准化持久化状态对象，确保可选字段都有默认值。 */
function normalizeState(state) {
  if (!state) {
    return null;
  }

  return {
    ...state,
    stepRecords: Array.isArray(state.stepRecords) ? state.stepRecords : [],
    nextNodeIndex: typeof state.nextNodeIndex === "number" ? state.nextNodeIndex : deriveNextNodeIndex(state),
  };
}

/** 如果状态文件存在，则从磁盘读取 CLI 状态。 */
function readState() {
  if (!fs.existsSync(statePath)) {
    return null;
  }

  return normalizeState(JSON.parse(fs.readFileSync(statePath, "utf8")));
}

/** 把 CLI 状态写入磁盘，并执行 `fsync` 保证落盘。 */
function writeState(state) {
  ensureRuntimeDir();
  const fd = fs.openSync(statePath, "w");
  try {
    fs.writeFileSync(fd, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** 持久化状态到磁盘，并立即回读验证写入成功。 */
function persistState(state) {
  writeState(state);
  const persistedState = readState();
  if (!persistedState) {
    throw new Error(`CLI 状态写入失败：${statePath}`);
  }

  return persistedState;
}

/** 读取命令参数，同时兼容 npm 转发参数的方式。 */
function getCommandArgs() {
  const directArgs = process.argv.slice(3);
  const npmConfigArgvRaw = process.env.npm_config_argv;

  if (!npmConfigArgvRaw) {
    return directArgs;
  }

  try {
    const npmConfigArgv = JSON.parse(npmConfigArgvRaw);
    const original = Array.isArray(npmConfigArgv?.original) ? npmConfigArgv.original : [];
    return original.length > 2 ? original.slice(2) : directArgs;
  } catch {
    return directArgs;
  }
}

/** 从当前内存态 CLI 状态中解析聚焦的 Project。 */
function getCurrentProject(state) {
  if (!state?.solution || !state?.workspace) {
    return null;
  }

  return getSolutionProject(state.solution, state.workspace.currentProjectId ?? "");
}

/** 构造 CLI 状态展示里使用的当前 Round 视图。 */
function getCurrentRound(state) {
  const currentProject = getCurrentProject(state);
  if (!currentProject) {
    return null;
  }

  // 当前实现会在状态展示时临时捏出一个 round-current，
  // 它更像“当前上下文快照”，并不严格等同于 docs 里的跨 Project Round。
  return createRoundFromContext({
    id: "round-current",
    solution: state.solution,
    workspace: state.workspace,
    focusProject: currentProject,
    goal: currentProject.goal,
    currentState: "running",
    nextEntry: state.workspace.currentEntry ?? "",
  });
}

/** 输出当前 CLI 状态的简要摘要。 */
function printStateSummary(state) {
  const currentProject = getCurrentProject(state);
  const currentRound = getCurrentRound(state);
  const stepRecords = state.stepRecords ?? [];

  console.log(`状态文件：${statePath}`);
  console.log(`方案：${state.solution.id} | 目标：${state.solution.goal}`);
  console.log(`工作区：${state.workspace.id} | 当前项目ID：${state.workspace.currentProjectId ?? "<none>"} | 当前入口：${state.workspace.currentEntry ?? "<none>"}`);
  console.log(`步骤记录数：${stepRecords.length}`);

  if (!currentProject) {
    console.log("当前项目：<无>");
    return;
  }

  console.log(`当前项目：${currentProject.id} | 标题：${currentProject.title} | 生命周期：${getProjectLifecycleSummary(currentProject).stage}`);
  console.log(`当前节点：${currentProject.currentNodeId ?? "<none>"}`);

  if (currentRound) {
    console.log(`轮次：${currentRound.id} | 焦点项目ID：${currentRound.focusProjectId} | 下一入口：${currentRound.nextEntry}`);
  }

  if (stepRecords.length > 0) {
    const lastRecord = stepRecords[stepRecords.length - 1];
    console.log(`最近步骤记录：${lastRecord.id} | 节点ID：${lastRecord.nodeId}`);
  }
}

/** 以格式化 JSON 方式输出完整 CLI 状态。 */
function printFullState(state) {
  console.log(JSON.stringify(state, null, 2));
}

/** 从命令参数、管道输入或交互式提问中解析一个输入值。 */
async function promptInput(promptText, defaultValue, pipeValue, argValue) {
  if (typeof argValue === "string" && argValue.trim().length > 0) {
    return argValue.trim();
  }

  if (!process.stdin.isTTY) {
    return (pipeValue ?? defaultValue).trim() || defaultValue;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${promptText} [${defaultValue}]: `)).trim();
    return answer || defaultValue;
  } finally {
    rl.close();
  }
}

/** 在 TTY 环境里交互式收集一步推进草稿。 */
async function promptDraftFromTty() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const input = (await rl.question("本轮输入 [input]: ")).trim() || "input";
    const output = (await rl.question("本轮输出 [output]: ")).trim() || "output";
    const change = (await rl.question("本轮变化 [change]: ")).trim() || "change";
    const next = (await rl.question("下一步 [next]: ")).trim() || "next";
    return { input, output, change, next };
  } finally {
    rl.close();
  }
}

/** 在管道模式下从标准输入读取一步推进草稿。 */
function promptDraftFromPipe() {
  const lines = fs.readFileSync(0, "utf8").split(/\r?\n/);
  const [input = "input", output = "output", change = "change", next = "next"] = lines;

  return {
    input: input.trim() || "input",
    output: output.trim() || "output",
    change: change.trim() || "change",
    next: next.trim() || "next",
  };
}

/** 按当前运行环境选择合适的草稿输入方式。 */
async function promptDraft() {
  return process.stdin.isTTY ? promptDraftFromTty() : promptDraftFromPipe();
}

/** 从 TTY 或管道输入中收集 finish 所需的总结与结论。 */
async function promptFinishDraft(pipeLines = []) {
  if (process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const summary = (await rl.question("总结 [summary]: ")).trim() || "summary";
      const conclusion = (await rl.question("结论 [conclusion]: ")).trim() || "conclusion";
      return { summary, conclusion };
    } finally {
      rl.close();
    }
  }

  const [summary = "summary", conclusion = "conclusion"] = pipeLines;
  return {
    summary: summary.trim() || "summary",
    conclusion: conclusion.trim() || "conclusion",
  };
}

/** 解析聚焦的 Project；若不存在则抛出友好的错误。 */
function getProjectFromStateOrThrow(state) {
  const currentProject = getCurrentProject(state);
  if (!currentProject) {
    throw new Error("当前没有可用的聚焦项目，请先运行 `npm run cli -- init`。");
  }

  return currentProject;
}

/** 在 CLI 状态结构中替换当前 Project。 */
function updateStateProject(state, project) {
  return {
    ...state,
    solution: replaceProjectInSolution(state.solution, project),
  };
}

/** 解析当前聚焦节点；如果焦点无效则抛出错误。 */
function getFocusedNodeOrThrow(project) {
  const focusedNode = project.nodes.find((node) => node.id === project.currentNodeId);
  if (!focusedNode) {
    throw new Error(`当前项目里找不到焦点节点：${project.currentNodeId ?? "<none>"}`);
  }

  return focusedNode;
}

/** 把 Project 树展开成便于 CLI 打印的行结构。 */
function collectProjectTreeRows(project) {
  const nodeMap = new Map(project.nodes.map((node) => [node.id, node]));
  const rows = [];
  const visited = new Set();

  const visit = (treeNodes, depth, pathStack) => {
    for (const treeNode of treeNodes) {
      const node = nodeMap.get(treeNode.nodeId);
      if (!node) {
        continue;
      }

      visited.add(node.id);
      const nextPath = [...pathStack, node.id];
      rows.push({
        node,
        treeNode,
        depth,
        path: nextPath,
        isCurrent: project.currentNodeId === node.id,
        isOrphan: false,
      });

      if (treeNode.children.length > 0) {
        visit(treeNode.children, depth + 1, nextPath);
      }
    }
  };

  visit(project.tree, 0, []);

  for (const node of project.nodes) {
    if (!visited.has(node.id)) {
      // CLI 会把“存在于 nodes 中、但没有挂进 tree 的节点”展示为孤立节点，
      // 便于人工排查当前状态，而不是直接抛错中断。
      rows.push({
        node,
        treeNode: null,
        depth: 0,
        path: [node.id],
        isCurrent: project.currentNodeId === node.id,
        isOrphan: true,
      });
    }
  }

  return rows;
}

/** 从展开后的树行里查找某个节点的树元信息。 */
function getProjectNodeTreeInfo(project, nodeId) {
  return collectProjectTreeRows(project).find((row) => row.node.id === nodeId) ?? null;
}

/** 返回某个 Project 中指定节点关联的步骤记录。 */
function getProjectNodeStepRecords(state, projectId, nodeId) {
  return (state.stepRecords ?? []).filter((record) => record.nodeId === nodeId && (record.projectId ? record.projectId === projectId : true));
}

/** 以树形视角输出当前聚焦 Project 的节点总览。 */
function printProjectNodeList(state) {
  const project = getProjectFromStateOrThrow(state);
  const rows = collectProjectTreeRows(project);

  console.log(`项目：${project.id} | 标题：${project.title} | 当前焦点：${project.currentNodeId ?? "<none>"}`);
  console.log(`节点数：${project.nodes.length} | 树行数：${rows.length}`);

  for (const row of rows) {
    const indent = "  ".repeat(row.depth);
    const focusMark = row.isCurrent ? "[焦点]" : "      ";
    const orphanMark = row.isOrphan ? "[孤立]" : "";
    console.log(`${indent}${focusMark}${orphanMark} ${row.node.id} | 层级${row.depth} | 状态${row.node.status} | 启用${row.node.activeStatus} | 标题${row.node.title} | 子节点${row.treeNode?.children.length ?? 0}`);
  }
}

/** 输出单个节点详情及其关联的步骤记录。 */
function printProjectNodeDetails(state, nodeId) {
  const project = getProjectFromStateOrThrow(state);
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) {
    throw new Error(`找不到节点：${nodeId}`);
  }

  const treeInfo = getProjectNodeTreeInfo(project, nodeId);
  const stepRecords = getProjectNodeStepRecords(state, project.id, nodeId);
  const parentId = treeInfo?.treeNode?.parentId ?? null;
  const childCount = treeInfo?.treeNode?.children.length ?? 0;
  const treePath = treeInfo?.path.length ? treeInfo.path.join(" > ") : "<无路径>";

  console.log(`项目：${project.id} | 节点：${node.id} | 当前焦点：${project.currentNodeId === node.id ? "是" : "否"}`);
  console.log(`标题：${node.title}`);
  console.log(`场景：${node.scenario} | 状态：${node.status} | 启用：${node.activeStatus}`);
  console.log(`层级：${treeInfo?.depth ?? 0} | 父节点：${parentId ?? "<root>"} | 子节点数：${childCount}`);
  console.log(`路径：${treePath}`);
  console.log(`原始内容：${node.raw || "<空>"}`);
  console.log(`summary：${node.summary || "<空>"}`);
  console.log(`conclusion：${node.conclusion || "<空>"}`);
  console.log(`next：${node.next || "<空>"}`);
  console.log(`关联 stepRecords：${stepRecords.length}`);

  if (stepRecords.length === 0) {
    console.log("没有关联的 stepRecords。");
    return;
  }

  stepRecords.forEach((record, index) => {
    console.log(`  ${index + 1}. ${record.id} | input：${record.input} | output：${record.output} | change：${record.change} | next：${record.next}`);
  });
}

/** 在不落盘的前提下模拟推进当前焦点节点，并返回下一状态。 */
function planFocusedProjectStep(state, draft) {
  const currentProject = getProjectFromStateOrThrow(state);
  const focusedNodeId = currentProject.currentNodeId;
  if (!focusedNodeId) {
    throw new Error("当前项目里没有可用的焦点节点。");
  }

  // CLI 这里是“显式推进当前焦点节点”，不是完整 Scheduler 自动选点。
  const kernel = runProjectWorkflowKernel({
    project: currentProject,
    currentNodeId: focusedNodeId,
    manualNodeId: focusedNodeId,
    focusNodeId: focusedNodeId,
    step: draft,
  });

  if (kernel.record.nodeId !== focusedNodeId || kernel.updatedNode.id !== focusedNodeId) {
    throw new Error(`步骤实际落到了 ${kernel.record.nodeId}，但当前焦点节点是 ${focusedNodeId}。`);
  }

  const nextState = updateStateProject(state, kernel.project);
  nextState.workspace = focusWorkspaceProject(state.workspace, kernel.project);
  nextState.workspace = {
    ...nextState.workspace,
    // 这里把 workspace.currentEntry 回写成新的 next 文本。
    currentEntry: kernel.updatedNode.next,
  };
  nextState.stepRecords = [
    ...(state.stepRecords ?? []),
    {
      // CLI 真实落盘会在类型定义之外额外补 projectId / createdAt。
      ...kernel.record,
      projectId: kernel.project.id,
      createdAt: new Date().toISOString(),
    },
  ];
  nextState.nextNodeIndex = state.nextNodeIndex ?? deriveNextNodeIndex(state);

  return {
    currentProject,
    focusedNodeId,
    kernel,
    nextState,
  };
}

/** 真正推进当前焦点节点一步，并持久化结果状态。 */
function runFocusedProjectStep(state, draft) {
  const planned = planFocusedProjectStep(state, draft);
  return {
    ...planned,
    persistedState: persistState(planned.nextState),
  };
}

/** 处理 `init` 命令。 */
async function handleInit() {
  const state = persistState(createInitialState());
  console.log(`已初始化 CLI 状态：${statePath}`);
  printStateSummary(state);
}

/** 处理 `reset` 命令。 */
async function handleReset() {
  const state = persistState(createInitialState());
  console.log(`已重置 CLI 状态：${statePath}`);
  printStateSummary(state);
}

/** 处理 `status` 命令。 */
async function handleStatus() {
  const state = readState();
  if (!state) {
    console.log("未找到 CLI 状态。请先运行 `npm run cli -- init`。");
    return;
  }

  printStateSummary(state);
}

/** 处理 `show-state` 命令。 */
async function handleShowState() {
  const state = readState();
  if (!state) {
    console.log("未找到 CLI 状态。请先运行 `npm run cli -- init`。");
    return;
  }

  printFullState(state);
}

/** 处理 `nodes / list-nodes` 命令。 */
async function handleListNodes() {
  const state = readState();
  if (!state) {
    console.log("未找到 CLI 状态。请先运行 `npm run cli -- init`。");
    return;
  }

  printProjectNodeList(state);
}

/** 处理 `node / show-node` 命令。 */
async function handleShowNode() {
  const state = readState();
  if (!state) {
    console.log("未找到 CLI 状态。请先运行 `npm run cli -- init`。");
    return;
  }

  const commandArgs = getCommandArgs();
  const nodeId = commandArgs.find((arg) => !arg.startsWith("--"));
  if (!nodeId) {
    throw new Error("请提供节点 ID，例如：npm run cli -- node node-2");
  }

  printProjectNodeDetails(state, nodeId);
}

/** 处理手工 `step` 命令。 */
async function handleStep() {
  const state = readState();
  if (!state) {
    console.log("未找到 CLI 状态。请先运行 `npm run cli -- init`。");
    return;
  }

  const draft = await promptDraft();
  const result = runFocusedProjectStep(state, draft);
  const lifecycleSummary = getProjectLifecycleSummary(result.kernel.project);

  console.log(`已应用步骤记录：${result.kernel.record.id}`);
  console.log(`当前入口：${result.persistedState.workspace.currentEntry}`);
  console.log(`当前节点：${result.kernel.project.currentNodeId}`);
  console.log(`树回写：${result.kernel.updatedTreeNode?.currentStepRecordId ?? "<none>"}`);
  console.log(`生命周期：${lifecycleSummary.stage}`);
  console.log(`状态文件：${statePath}`);
}

/** 处理 `new-node` 命令。 */
async function handleNewNode() {
  const state = readState();
  if (!state) {
    console.log("未找到 CLI 状态。请先运行 `npm run cli -- init`。");
    return;
  }

  const currentProject = getProjectFromStateOrThrow(state);
  const commandArgs = getCommandArgs();
  const pipeLines = !process.stdin.isTTY ? fs.readFileSync(0, "utf8").split(/\r?\n/) : [];
  const title = await promptInput("标题", "new node", pipeLines[0], commandArgs[0]);
  const scenario = await promptInput("场景", "思考", pipeLines[1], commandArgs[1]);
  const raw = await promptInput("原始内容", "", pipeLines[2], commandArgs[2]);
  const parentNodeId = await promptInput("父节点 ID（留空表示当前焦点）", currentProject.currentNodeId ?? "", pipeLines[3], commandArgs[3]);
  const node = createProjectNode({
    id: `node-${state.nextNodeIndex ?? deriveNextNodeIndex(state)}`,
    title,
    scenario,
    raw,
  });

  const updatedProject = appendNodeToProject({
    project: currentProject,
    node,
    parentNodeId: parentNodeId.trim() || null,
  });

  const nextState = updateStateProject(state, updatedProject);
  nextState.workspace = focusWorkspaceProject(state.workspace, updatedProject);
  nextState.stepRecords = state.stepRecords ?? [];
  nextState.nextNodeIndex = (state.nextNodeIndex ?? deriveNextNodeIndex(state)) + 1;
  persistState(nextState);

  console.log(`已创建节点：${node.id}`);
  console.log(`已挂接到项目：${updatedProject.id}`);
  console.log(`父节点：${parentNodeId.trim() || currentProject.currentNodeId || "<root>"}`);
  console.log(`状态文件：${statePath}`);
}

/** 处理 `focus-node` 命令。 */
async function handleFocusNode() {
  const state = readState();
  if (!state) {
    console.log("未找到 CLI 状态。请先运行 `npm run cli -- init`。");
    return;
  }

  const currentProject = getProjectFromStateOrThrow(state);
  const commandArgs = getCommandArgs();
  const pipeLines = !process.stdin.isTTY ? fs.readFileSync(0, "utf8").split(/\r?\n/) : [];
  const nodeId = await promptInput("要聚焦的节点 ID", currentProject.currentNodeId ?? "node-1", pipeLines[0], commandArgs[0]);
  const updatedProject = focusProjectNode(currentProject, nodeId);

  const nextState = updateStateProject(state, updatedProject);
  nextState.workspace = focusWorkspaceProject(state.workspace, updatedProject);
  nextState.stepRecords = state.stepRecords ?? [];
  nextState.nextNodeIndex = state.nextNodeIndex ?? deriveNextNodeIndex(state);
  persistState(nextState);

  console.log(`已聚焦节点：${nodeId}`);
  console.log(`状态文件：${statePath}`);
}

/** 处理 AI 辅助的 `step` 命令，可选择仅预览不落盘。 */
async function handleAiStep({ dryRun = false } = {}) {
  const state = readState();
  if (!state) {
    console.log("未找到 CLI 状态。请先运行 `npm run cli -- init`。");
    return;
  }

  const currentProject = getProjectFromStateOrThrow(state);
  const focusedNode = getFocusedNodeOrThrow(currentProject);
  // 当前 AI step 只带最近几条 stepRecords，语境仍然是“轻量草稿生成”而非完整树级上下文。
  const recentStepRecords = (state.stepRecords ?? []).filter((record) => record.nodeId === focusedNode.id).slice(-3);

  const draft = await generateDeepSeekAiStepDraft({
    project: currentProject,
    node: focusedNode,
    workspace: state.workspace,
    recentStepRecords,
  });

  if (dryRun) {
    const planned = planFocusedProjectStep(state, draft);
    console.log("已生成 AI 草稿预览（不会写盘）：");
    console.log(JSON.stringify(draft, null, 2));
    console.log(`预览当前节点：${planned.kernel.project.currentNodeId}`);
    console.log(`预览当前入口：${planned.nextState.workspace.currentEntry}`);
    console.log(`预览树回写：${planned.kernel.updatedTreeNode?.currentStepRecordId ?? "<none>"}`);
    console.log(`状态文件：${statePath}（未写入）`);
    return;
  }

  console.log("已从 DeepSeek 生成 AI 草稿（完整 step draft，不只是 summary/conclusion）：");
  console.log(JSON.stringify(draft, null, 2));

  const result = runFocusedProjectStep(state, draft);
  const lifecycleSummary = getProjectLifecycleSummary(result.kernel.project);

  console.log(`已应用步骤记录：${result.kernel.record.id}`);
  console.log(`当前入口：${result.persistedState.workspace.currentEntry}`);
  console.log(`当前节点：${result.kernel.project.currentNodeId}`);
  console.log(`树回写：${result.kernel.updatedTreeNode?.currentStepRecordId ?? "<none>"}`);
  console.log(`生命周期：${lifecycleSummary.stage}`);
  console.log(`状态文件：${statePath}`);
}

/** 处理节点结束流程，可选用 AI 生成总结与结论。 */
async function handleFinishNode({ aiMode: aiModeOverride = false } = {}) {
  const state = readState();
  if (!state) {
    console.log("未找到 CLI 状态。请先运行 `npm run cli -- init`。");
    return;
  }

  const currentProject = getProjectFromStateOrThrow(state);
  const commandArgs = getCommandArgs();
  const aiMode = aiModeOverride || commandArgs.includes("--ai");
  const positionalArgs = commandArgs.filter((arg) => arg !== "--ai");
  const pipeLines = !process.stdin.isTTY ? fs.readFileSync(0, "utf8").split(/\r?\n/) : [];
  const nodeId = await promptInput(
    "要结束的节点 ID",
    currentProject.currentNodeId ?? "node-1",
    pipeLines[0],
    positionalArgs[0],
  );

  const focusedNode = currentProject.nodes.find((node) => node.id === nodeId);
  if (!focusedNode) {
    throw new Error(`当前项目里找不到节点：${nodeId}`);
  }

  const recentStepRecords = getProjectNodeStepRecords(state, currentProject.id, nodeId).slice(-3);
  let finishDraft;

  if (aiMode) {
    finishDraft = await generateDeepSeekFinishDraft({
      project: currentProject,
      node: focusedNode,
      workspace: state.workspace,
      recentStepRecords,
    });
    console.log("已从 DeepSeek 生成 finish 草稿：");
    console.log(JSON.stringify(finishDraft, null, 2));
  } else {
    finishDraft = await promptFinishDraft(pipeLines.slice(1).concat(positionalArgs.slice(1)));
  }

  const updatedProject = finishProjectNode({
    project: currentProject,
    nodeId,
    summary: finishDraft.summary,
    conclusion: finishDraft.conclusion,
  });

  // 当前 finish 只改 Project/Workspace，不会像 step 一样追加 stepRecord。
  const nextState = updateStateProject(state, updatedProject);
  nextState.workspace = focusWorkspaceProject(state.workspace, updatedProject);
  nextState.stepRecords = state.stepRecords ?? [];
  nextState.nextNodeIndex = state.nextNodeIndex ?? deriveNextNodeIndex(state);
  persistState(nextState);

  console.log(`已结束节点：${nodeId}`);
  console.log(`状态文件：${statePath}`);
}

/** 输出 CLI 帮助文本。 */
function printUsage() {
  console.log([
    "CLI 命令：",
    "  npm run cli -- init",
    "  npm run cli -- reset",
    "  npm run cli -- status",
    "  npm run cli -- show-state",
    "  npm run cli -- nodes",
    "  npm run cli -- node <nodeId>",
    "  npm run cli -- step",
    "  npm run cli -- step-ai",
    "  npm run cli -- step-draft",
    "  npm run cli -- new-node",
    "  npm run cli -- focus-node",
    "  npm run cli -- finish",
    "  npm run cli -- finish-ai",
    "  npm run cli",
    "",
    `状态文件：${statePath}`,
    `LLM 配置：${getLlmConfigPath()}`,
    "主入口：init, reset, status, nodes, node, step, step-ai, step-draft, new-node, focus-node, finish, finish-ai",
    "兼容别名：show-state, list-nodes, show-node, ai-step, ai-draft, finish-node, finish-node --ai, ai-finish",
    "AI 草稿来自 DeepSeek，先生成草稿，再走现有步骤或结束流程。",
    "finish / finish-ai 只生成当前节点的 summary / conclusion 草稿，再落入 finish 流程。",
    "",
  ].join("\n"));
}

/** CLI 主分发函数。 */
async function main() {
  const [command] = process.argv.slice(2);

  if (!command) {
    printUsage();
    if (process.stdin.isTTY) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = (await rl.question("选择命令 [init/reset/status/show-state/nodes/node/step/step-ai/step-draft/new-node/focus-node/finish/finish-ai/exit]：")).trim();
        if (answer === "exit" || answer === "") {
          return;
        }
        process.argv.splice(2, process.argv.length - 2, answer);
      } finally {
        rl.close();
      }
    } else {
      return;
    }
  }

  const nextCommand = process.argv[2];
  const dryRun = nextCommand === "step-draft" || nextCommand === "ai-draft" || getCommandArgs().includes("--dry-run");

  if (nextCommand === "init") {
    await handleInit();
    return;
  }

  if (nextCommand === "reset") {
    await handleReset();
    return;
  }

  if (nextCommand === "status") {
    await handleStatus();
    return;
  }

  if (nextCommand === "show-state") {
    await handleShowState();
    return;
  }

  if (nextCommand === "nodes" || nextCommand === "list-nodes") {
    await handleListNodes();
    return;
  }

  if (nextCommand === "node" || nextCommand === "show-node") {
    await handleShowNode();
    return;
  }

  if (nextCommand === "step") {
    await handleStep();
    return;
  }

  if (nextCommand === "step-ai" || nextCommand === "ai-step") {
    await handleAiStep({ dryRun });
    return;
  }

  if (nextCommand === "step-draft" || nextCommand === "ai-draft") {
    await handleAiStep({ dryRun: true });
    return;
  }

  if (nextCommand === "new-node") {
    await handleNewNode();
    return;
  }

  if (nextCommand === "focus-node") {
    await handleFocusNode();
    return;
  }

  if (nextCommand === "finish" || nextCommand === "finish-node") {
    await handleFinishNode();
    return;
  }

  if (nextCommand === "finish-ai" || nextCommand === "ai-finish") {
    await handleFinishNode({ aiMode: true });
    return;
  }

  printUsage();
}

export {
  collectProjectTreeRows,
  getProjectNodeStepRecords,
  getProjectNodeTreeInfo,
  main,
  planFocusedProjectStep,
  printProjectNodeDetails,
  printProjectNodeList,
  runFocusedProjectStep,
};

const isDirectExecution = process.argv[1]
  ? path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
  : false;

if (isDirectExecution) {
  await main();
}
