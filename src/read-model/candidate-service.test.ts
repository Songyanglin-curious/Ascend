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
import { loadNodeCandidates } from "./candidate-service.js";

const TEST_DB_DIR = join(process.cwd(), ".tmp-candidate-service-tests");

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
    rawMessages: [new HumanMessage("请帮我继续拆分"), new AIMessage("可以拆几个候选方向")],
    endReason: "confirm",
    currentState: "C",
    lastAssistantOutput: "可以拆几个候选方向",
  };
}

test("loadNodeCandidates 在父节点不存在时直接失败", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      ensureSqliteSchema(client);
    } finally {
      client.close();
    }

    await assert.rejects(
      () =>
        loadNodeCandidates({
          databasePath: dbPath,
          parentNodeId: "missing-node",
          model: new QueueWorkflowModel([]),
        }),
      /未找到候选读取对应的父节点/,
    );
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("loadNodeCandidates 在父节点无 rawResult 时返回空候选数组", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    let parentNodeId = "";

    try {
      ensureSqliteSchema(client);
      const nodeStore = createSqliteNodeStore(client);
      const treeStore = createSqliteTreeStore(client);
      const treeService = createTreeService(nodeStore, treeStore);
      const rootNode = nodeStore.createNode("advance", {});

      treeService.createRoot(rootNode.id);
      parentNodeId = rootNode.id;
    } finally {
      client.close();
    }

    const result = await loadNodeCandidates({
      databasePath: dbPath,
      parentNodeId,
      model: new QueueWorkflowModel([]),
    });

    assert.equal(result.parentNodeId, parentNodeId);
    assert.deepEqual(result.candidates, []);
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("loadNodeCandidates 在节点尚未结束时返回空候选数组且不调用模型", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    let parentNodeId = "";

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
        rawResult: {
          ...createRawResult(),
          endReason: null,
          phase: "await_c_intent",
        },
      });
      parentNodeId = rootNode.id;
    } finally {
      client.close();
    }

    const model = new QueueWorkflowModel([]);
    const result = await loadNodeCandidates({
      databasePath: dbPath,
      parentNodeId,
      model,
    });

    assert.deepEqual(result.candidates, []);
    assert.equal(model.calls.length, 0);
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("loadNodeCandidates 能返回合法候选并稳定 candidateId", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    let parentNodeId = "";

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
      parentNodeId = rootNode.id;
    } finally {
      client.close();
    }

    const extractorOutput = JSON.stringify([
      {
        title: "拆登录链路",
        summary: "把登录链路拆成独立子节点",
        type: "direction",
        reason: "这是单独推进方向",
        evidence: "用户持续围绕登录问题追问",
      },
    ]);
    const model = new QueueWorkflowModel([extractorOutput, extractorOutput]);

    const first = await loadNodeCandidates({
      databasePath: dbPath,
      parentNodeId,
      model,
    });
    const second = await loadNodeCandidates({
      databasePath: dbPath,
      parentNodeId,
      model,
    });

    assert.equal(first.candidates.length, 1);
    assert.equal(second.candidates.length, 1);
    assert.equal(first.candidates[0]?.candidateId, second.candidates[0]?.candidateId);
    assert.equal(first.candidates[0]?.title, "拆登录链路");
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("loadNodeCandidates 在已有最新候选事件且全部已选时返回空数组且不再调用模型", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    let parentNodeId = "";

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
      parentNodeId = rootNode.id;

      client.db
        .prepare(
          `
            INSERT INTO child_candidate_events (
              id,
              parent_node_id,
              candidate_id,
              candidate_json,
              selected,
              created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          randomUUID(),
          parentNodeId,
          "legacy:selected",
          JSON.stringify({
            candidateId: "legacy:selected",
            parentNodeId,
            title: "已确认候选",
            summary: "这个候选已经被确认过",
            type: "question",
            reason: "已经确认",
            evidence: "已有事件记录",
          }),
          1,
          "2026-04-06 22:00:00",
        );
    } finally {
      client.close();
    }

    const model = new QueueWorkflowModel([]);
    const result = await loadNodeCandidates({
      databasePath: dbPath,
      parentNodeId,
      model,
    });

    assert.deepEqual(result.candidates, []);
    assert.equal(model.calls.length, 0);
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("loadNodeCandidates 在已有最新候选事件时优先返回未选中的候选", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    let parentNodeId = "";

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
      parentNodeId = rootNode.id;

      const insert = client.db.prepare(
        `
          INSERT INTO child_candidate_events (
            id,
            parent_node_id,
            candidate_id,
            candidate_json,
            selected,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
      );

      insert.run(
        randomUUID(),
        parentNodeId,
        "legacy:selected",
        JSON.stringify({
          candidateId: "legacy:selected",
          parentNodeId,
          title: "已创建节点",
          summary: "这个候选已经确认完成",
          type: "direction",
          reason: "已经创建",
          evidence: "已有子节点",
        }),
        1,
        "2026-04-06 22:00:00",
      );
      insert.run(
        randomUUID(),
        parentNodeId,
        "legacy:pending",
        JSON.stringify({
          candidateId: "legacy:pending",
          parentNodeId,
          title: "待确认候选",
          summary: "这个候选还没有被确认",
          type: "constraint",
          reason: "仍待人工决定",
          evidence: "上一批没有选中",
        }),
        0,
        "2026-04-06 22:00:00",
      );
    } finally {
      client.close();
    }

    const model = new QueueWorkflowModel([]);
    const result = await loadNodeCandidates({
      databasePath: dbPath,
      parentNodeId,
      model,
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.title, "待确认候选");
    assert.equal(result.candidates[0]?.type, "constraint");
    assert.equal(model.calls.length, 0);
  } finally {
    removeTestDatabase(dbPath);
  }
});
