import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { createTreeService } from "../node-tree/tree-service.js";
import { createSqliteClient } from "../persistence/sqlite/client.js";
import { createSqliteNodeStore } from "../persistence/sqlite/node-store.js";
import { ensureSqliteSchema } from "../persistence/sqlite/schema.js";
import { createSqliteTreeStore } from "../persistence/sqlite/tree-store.js";
import type { PromptMessage, WorkflowModel } from "../workflows/advance/model.js";
import type { AdvanceSceneRawResult } from "../workflows/advance/scene.js";
import { advanceNodeAction, exitNodeAdvanceAction } from "./node-advance-actions.js";

const TEST_DB_DIR = join(process.cwd(), ".tmp-node-advance-actions-tests");

class QueueWorkflowModel implements WorkflowModel {
  private readonly outputs: string[];

  constructor(outputs: string[]) {
    this.outputs = [...outputs];
  }

  async complete(_messages: PromptMessage[]): Promise<string> {
    const next = this.outputs.shift();
    if (next === undefined) {
      throw new Error("测试 stub 没有足够的输出。");
    }

    return next;
  }
}

function createTestDatabasePath(): string {
  mkdirSync(TEST_DB_DIR, { recursive: true });
  return join(TEST_DB_DIR, `${randomUUID()}.db`);
}

function removeTestDatabase(path: string): void {
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}

function createRawResult(): AdvanceSceneRawResult {
  return {
    rawMessages: [new HumanMessage("先看登录问题"), new AIMessage("可以先拆登录上下文")],
    endReason: "confirm",
    currentState: "C",
    phase: "ended",
    lastAssistantOutput: "可以先拆登录上下文",
  };
}

async function createCompletedRootNode(dbPath: string): Promise<string> {
  const client = createSqliteClient(dbPath);

  try {
    ensureSqliteSchema(client);
    const nodeStore = createSqliteNodeStore(client);
    const treeStore = createSqliteTreeStore(client);
    const treeService = createTreeService(nodeStore, treeStore);
    const rootNode = nodeStore.createNode("advance", {});

    treeService.createRoot(rootNode.id);
    nodeStore.replaceNode({
      ...rootNode,
      executionStatus: "completed",
      rawResult: createRawResult(),
    });

    return rootNode.id;
  } finally {
    client.close();
  }
}

test("advanceNodeAction 能继续推进已完成节点并写回最新快照", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const nodeId = await createCompletedRootNode(dbPath);

    const result = await advanceNodeAction({
      databasePath: dbPath,
      nodeId,
      message: "继续压实登录边界",
      model: new QueueWorkflowModel(["B", "当前问题已经收敛到登录边界，下一步继续压实权限前提。"]),
    });

    assert.equal(result.nodeId, nodeId);
    assert.equal(result.action, "advance");
    assert.equal(result.workflow.phase, "normal");
    assert.equal(result.workflow.currentState, "B");
    assert.equal(result.workflow.ended, false);
    assert.equal(result.workflow.endReason, null);
    assert.equal(result.candidateRefreshRecommended, false);
    assert.equal(result.hint?.level, "info");

    const client = createSqliteClient(dbPath);
    try {
      const nodeStore = createSqliteNodeStore(client);
      const node = nodeStore.getNodeById(nodeId);

      assert.ok(node);
      assert.equal(node?.executionStatus, "completed");
      assert.equal(node?.rawResult?.phase, "normal");
      assert.equal(node?.rawResult?.endReason, null);
      assert.equal(node?.rawResult?.rawMessages.length, 4);
      assert.equal(node?.rawResult?.analysisMessages?.length, 4);
      assert.equal(node?.rawResult?.lastAssistantOutput, result.latestAssistantOutput);
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("advanceNodeAction 不允许继续推进 failed 节点", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const nodeId = await createCompletedRootNode(dbPath);
    const client = createSqliteClient(dbPath);

    try {
      const nodeStore = createSqliteNodeStore(client);
      const node = nodeStore.getNodeById(nodeId);
      assert.ok(node);

      nodeStore.replaceNode({
        ...node!,
        executionStatus: "failed",
        errorMessage: "上一轮失败",
      });
    } finally {
      client.close();
    }

    await assert.rejects(
      () =>
        advanceNodeAction({
          databasePath: dbPath,
          nodeId,
          message: "继续推进",
          model: new QueueWorkflowModel([]),
        }),
      /failed 节点不允许继续推进/,
    );
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("exitNodeAdvanceAction 能结束当前节点推进且不追加聊天消息", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const nodeId = await createCompletedRootNode(dbPath);

    const result = exitNodeAdvanceAction({
      databasePath: dbPath,
      nodeId,
    });

    assert.equal(result.nodeId, nodeId);
    assert.equal(result.action, "exit");
    assert.equal(result.workflow.phase, "ended");
    assert.equal(result.workflow.ended, true);
    assert.equal(result.workflow.endReason, "explicit_exit");
    assert.equal(result.candidateRefreshRecommended, true);
    assert.equal(result.hint?.level, "info");

    const client = createSqliteClient(dbPath);
    try {
      const nodeStore = createSqliteNodeStore(client);
      const node = nodeStore.getNodeById(nodeId);

      assert.ok(node);
      assert.equal(node?.rawResult?.phase, "ended");
      assert.equal(node?.rawResult?.endReason, "explicit_exit");
      assert.equal(node?.rawResult?.rawMessages.length, 2);
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});
