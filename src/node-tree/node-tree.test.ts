import assert from "node:assert/strict";
import test from "node:test";

import { createChildNodeFromCandidate } from "./create-child-node-from-candidate.js";
import { executeSceneNode } from "./execute-scene-node.js";
import { createInMemoryNodeStore } from "./node-store.js";
import { createInMemoryTreeStore } from "./tree-store.js";
import { createTreeService } from "./tree-service.js";
import {
  executeAdvanceScene,
  type AdvanceSceneRawResult,
  type AdvanceSceneRuntime,
} from "../workflows/advance/scene.js";
import type { CliIO } from "../workflows/advance/cli.js";
import type { PromptMessage, WorkflowModel } from "../workflows/advance/model.js";

class QueueWorkflowModel implements WorkflowModel {
  private readonly outputs: string[];

  readonly calls: PromptMessage[][] = [];

  constructor(outputs: string[]) {
    this.outputs = [...outputs];
  }

  async complete(messages: PromptMessage[]): Promise<string> {
    this.calls.push(messages.map((message) => ({ ...message })));

    const output = this.outputs.shift();
    if (output === undefined) {
      throw new Error("测试 stub 没有足够的输出。");
    }

    return output;
  }
}

function createFakeRawResult(lastAssistantOutput = "done"): AdvanceSceneRawResult {
  return {
    rawMessages: [],
    endReason: "confirm",
    currentState: "C",
    lastAssistantOutput,
  };
}

function createFakeRuntime(): AdvanceSceneRuntime {
  return {
    model: {
      async complete(): Promise<string> {
        throw new Error("这个测试不应该调用真实模型。");
      },
    },
  };
}

function createFakeIo(inputs: string[]): { io: CliIO; outputs: string[] } {
  const queue = [...inputs];
  const outputs: string[] = [];

  return {
    io: {
      async readLine(): Promise<string> {
        const next = queue.shift();
        if (next === undefined) {
          throw new Error("测试 IO 没有更多输入。");
        }

        return next;
      },
      async writeLine(text: string): Promise<void> {
        outputs.push(text);
      },
      async close(): Promise<void> {
        return;
      },
    },
    outputs,
  };
}

test("createNode 返回的节点具备正确初始状态与空 meta", () => {
  const nodeStore = createInMemoryNodeStore();
  const node = nodeStore.createNode("advance", {});

  assert.equal(node.sceneType, "advance");
  assert.deepEqual(node.sceneInput, {});
  assert.equal(node.executionStatus, "idle");
  assert.equal(node.rawResult, null);
  assert.equal(node.errorMessage, null);
  assert.deepEqual(node.meta, {
    title: null,
    summary: null,
    sourceParentNodeId: null,
    sourceCandidateId: null,
    sourceCandidateType: null,
  });
  assert.ok(node.id);
});

test("createNode 支持写入候选派生 meta", () => {
  const nodeStore = createInMemoryNodeStore();
  const node = nodeStore.createNode("advance", {}, {
    title: "拆登录约束",
    summary: "把登录约束单独推进",
    sourceParentNodeId: "parent-1",
    sourceCandidateId: "candidate-1",
    sourceCandidateType: "constraint",
  });

  assert.deepEqual(node.meta, {
    title: "拆登录约束",
    summary: "把登录约束单独推进",
    sourceParentNodeId: "parent-1",
    sourceCandidateId: "candidate-1",
    sourceCandidateType: "constraint",
  });
});

test("getNodeById 命中返回节点，未命中返回 null", () => {
  const nodeStore = createInMemoryNodeStore();
  const node = nodeStore.createNode("advance", {});

  assert.equal(nodeStore.getNodeById(node.id)?.id, node.id);
  assert.equal(nodeStore.getNodeById("missing-node-id"), null);
});

test("createRoot 成功写入根关系，重复创建根节点失败", () => {
  const nodeStore = createInMemoryNodeStore();
  const treeStore = createInMemoryTreeStore();
  const treeService = createTreeService(nodeStore, treeStore);
  const rootNode = nodeStore.createNode("advance", {});
  const secondNode = nodeStore.createNode("advance", {});

  treeService.createRoot(rootNode.id);

  assert.equal(treeStore.getRootNodeId(), rootNode.id);
  assert.deepEqual(treeStore.getRelation(rootNode.id), {
    parentId: null,
    childrenIds: [],
  });

  assert.throws(() => treeService.createRoot(secondNode.id), /root node/);
});

test("createChild 成功挂载子节点，非法挂载直接失败", () => {
  const nodeStore = createInMemoryNodeStore();
  const treeStore = createInMemoryTreeStore();
  const treeService = createTreeService(nodeStore, treeStore);
  const rootNode = nodeStore.createNode("advance", {});
  const childNode = nodeStore.createNode("advance", {});
  const anotherParent = nodeStore.createNode("advance", {});

  treeService.createRoot(rootNode.id);
  treeService.createChild(rootNode.id, childNode.id);

  assert.deepEqual(treeStore.getRelation(childNode.id), {
    parentId: rootNode.id,
    childrenIds: [],
  });
  assert.deepEqual(treeStore.getRelation(rootNode.id), {
    parentId: null,
    childrenIds: [childNode.id],
  });

  assert.throws(
    () => treeService.createChild(anotherParent.id, nodeStore.createNode("advance", {}).id),
    /父节点尚未挂入树中/,
  );
  assert.throws(() => treeService.createChild(rootNode.id, childNode.id), /不能重复挂载/);
});

test("getChildren 只返回直接子节点，不递归返回孙节点", () => {
  const nodeStore = createInMemoryNodeStore();
  const treeStore = createInMemoryTreeStore();
  const treeService = createTreeService(nodeStore, treeStore);
  const rootNode = nodeStore.createNode("advance", {});
  const childA = nodeStore.createNode("advance", {});
  const childB = nodeStore.createNode("advance", {});
  const grandChild = nodeStore.createNode("advance", {});

  treeService.createRoot(rootNode.id);
  treeService.createChild(rootNode.id, childA.id);
  treeService.createChild(rootNode.id, childB.id);
  treeService.createChild(childA.id, grandChild.id);

  const children = treeService.getChildren(rootNode.id);

  assert.deepEqual(
    children.map((child) => child.id),
    [childA.id, childB.id],
  );
});

test("getChildren 遇到悬空 childId 时直接抛错", () => {
  const nodeStore = createInMemoryNodeStore();
  const treeStore = createInMemoryTreeStore();
  const treeService = createTreeService(nodeStore, treeStore);
  const rootNode = nodeStore.createNode("advance", {});

  treeService.createRoot(rootNode.id);
  treeStore.attachChild(rootNode.id, "dangling-child-id");

  assert.throws(() => treeService.getChildren(rootNode.id), /不存在的子节点/);
});

test("createChildNodeFromCandidate 成功创建 child node 并挂树", () => {
  const nodeStore = createInMemoryNodeStore();
  const treeStore = createInMemoryTreeStore();
  const treeService = createTreeService(nodeStore, treeStore);
  const rootNode = nodeStore.createNode("advance", {});

  treeService.createRoot(rootNode.id);

  const childNode = createChildNodeFromCandidate({
    parentNodeId: rootNode.id,
    candidate: {
      candidateId: "candidate-1",
      parentNodeId: rootNode.id,
      title: "拆登录限制",
      summary: "把登录限制抽成单独子节点",
      type: "constraint",
      reason: "这会单独影响推进判断",
      evidence: "用户多次提到限制条件",
    },
    nodeStore,
    treeService,
  });

  assert.deepEqual(childNode.meta, {
    title: "拆登录限制",
    summary: "把登录限制抽成单独子节点",
    sourceParentNodeId: rootNode.id,
    sourceCandidateId: "candidate-1",
    sourceCandidateType: "constraint",
  });
  assert.deepEqual(treeStore.getRelation(rootNode.id), {
    parentId: null,
    childrenIds: [childNode.id],
  });
  assert.deepEqual(treeStore.getRelation(childNode.id), {
    parentId: rootNode.id,
    childrenIds: [],
  });
});

test("executeSceneNode 成功时写回 rawResult 并返回原始结果", async () => {
  const nodeStore = createInMemoryNodeStore();
  const node = nodeStore.createNode("advance", {});
  const result = createFakeRawResult("scene-completed");

  const returned = await executeSceneNode(node.id, {
    nodeStore,
    executors: {
      advance: async (input, runtime) => {
        assert.deepEqual(input, {});
        assert.ok(runtime.model);
        assert.equal(nodeStore.getNodeById(node.id)?.executionStatus, "running");
        return result;
      },
    },
    runtime: createFakeRuntime(),
  });

  const completedNode = nodeStore.getNodeById(node.id);

  assert.equal(returned, result);
  assert.equal(completedNode?.executionStatus, "completed");
  assert.equal(completedNode?.rawResult, result);
  assert.equal(completedNode?.errorMessage, null);
});

test("executeSceneNode 失败时写入 failed 和 errorMessage，并继续抛错", async () => {
  const nodeStore = createInMemoryNodeStore();
  const node = nodeStore.createNode("advance", {});

  await assert.rejects(
    () =>
      executeSceneNode(node.id, {
        nodeStore,
        executors: {
          advance: async () => {
            assert.equal(nodeStore.getNodeById(node.id)?.executionStatus, "running");
            throw new Error("scene failed");
          },
        },
        runtime: createFakeRuntime(),
      }),
    /scene failed/,
  );

  const failedNode = nodeStore.getNodeById(node.id);

  assert.equal(failedNode?.executionStatus, "failed");
  assert.equal(failedNode?.rawResult, null);
  assert.equal(failedNode?.errorMessage, "scene failed");
});

test("executeSceneNode 不允许重复执行 completed 节点或 failed 节点", async () => {
  const successStore = createInMemoryNodeStore();
  const successNode = successStore.createNode("advance", {});

  await executeSceneNode(successNode.id, {
    nodeStore: successStore,
    executors: {
      advance: async () => createFakeRawResult("completed-once"),
    },
    runtime: createFakeRuntime(),
  });

  await assert.rejects(
    () =>
      executeSceneNode(successNode.id, {
        nodeStore: successStore,
        executors: {
          advance: async () => createFakeRawResult("should-not-run"),
        },
        runtime: createFakeRuntime(),
      }),
    /不允许执行/,
  );

  const failedStore = createInMemoryNodeStore();
  const failedNode = failedStore.createNode("advance", {});

  await assert.rejects(
    () =>
      executeSceneNode(failedNode.id, {
        nodeStore: failedStore,
        executors: {
          advance: async () => {
            throw new Error("fail-once");
          },
        },
        runtime: createFakeRuntime(),
      }),
    /fail-once/,
  );

  await assert.rejects(
    () =>
      executeSceneNode(failedNode.id, {
        nodeStore: failedStore,
        executors: {
          advance: async () => createFakeRawResult("should-not-run"),
        },
        runtime: createFakeRuntime(),
      }),
    /不允许执行/,
  );
});

test("executeAdvanceScene 原样返回 advance workflow 的 handoff 结果", async () => {
  const model = new QueueWorkflowModel([
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
    "confirm",
  ]);
  const { io, outputs } = createFakeIo(["给我候选", "就按 A 走"]);

  const result = await executeAdvanceScene({}, { model, io });

  assert.equal(result.endReason, "confirm");
  assert.equal(result.currentState, "C");
  assert.equal(result.lastAssistantOutput, "当前问题\n候选方向\n优先候选\n确认提示");
  assert.equal(result.rawMessages.length, 3);
  assert.equal(outputs.some((line) => line.includes("=== handoff ===")), true);
});
