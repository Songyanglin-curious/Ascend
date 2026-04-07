import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { createTreeService } from "../node-tree/tree-service.js";
import type { AdvanceSceneRawResult } from "../workflows/advance/scene.js";
import { createSqliteClient } from "../persistence/sqlite/client.js";
import { createSqliteNodeStore } from "../persistence/sqlite/node-store.js";
import { ensureSqliteSchema } from "../persistence/sqlite/schema.js";
import { createSqliteTreeStore } from "../persistence/sqlite/tree-store.js";
import { loadPageReadModel } from "./page-service.js";

const TEST_DB_DIR = join(process.cwd(), ".tmp-page-read-model-tests");

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
    rawMessages: [new HumanMessage("我想先看登录问题"), new AIMessage("可以先拆登录上下文")],
    endReason: "confirm",
    currentState: "C",
    lastAssistantOutput: "可以先拆登录上下文",
  };
}

test("空库读取页面只读模型时返回空树状态", () => {
  const dbPath = createTestDatabasePath();

  try {
    const model = loadPageReadModel(dbPath);

    assert.equal(model.rootNodeId, null);
    assert.deepEqual(model.nodes, []);
    assert.deepEqual(model.relations, []);
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("存在 root 和 child 时返回正确的树关系", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);

    try {
      ensureSqliteSchema(client);

      const nodeStore = createSqliteNodeStore(client);
      const treeStore = createSqliteTreeStore(client);
      const treeService = createTreeService(nodeStore, treeStore);

      const rootNode = nodeStore.createNode("advance", {}, { title: "根节点" });
      const childNode = nodeStore.createNode("advance", {}, { title: "子节点" });

      treeService.createRoot(rootNode.id);
      treeService.createChild(rootNode.id, childNode.id);
    } finally {
      client.close();
    }

    const model = loadPageReadModel(dbPath);

    assert.ok(model.rootNodeId);
    assert.equal(model.nodes.length, 2);
    assert.deepEqual(
      model.relations.find((relation) => relation.nodeId === model.rootNodeId),
      {
        nodeId: model.rootNodeId,
        parentId: null,
        childrenIds: model.relations
          .find((relation) => relation.parentId === model.rootNodeId)
          ? [model.relations.find((relation) => relation.parentId === model.rootNodeId)!.nodeId]
          : [],
      },
    );
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("存在 rawMessages 时按 user 和 assistant 顺序返回页面消息", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);

    try {
      ensureSqliteSchema(client);

      const nodeStore = createSqliteNodeStore(client);
      const node = nodeStore.createNode("advance", {}, { title: "消息节点" });

      nodeStore.replaceNode({
        ...node,
        executionStatus: "completed",
        rawResult: createRawResult(),
      });
    } finally {
      client.close();
    }

    const model = loadPageReadModel(dbPath);
    const messageNode = model.nodes.find((node) => node.title === "消息节点");

    assert.ok(messageNode);
    assert.deepEqual(messageNode?.messages, [
      {
        id: `${messageNode?.id}:message:0`,
        role: "user",
        content: "我想先看登录问题",
        order: 0,
      },
      {
        id: `${messageNode?.id}:message:1`,
        role: "assistant",
        content: "可以先拆登录上下文",
        order: 1,
      },
    ]);
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("节点没有 rawMessages 时页面消息返回空数组", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);

    try {
      ensureSqliteSchema(client);

      const nodeStore = createSqliteNodeStore(client);
      nodeStore.createNode("advance", {}, { title: "空消息节点" });
    } finally {
      client.close();
    }

    const model = loadPageReadModel(dbPath);
    const emptyNode = model.nodes.find((node) => node.title === "空消息节点");

    assert.ok(emptyNode);
    assert.deepEqual(emptyNode?.messages, []);
  } finally {
    removeTestDatabase(dbPath);
  }
});
