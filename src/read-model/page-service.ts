import type { BaseMessage } from "@langchain/core/messages";

import type { SceneNode } from "../node-tree/types.js";
import { createSqliteClient } from "../persistence/sqlite/client.js";
import { createSqliteNodeStore } from "../persistence/sqlite/node-store.js";
import { ensureSqliteSchema } from "../persistence/sqlite/schema.js";
import { createSqliteTreeStore } from "../persistence/sqlite/tree-store.js";
import type {
  PageMessageRecord,
  PageMessageRole,
  PageNodeRecord,
  PageReadModel,
  PageTreeRelationRecord,
} from "./page-types.js";

function mapMessageRole(message: BaseMessage): PageMessageRole {
  const type = message.getType();

  if (type === "human") {
    return "user";
  }

  if (type === "ai") {
    return "assistant";
  }

  throw new Error(`页面只读模型暂不支持消息类型: ${type}`);
}

function ensureMessageText(message: BaseMessage, nodeId: string, index: number): string {
  if (typeof message.text !== "string") {
    throw new Error(`节点 ${nodeId} 的第 ${index + 1} 条消息缺少可读文本。`);
  }

  return message.text;
}

function buildNodeLabel(node: SceneNode): string {
  if (node.meta.title && node.meta.title.trim() !== "") {
    return node.meta.title;
  }

  if (node.meta.summary && node.meta.summary.trim() !== "") {
    return node.meta.summary;
  }

  return `${node.sceneType}:${node.id.slice(0, 8)}`;
}

export function buildNodeMessages(node: SceneNode): PageMessageRecord[] {
  const rawMessages: BaseMessage[] = node.rawResult?.rawMessages ?? [];

  return rawMessages.map((message, index) => ({
    id: `${node.id}:message:${index}`,
    role: mapMessageRole(message),
    content: ensureMessageText(message, node.id, index),
    order: index,
  }));
}

export function buildTreeSnapshotRecords(
  relations: Record<string, { parentId: string | null; childrenIds: string[] }>,
): PageTreeRelationRecord[] {
  return Object.entries(relations)
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([nodeId, relation]) => ({
      nodeId,
      parentId: relation.parentId,
      childrenIds: [...relation.childrenIds],
    }));
}

export function loadPageReadModel(databasePath: string): PageReadModel {
  const client = createSqliteClient(databasePath);

  try {
    // 页面只读层也先收敛 schema，保证空库和旧库都能被稳定读取。
    ensureSqliteSchema(client);

    const nodeStore = createSqliteNodeStore(client);
    const treeStore = createSqliteTreeStore(client);
    const snapshot = treeStore.getTreeSnapshot();

    const nodes: PageNodeRecord[] = nodeStore.getAllNodes().map((node) => ({
      id: node.id,
      sceneType: node.sceneType,
      executionStatus: node.executionStatus,
      title: node.meta.title,
      summary: node.meta.summary,
      label: buildNodeLabel(node),
      messages: buildNodeMessages(node),
    }));

    return {
      rootNodeId: snapshot.rootNodeId,
      nodes,
      relations: buildTreeSnapshotRecords(snapshot.relations),
    };
  } finally {
    client.close();
  }
}
