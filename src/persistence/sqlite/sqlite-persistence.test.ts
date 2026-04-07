import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { processCompletedNodeChildCandidates } from "../../child-candidates/flow.js";
import { createTreeService } from "../../node-tree/tree-service.js";
import type { PromptMessage, WorkflowModel } from "../../workflows/advance/model.js";
import type { AdvanceSceneRawResult } from "../../workflows/advance/scene.js";
import { createSqliteClient } from "./client.js";
import { createSqliteChildCandidateEventStore } from "./child-candidate-event-store.js";
import { createSqliteNodeStore } from "./node-store.js";
import { ensureSqliteSchema } from "./schema.js";
import { createSqliteTreeStore } from "./tree-store.js";

const TEST_DB_DIR = join(process.cwd(), ".tmp-sqlite-tests");

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

function createFakeConfirmationIo(inputs: string[]) {
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

function createRawResult(): AdvanceSceneRawResult {
  return {
    rawMessages: [new HumanMessage("我卡在登录"), new AIMessage("先拆候选方向")],
    endReason: "confirm",
    currentState: "C",
    lastAssistantOutput: "先拆候选方向",
  };
}

test("ensureSqliteSchema 能创建 4 张表并初始化 tree_state", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      ensureSqliteSchema(client);

      const tables = client.db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name ASC`)
        .all() as Array<{ name: string }>;
      const tableNames = tables.map((table) => table.name);

      assert.equal(tableNames.includes("nodes"), true);
      assert.equal(tableNames.includes("tree_state"), true);
      assert.equal(tableNames.includes("tree_relations"), true);
      assert.equal(tableNames.includes("child_candidate_events"), true);

      const treeState = client.db
        .prepare(`SELECT singleton_id, root_node_id FROM tree_state WHERE singleton_id = 1`)
        .get() as { singleton_id: number; root_node_id: string | null } | undefined;

      assert.deepEqual(treeState, {
        singleton_id: 1,
        root_node_id: null,
      });
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("SQLite NodeStore 能持久化 createNode 和 replaceNode", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      ensureSqliteSchema(client);
      const nodeStore = createSqliteNodeStore(client);

      const node = nodeStore.createNode("advance", {}, {
        title: "测试标题",
        summary: "测试摘要",
      });

      nodeStore.replaceNode({
        ...node,
        executionStatus: "completed",
        rawResult: createRawResult(),
      });

      const restored = nodeStore.getNodeById(node.id);

      assert.ok(restored);
      assert.equal(restored?.executionStatus, "completed");
      assert.equal(restored?.meta.title, "测试标题");
      assert.equal(restored?.rawResult?.rawMessages.length, 2);
      assert.equal(restored?.rawResult?.rawMessages[0]?.getType(), "human");
      assert.equal(restored?.rawResult?.rawMessages[1]?.getType(), "ai");
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("SQLite TreeStore 能持久化 root 与 child 顺序", () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      ensureSqliteSchema(client);
      const nodeStore = createSqliteNodeStore(client);
      const treeStore = createSqliteTreeStore(client);
      const treeService = createTreeService(nodeStore, treeStore);

      const rootNode = nodeStore.createNode("advance", {});
      const childA = nodeStore.createNode("advance", {});
      const childB = nodeStore.createNode("advance", {});

      treeService.createRoot(rootNode.id);
      treeService.createChild(rootNode.id, childA.id);
      treeService.createChild(rootNode.id, childB.id);

      assert.equal(treeStore.getRootNodeId(), rootNode.id);
      assert.deepEqual(treeStore.getChildIds(rootNode.id), [childA.id, childB.id]);
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("processCompletedNodeChildCandidates 能落盘 child_candidate_events、child nodes 与 tree_relations", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const client = createSqliteClient(dbPath);
    try {
      ensureSqliteSchema(client);
      const nodeStore = createSqliteNodeStore(client);
      const treeStore = createSqliteTreeStore(client);
      const treeService = createTreeService(nodeStore, treeStore);
      const candidateEventStore = createSqliteChildCandidateEventStore(client);
      const rootNode = client.transaction(() => {
        const createdRootNode = nodeStore.createNode("advance", {});
        treeService.createRoot(createdRootNode.id);
        nodeStore.replaceNode({
          ...createdRootNode,
          executionStatus: "completed",
          rawResult: createRawResult(),
        });
        return createdRootNode;
      });

      const model = new QueueWorkflowModel([
        JSON.stringify([
          {
            title: "拆登录问题",
            summary: "把登录问题单独推进",
            type: "question",
            reason: "这是独立问题",
            evidence: "用户多次提到登录问题",
          },
          {
            title: "拆登录约束",
            summary: "把登录约束单独推进",
            type: "constraint",
            reason: "约束会影响后续判断",
            evidence: "用户强调了限制条件",
          },
        ]),
      ]);
      const io = createFakeConfirmationIo(["2,1"]);

      const childNodes = await processCompletedNodeChildCandidates({
        parentNodeId: rootNode.id,
        nodeStore,
        treeService,
        candidateEventStore,
        transaction: client.transaction,
        model,
        io,
      });

      assert.equal(childNodes.length, 2);
      assert.deepEqual(treeStore.getChildIds(rootNode.id), childNodes.map((node) => node.id));

      const events = client.db
        .prepare(
          `SELECT parent_node_id, candidate_id, selected FROM child_candidate_events ORDER BY created_at ASC, id ASC`,
        )
        .all() as Array<{ parent_node_id: string; candidate_id: string; selected: number }>;

      assert.equal(events.length, 2);
      assert.deepEqual(
        events.map((event) => event.selected),
        [1, 1],
      );
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("关闭并重新打开数据库后，既有 nodes 与 tree 仍可读", () => {
  const dbPath = createTestDatabasePath();

  try {
    {
      const client = createSqliteClient(dbPath);
      ensureSqliteSchema(client);

      const nodeStore = createSqliteNodeStore(client);
      const treeStore = createSqliteTreeStore(client);
      const treeService = createTreeService(nodeStore, treeStore);
      const rootNode = nodeStore.createNode("advance", {});
      const childNode = nodeStore.createNode("advance", {});

      treeService.createRoot(rootNode.id);
      treeService.createChild(rootNode.id, childNode.id);

      client.close();
    }

    {
      const client = createSqliteClient(dbPath);
      try {
        ensureSqliteSchema(client);
        const nodeStore = createSqliteNodeStore(client);
        const treeStore = createSqliteTreeStore(client);

        const snapshot = treeStore.getTreeSnapshot();

        assert.ok(snapshot.rootNodeId);
        assert.equal(nodeStore.getAllNodes().length, 2);
        assert.equal(snapshot.relations[snapshot.rootNodeId!]?.childrenIds.length, 1);
      } finally {
        client.close();
      }
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});
