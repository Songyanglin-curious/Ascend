import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { AIMessage, HumanMessage } from "@langchain/core/messages";

import { createTreeService } from "../node-tree/tree-service.js";
import type { PromptMessage, WorkflowModel } from "../workflows/advance/model.js";
import type { AdvanceSceneRawResult } from "../workflows/advance/scene.js";
import { createSqliteClient } from "../persistence/sqlite/client.js";
import { createSqliteNodeStore } from "../persistence/sqlite/node-store.js";
import { ensureSqliteSchema } from "../persistence/sqlite/schema.js";
import { createSqliteTreeStore } from "../persistence/sqlite/tree-store.js";
import { loadNodeCandidates } from "../read-model/candidate-service.js";
import { confirmNodeCandidatesAction } from "./candidate-actions.js";

const TEST_DB_DIR = join(process.cwd(), ".tmp-candidate-actions-tests");

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
    rawMessages: [new HumanMessage("把系统继续拆子问题"), new AIMessage("可以提几个候选")],
    endReason: "confirm",
    currentState: "C",
    lastAssistantOutput: "可以提几个候选",
  };
}

function createExtractorOutput(): string {
  return JSON.stringify([
    {
      title: "拆登录问题",
      summary: "把登录问题单独推进",
      type: "question",
      reason: "登录问题可以独立推进",
      evidence: "用户反复提到登录异常",
    },
    {
      title: "拆权限设计",
      summary: "把权限设计作为独立候选",
      type: "constraint",
      reason: "权限会影响后续结构",
      evidence: "用户明确提到权限边界",
    },
  ]);
}

async function createRootNode(dbPath: string): Promise<string> {
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

test("confirmNodeCandidatesAction 空选择时返回 createdCount = 0", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const parentNodeId = await createRootNode(dbPath);
    const model = new QueueWorkflowModel([createExtractorOutput()]);

    const result = await confirmNodeCandidatesAction({
      databasePath: dbPath,
      parentNodeId,
      selectedCandidateIds: [],
      model,
    });

    assert.equal(result.parentNodeId, parentNodeId);
    assert.equal(result.createdCount, 0);
    assert.deepEqual(result.createdNodes, []);
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("confirmNodeCandidatesAction 能确认来自最新候选事件批次的未选候选", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const parentNodeId = await createRootNode(dbPath);
    const client = createSqliteClient(dbPath);

    try {
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
        "legacy:pending",
        JSON.stringify({
          candidateId: "legacy:pending",
          parentNodeId,
          title: "来自事件批次的候选",
          summary: "这条候选不是现提取，而是未确认的历史候选",
          type: "direction",
          reason: "应该允许在页面继续确认",
          evidence: "候选事件表中 selected = 0",
        }),
        0,
        "2026-04-07 09:00:00",
      );
    } finally {
      client.close();
    }

    const readModel = await loadNodeCandidates({
      databasePath: dbPath,
      parentNodeId,
      model: new QueueWorkflowModel([]),
    });

    assert.equal(readModel.candidates.length, 1);

    const result = await confirmNodeCandidatesAction({
      databasePath: dbPath,
      parentNodeId,
      selectedCandidateIds: [readModel.candidates[0]!.candidateId],
      model: new QueueWorkflowModel([]),
    });

    assert.equal(result.createdCount, 1);
    assert.equal(result.createdNodes[0]?.sourceCandidateId, readModel.candidates[0]?.candidateId);
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("confirmNodeCandidatesAction 非法 candidateId 时直接失败", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const parentNodeId = await createRootNode(dbPath);
    const model = new QueueWorkflowModel([createExtractorOutput()]);

    await assert.rejects(
      () =>
        confirmNodeCandidatesAction({
          databasePath: dbPath,
          parentNodeId,
          selectedCandidateIds: ["candidate:not-belong-here"],
          model,
        }),
      /candidateId 不属于当前父节点/,
    );
  } finally {
    removeTestDatabase(dbPath);
  }
});

test("confirmNodeCandidatesAction 多选时能创建多个 child node 并写入候选事件", async () => {
  const dbPath = createTestDatabasePath();

  try {
    const parentNodeId = await createRootNode(dbPath);
    const loadModel = new QueueWorkflowModel([createExtractorOutput()]);
    const readModel = await loadNodeCandidates({
      databasePath: dbPath,
      parentNodeId,
      model: loadModel,
    });

    const selectedCandidateIds = readModel.candidates.map((candidate) => candidate.candidateId);
    const actionModel = new QueueWorkflowModel([createExtractorOutput()]);

    const result = await confirmNodeCandidatesAction({
      databasePath: dbPath,
      parentNodeId,
      selectedCandidateIds,
      model: actionModel,
    });

    assert.equal(result.createdCount, 2);
    assert.deepEqual(
      result.createdNodes.map((node) => node.sourceCandidateId),
      selectedCandidateIds,
    );

    const client = createSqliteClient(dbPath);
    try {
      const nodeCountRow = client.db.prepare(`SELECT COUNT(*) AS total FROM nodes`).get() as {
        total: number;
      };
      const childRows = client.db
        .prepare(
          `SELECT node_id FROM tree_relations WHERE parent_id = ? ORDER BY position ASC`,
        )
        .all(parentNodeId) as Array<{ node_id: string }>;
      const candidateEventRows = client.db
        .prepare(
          `SELECT candidate_id, selected FROM child_candidate_events WHERE parent_node_id = ? ORDER BY created_at ASC, id ASC`,
        )
        .all(parentNodeId) as Array<{ candidate_id: string; selected: number }>;

      assert.equal(nodeCountRow.total, 3);
      assert.equal(childRows.length, 2);
      assert.deepEqual(
        candidateEventRows.map((row) => row.candidate_id).sort(),
        [...selectedCandidateIds].sort(),
      );
      assert.deepEqual(
        candidateEventRows.map((row) => row.selected),
        [1, 1],
      );
    } finally {
      client.close();
    }
  } finally {
    removeTestDatabase(dbPath);
  }
});
