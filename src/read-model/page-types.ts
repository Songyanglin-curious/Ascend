import type { NodeExecutionStatus, NodeId, SceneType } from "../node-tree/types.js";

export type PageMessageRole = "user" | "assistant";

export interface PageMessageRecord {
  id: string;
  role: PageMessageRole;
  content: string;
  order: number;
}

export interface PageNodeRecord {
  id: NodeId;
  sceneType: SceneType;
  executionStatus: NodeExecutionStatus;
  title: string | null;
  summary: string | null;
  label: string;
  messages: PageMessageRecord[];
}

export interface PageTreeRelationRecord {
  nodeId: NodeId;
  parentId: NodeId | null;
  childrenIds: NodeId[];
}

export interface PageReadModel {
  rootNodeId: NodeId | null;
  nodes: PageNodeRecord[];
  relations: PageTreeRelationRecord[];
}
