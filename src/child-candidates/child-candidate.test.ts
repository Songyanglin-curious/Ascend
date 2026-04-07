import assert from "node:assert/strict";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { createChildNodeFromCandidate } from "../node-tree/create-child-node-from-candidate.js";
import { createInMemoryNodeStore } from "../node-tree/node-store.js";
import { createInMemoryTreeStore } from "../node-tree/tree-store.js";
import { createTreeService } from "../node-tree/tree-service.js";
import type { SceneNode } from "../node-tree/types.js";
import type { ChildCandidateEventStore } from "../persistence/sqlite/child-candidate-event-store.js";
import type { PromptMessage, WorkflowModel } from "../workflows/advance/model.js";
import type { AdvanceSceneRawResult } from "../workflows/advance/scene.js";
import {
  confirmChildCandidates,
  formatChildCandidateList,
  type ConfirmationIO,
} from "./confirmation.js";
import { processCompletedNodeChildCandidates } from "./flow.js";
import {
  extractChildCandidates,
  parseChildCandidateJson,
  validateChildCandidateRawItem,
} from "./extractor.js";
import type { ChildCandidate } from "./types.js";

class QueueWorkflowModel implements WorkflowModel {
  private readonly outputs: string[];

  readonly calls: PromptMessage[][] = [];

  constructor(outputs: string[]) {
    this.outputs = [...outputs];
  }

  async complete(messages: PromptMessage[]): Promise<string> {
    this.calls.push(messages.map((message) => ({ ...message })));

    const next = this.outputs.shift();
    if (next === undefined) {
      throw new Error("测试 stub 没有足够的输出。");
    }

    return next;
  }
}

function createCandidate(index = 1): ChildCandidate {
  return {
    candidateId: `candidate-${index}`,
    parentNodeId: "parent-1",
    title: `候选标题 ${index}`,
    summary: `候选摘要 ${index}`,
    type: "question",
    reason: `候选原因 ${index}`,
    evidence: `候选证据 ${index}`,
  };
}

function createFakeConfirmationIo(inputs: string[]): ConfirmationIO & { outputs: string[] } {
  const queue = [...inputs];
  const outputs: string[] = [];

  return {
    outputs,
    async readLine(): Promise<string> {
      const next = queue.shift();
      if (next === undefined) {
        throw new Error("测试确认 IO 没有更多输入。");
      }

      return next;
    },
    async writeLine(text: string): Promise<void> {
      outputs.push(text);
    },
    async close(): Promise<void> {
      return;
    },
  };
}

function createFakeRawResult(): AdvanceSceneRawResult {
  return {
    rawMessages: [new HumanMessage("我现在卡在登录"), new AIMessage("先看约束条件")],
    endReason: "confirm",
    currentState: "C",
    lastAssistantOutput: "先拆候选方向",
  };
}

function createFakeCandidateEventStore(): ChildCandidateEventStore & {
  batches: Array<{
    parentNodeId: string;
    candidates: ChildCandidate[];
    selectedCandidateIds: string[];
  }>;
} {
  const batches: Array<{
    parentNodeId: string;
    candidates: ChildCandidate[];
    selectedCandidateIds: string[];
  }> = [];

  return {
    batches,
    recordConfirmationBatch(params): void {
      batches.push({
        parentNodeId: params.parentNodeId,
        candidates: [...params.candidates],
        selectedCandidateIds: [...params.selectedCandidateIds],
      });
    },
  };
}

function createCompletedParentNode(): {
  nodeStore: ReturnType<typeof createInMemoryNodeStore>;
  treeStore: ReturnType<typeof createInMemoryTreeStore>;
  treeService: ReturnType<typeof createTreeService>;
  parentNode: SceneNode;
} {
  const nodeStore = createInMemoryNodeStore();
  const treeStore = createInMemoryTreeStore();
  const treeService = createTreeService(nodeStore, treeStore);
  const parentNode = nodeStore.createNode("advance", {});

  treeService.createRoot(parentNode.id);
  nodeStore.replaceNode({
    ...parentNode,
    executionStatus: "completed",
    rawResult: createFakeRawResult(),
  });

  return {
    nodeStore,
    treeStore,
    treeService,
    parentNode: nodeStore.getNodeById(parentNode.id)!,
  };
}

test("parseChildCandidateJson 能解析合法 JSON 数组", () => {
  const parsed = parseChildCandidateJson(
    JSON.stringify([
      {
        title: "拆登录问题",
        summary: "把登录问题单独推进",
        type: "question",
        reason: "这是一个独立分支",
        evidence: "用户明确提到登录问题",
      },
    ]),
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.title, "拆登录问题");
});

test("parseChildCandidateJson 接受合法空数组", () => {
  assert.deepEqual(parseChildCandidateJson("[]"), []);
});

test("parseChildCandidateJson 遇到非法 JSON 直接失败", () => {
  assert.throws(() => parseChildCandidateJson("{"), /不是合法 JSON/);
});

test("validateChildCandidateRawItem 遇到非法字段直接失败", () => {
  assert.throws(
    () =>
      validateChildCandidateRawItem({
        title: "x",
        summary: "y",
        type: "invalid",
        reason: "z",
        evidence: "w",
      }),
    /type 非法/,
  );
});

test("extractChildCandidates 会保留 parentNodeId 并生成 candidateId", async () => {
  const model = new QueueWorkflowModel([
    JSON.stringify([
      {
        title: "拆约束",
        summary: "把约束独立推进",
        type: "constraint",
        reason: "约束单独影响判断",
        evidence: "用户强调了前提条件",
      },
    ]),
  ]);
  const candidates = await extractChildCandidates({
    parentNodeId: "parent-1",
    rawMessages: createFakeRawResult().rawMessages,
    model,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.parentNodeId, "parent-1");
  assert.equal(typeof candidates[0]?.candidateId, "string");
  assert.equal(model.calls.length, 1);
});

test("formatChildCandidateList 会展示多选提示", () => {
  const text = formatChildCandidateList([createCandidate(1), createCandidate(2)]);

  assert.equal(text.includes("=== child candidates ==="), true);
  assert.equal(text.includes("1. [question] 候选标题 1"), true);
  assert.equal(text.includes("2. [question] 候选标题 2"), true);
  assert.equal(text.includes("1,3"), true);
});

test("confirmChildCandidates 选择 0 或 none 时返回空数组", async () => {
  const firstIo = createFakeConfirmationIo(["0"]);
  const secondIo = createFakeConfirmationIo(["none"]);

  assert.deepEqual(await confirmChildCandidates([createCandidate()], firstIo), []);
  assert.deepEqual(await confirmChildCandidates([createCandidate()], secondIo), []);
});

test("confirmChildCandidates 支持一次选择多个编号", async () => {
  const io = createFakeConfirmationIo(["1,3"]);
  const selected = await confirmChildCandidates(
    [createCandidate(1), createCandidate(2), createCandidate(3)],
    io,
  );

  assert.deepEqual(
    selected.map((candidate) => candidate.candidateId),
    ["candidate-1", "candidate-3"],
  );
});

test("confirmChildCandidates 会去重并保持输入顺序", async () => {
  const io = createFakeConfirmationIo(["3 1 3 2"]);
  const selected = await confirmChildCandidates(
    [createCandidate(1), createCandidate(2), createCandidate(3)],
    io,
  );

  assert.deepEqual(
    selected.map((candidate) => candidate.candidateId),
    ["candidate-3", "candidate-1", "candidate-2"],
  );
});

test("confirmChildCandidates 非法输入会继续提示直到拿到合法输入", async () => {
  const io = createFakeConfirmationIo(["x", "1 2"]);
  const selected = await confirmChildCandidates([createCandidate(1), createCandidate(2)], io);

  assert.deepEqual(
    selected.map((candidate) => candidate.candidateId),
    ["candidate-1", "candidate-2"],
  );
  assert.equal(io.outputs.some((line) => line.includes("输入无效")), true);
});

test("createChildNodeFromCandidate 会把候选语义写入 child meta", () => {
  const nodeStore = createInMemoryNodeStore();
  const treeStore = createInMemoryTreeStore();
  const treeService = createTreeService(nodeStore, treeStore);
  const parentNode = nodeStore.createNode("advance", {});

  treeService.createRoot(parentNode.id);

  const childNode = createChildNodeFromCandidate({
    parentNodeId: parentNode.id,
    candidate: {
      candidateId: "candidate-9",
      parentNodeId: parentNode.id,
      title: "拆方向",
      summary: "把方向独立推进",
      type: "direction",
      reason: "这个方向值得单独展开",
      evidence: "用户已经比较过两个方向",
    },
    nodeStore,
    treeService,
  });

  assert.deepEqual(childNode.meta, {
    title: "拆方向",
    summary: "把方向独立推进",
    sourceParentNodeId: parentNode.id,
    sourceCandidateId: "candidate-9",
    sourceCandidateType: "direction",
  });
});

test("processCompletedNodeChildCandidates 在无候选时返回空数组且不创建子节点", async () => {
  const { nodeStore, treeStore, treeService, parentNode } = createCompletedParentNode();
  const model = new QueueWorkflowModel(["[]"]);
  const io = createFakeConfirmationIo([]);
  const candidateEventStore = createFakeCandidateEventStore();

  const result = await processCompletedNodeChildCandidates({
    parentNodeId: parentNode.id,
    nodeStore,
    treeService,
    candidateEventStore,
    transaction: (fn) => fn(),
    model,
    io,
  });

  assert.deepEqual(result, []);
  assert.deepEqual(candidateEventStore.batches, []);
  assert.deepEqual(treeStore.getRelation(parentNode.id), {
    parentId: null,
    childrenIds: [],
  });
  assert.equal(nodeStore.getAllNodes().length, 1);
});

test("processCompletedNodeChildCandidates 在人工拒绝时返回空数组并记录未选事件", async () => {
  const { nodeStore, treeStore, treeService, parentNode } = createCompletedParentNode();
  const model = new QueueWorkflowModel([
    JSON.stringify([
      {
        title: "拆登录问题",
        summary: "把登录问题单独推进",
        type: "question",
        reason: "这是独立问题",
        evidence: "用户多次回到登录问题",
      },
    ]),
  ]);
  const io = createFakeConfirmationIo(["0"]);
  const candidateEventStore = createFakeCandidateEventStore();

  const result = await processCompletedNodeChildCandidates({
    parentNodeId: parentNode.id,
    nodeStore,
    treeService,
    candidateEventStore,
    transaction: (fn) => fn(),
    model,
    io,
  });

  assert.deepEqual(result, []);
  assert.equal(candidateEventStore.batches.length, 1);
  assert.deepEqual(candidateEventStore.batches[0]?.selectedCandidateIds, []);
  assert.deepEqual(treeStore.getRelation(parentNode.id), {
    parentId: null,
    childrenIds: [],
  });
  assert.equal(nodeStore.getAllNodes().length, 1);
});

test("processCompletedNodeChildCandidates 在确认后批量创建真实子节点并挂树", async () => {
  const { nodeStore, treeStore, treeService, parentNode } = createCompletedParentNode();
  const model = new QueueWorkflowModel([
    JSON.stringify([
      {
        title: "拆登录约束",
        summary: "把登录约束单独推进",
        type: "constraint",
        reason: "约束会影响后续判断",
        evidence: "对话里已出现明确限制条件",
      },
      {
        title: "拆登录方向",
        summary: "把登录方向单独推进",
        type: "direction",
        reason: "方向值得单独展开",
        evidence: "对话里已有多个候选方向",
      },
      {
        title: "拆登录问题",
        summary: "把登录问题单独推进",
        type: "question",
        reason: "问题本身可独立推进",
        evidence: "用户明确问到了这个问题",
      },
    ]),
  ]);
  const io = createFakeConfirmationIo(["3,1"]);
  const candidateEventStore = createFakeCandidateEventStore();

  const childNodes = await processCompletedNodeChildCandidates({
    parentNodeId: parentNode.id,
    nodeStore,
    treeService,
    candidateEventStore,
    transaction: (fn) => fn(),
    model,
    io,
  });

  assert.equal(candidateEventStore.batches.length, 1);
  assert.deepEqual(candidateEventStore.batches[0]?.selectedCandidateIds.length, 2);
  assert.equal(childNodes.length, 2);
  assert.equal(nodeStore.getAllNodes().length, 3);
  assert.deepEqual(
    childNodes.map((node) => node.meta.title),
    ["拆登录问题", "拆登录约束"],
  );
  assert.deepEqual(treeStore.getRelation(parentNode.id), {
    parentId: null,
    childrenIds: childNodes.map((node) => node.id),
  });
  assert.deepEqual(treeStore.getRelation(childNodes[0]!.id), {
    parentId: parentNode.id,
    childrenIds: [],
  });
  assert.deepEqual(treeStore.getRelation(childNodes[1]!.id), {
    parentId: parentNode.id,
    childrenIds: [],
  });
});
