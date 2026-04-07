import { randomUUID } from "node:crypto";

import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";

import type { AdvanceSceneRawResult, AdvanceSceneStartInput } from "../../workflows/advance/scene.js";
import type {
  NodeId,
  NodeStore,
  SceneNode,
  SceneNodeMeta,
  SceneType,
} from "../../node-tree/types.js";
import type { SqliteClient } from "./client.js";

interface SerializedMessage {
  type: string;
  text: string;
}

interface NodeRow {
  id: string;
  scene_type: string;
  scene_input_json: string;
  execution_status: string;
  raw_result_json: string | null;
  error_message: string | null;
  meta_title: string | null;
  meta_summary: string | null;
  source_parent_node_id: string | null;
  source_candidate_id: string | null;
  source_candidate_type: SceneNodeMeta["sourceCandidateType"];
}

function createEmptyNodeMeta(): SceneNodeMeta {
  return {
    title: null,
    summary: null,
    sourceParentNodeId: null,
    sourceCandidateId: null,
    sourceCandidateType: null,
  };
}

function normalizeNodeMeta(meta?: Partial<SceneNodeMeta>): SceneNodeMeta {
  return {
    ...createEmptyNodeMeta(),
    ...meta,
  };
}

function ensureObjectRecord(value: unknown, fieldName: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${fieldName} 不是合法对象。`);
  }

  return value as Record<string, unknown>;
}

function serializeSceneInput(sceneInput: AdvanceSceneStartInput): string {
  return JSON.stringify(sceneInput);
}

function deserializeSceneInput(text: string): AdvanceSceneStartInput {
  const parsed = JSON.parse(text);
  const record = ensureObjectRecord(parsed, "sceneInput");

  return record as AdvanceSceneStartInput;
}

function serializeMessages(messages: BaseMessage[]): SerializedMessage[] {
  return messages.map((message) => {
    if (typeof message.text !== "string") {
      throw new Error(`无法序列化消息类型 ${message.getType()}。`);
    }

    return {
      type: message.getType(),
      text: message.text,
    };
  });
}

function deserializeMessage(message: SerializedMessage): BaseMessage {
  if (message.type === "human") {
    return new HumanMessage(message.text);
  }

  if (message.type === "ai") {
    return new AIMessage(message.text);
  }

  throw new Error(`无法反序列化未知消息类型: ${message.type}`);
}

function deserializeSerializedMessages(value: unknown, fieldName: string): BaseMessage[] {
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} 不是合法数组。`);
  }

  return value.map((message, index) => {
    const item = ensureObjectRecord(message, `${fieldName}[${index}]`);
    if (typeof item.type !== "string" || typeof item.text !== "string") {
      throw new Error(`${fieldName} 项结构非法。`);
    }

    return deserializeMessage({
      type: item.type,
      text: item.text,
    });
  });
}

function serializeRawResult(rawResult: AdvanceSceneRawResult | null): string | null {
  if (!rawResult) {
    return null;
  }

  return JSON.stringify({
    rawMessages: serializeMessages(rawResult.rawMessages),
    analysisMessages: serializeMessages(rawResult.analysisMessages ?? rawResult.rawMessages),
    endReason: rawResult.endReason,
    currentState: rawResult.currentState,
    phase: rawResult.phase ?? "ended",
    lastAssistantOutput: rawResult.lastAssistantOutput,
  });
}

function deserializeRawResult(text: string | null): AdvanceSceneRawResult | null {
  if (text === null) {
    return null;
  }

  const parsed = ensureObjectRecord(JSON.parse(text), "rawResult");

  return {
    rawMessages: deserializeSerializedMessages(parsed.rawMessages, "rawResult.rawMessages"),
    analysisMessages: Array.isArray(parsed.analysisMessages)
      ? deserializeSerializedMessages(parsed.analysisMessages, "rawResult.analysisMessages")
      : undefined,
    endReason: (parsed.endReason ?? null) as AdvanceSceneRawResult["endReason"],
    currentState: parsed.currentState as AdvanceSceneRawResult["currentState"],
    phase:
      parsed.phase === "normal" || parsed.phase === "await_c_intent" || parsed.phase === "ended"
        ? parsed.phase
        : undefined,
    lastAssistantOutput:
      typeof parsed.lastAssistantOutput === "string" ? parsed.lastAssistantOutput : "",
  };
}

function deserializeSceneNode(row: NodeRow): SceneNode {
  return {
    id: row.id,
    sceneType: row.scene_type as SceneType,
    sceneInput: deserializeSceneInput(row.scene_input_json),
    executionStatus: row.execution_status as SceneNode["executionStatus"],
    rawResult: deserializeRawResult(row.raw_result_json),
    errorMessage: row.error_message,
    meta: {
      title: row.meta_title,
      summary: row.meta_summary,
      sourceParentNodeId: row.source_parent_node_id,
      sourceCandidateId: row.source_candidate_id,
      sourceCandidateType: row.source_candidate_type,
    },
  };
}

export function createSqliteNodeStore(client: SqliteClient): NodeStore {
  const insertNode = client.db.prepare(`
    INSERT INTO nodes (
      id,
      scene_type,
      scene_input_json,
      execution_status,
      raw_result_json,
      error_message,
      meta_title,
      meta_summary,
      source_parent_node_id,
      source_candidate_id,
      source_candidate_type
    ) VALUES (
      @id,
      @scene_type,
      @scene_input_json,
      @execution_status,
      @raw_result_json,
      @error_message,
      @meta_title,
      @meta_summary,
      @source_parent_node_id,
      @source_candidate_id,
      @source_candidate_type
    )
  `);

  const selectNodeById = client.db.prepare(`SELECT * FROM nodes WHERE id = ?`);
  const selectAllNodes = client.db.prepare(`SELECT * FROM nodes ORDER BY id ASC`);
  const updateNode = client.db.prepare(`
    UPDATE nodes
    SET
      scene_type = @scene_type,
      scene_input_json = @scene_input_json,
      execution_status = @execution_status,
      raw_result_json = @raw_result_json,
      error_message = @error_message,
      meta_title = @meta_title,
      meta_summary = @meta_summary,
      source_parent_node_id = @source_parent_node_id,
      source_candidate_id = @source_candidate_id,
      source_candidate_type = @source_candidate_type
    WHERE id = @id
  `);

  return {
    createNode(
      sceneType: SceneType,
      sceneInput: AdvanceSceneStartInput,
      meta?: Partial<SceneNodeMeta>,
    ): SceneNode {
      const node: SceneNode = {
        id: randomUUID(),
        sceneType,
        sceneInput: { ...sceneInput },
        executionStatus: "idle",
        rawResult: null,
        errorMessage: null,
        meta: normalizeNodeMeta(meta),
      };

      insertNode.run({
        id: node.id,
        scene_type: node.sceneType,
        scene_input_json: serializeSceneInput(node.sceneInput),
        execution_status: node.executionStatus,
        raw_result_json: serializeRawResult(node.rawResult),
        error_message: node.errorMessage,
        meta_title: node.meta.title,
        meta_summary: node.meta.summary,
        source_parent_node_id: node.meta.sourceParentNodeId,
        source_candidate_id: node.meta.sourceCandidateId,
        source_candidate_type: node.meta.sourceCandidateType,
      });

      return deserializeSceneNode(selectNodeById.get(node.id) as NodeRow);
    },

    getNodeById(nodeId: NodeId): SceneNode | null {
      const row = selectNodeById.get(nodeId) as NodeRow | undefined;
      return row ? deserializeSceneNode(row) : null;
    },

    getAllNodes(): SceneNode[] {
      return (selectAllNodes.all() as NodeRow[]).map((row) => deserializeSceneNode(row));
    },

    replaceNode(node: SceneNode): void {
      const result = updateNode.run({
        id: node.id,
        scene_type: node.sceneType,
        scene_input_json: serializeSceneInput(node.sceneInput),
        execution_status: node.executionStatus,
        raw_result_json: serializeRawResult(node.rawResult),
        error_message: node.errorMessage,
        meta_title: node.meta.title,
        meta_summary: node.meta.summary,
        source_parent_node_id: node.meta.sourceParentNodeId,
        source_candidate_id: node.meta.sourceCandidateId,
        source_candidate_type: node.meta.sourceCandidateType,
      });

      if (result.changes !== 1) {
        throw new Error(`未找到要替换的节点: ${node.id}`);
      }
    },
  };
}
