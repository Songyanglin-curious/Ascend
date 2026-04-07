import type {
  AdvanceSceneRawResult,
  AdvanceSceneRuntime,
  AdvanceSceneStartInput,
} from "../workflows/advance/scene.js";
import type { ChildCandidateType } from "../child-candidates/types.js";

export type NodeId = string;
export type SceneType = "advance";
export type NodeExecutionStatus = "idle" | "running" | "completed" | "failed";

export interface SceneNodeMeta {
  title: string | null;
  summary: string | null;
  sourceParentNodeId: string | null;
  sourceCandidateId: string | null;
  sourceCandidateType: ChildCandidateType | null;
}

export interface SceneNode {
  id: NodeId;
  sceneType: SceneType;
  sceneInput: AdvanceSceneStartInput;
  executionStatus: NodeExecutionStatus;
  rawResult: AdvanceSceneRawResult | null;
  errorMessage: string | null;
  meta: SceneNodeMeta;
}

export interface TreeRelation {
  parentId: NodeId | null;
  childrenIds: NodeId[];
}

export interface NodeTree {
  rootNodeId: NodeId | null;
  relations: Record<NodeId, TreeRelation>;
}

export interface NodeStore {
  createNode(
    sceneType: SceneType,
    sceneInput: AdvanceSceneStartInput,
    meta?: Partial<SceneNodeMeta>,
  ): SceneNode;
  getNodeById(nodeId: NodeId): SceneNode | null;
  getAllNodes(): SceneNode[];
  replaceNode(node: SceneNode): void;
}

export interface TreeStore {
  createEmptyTree(): NodeTree;
  getRootNodeId(): NodeId | null;
  getRelation(nodeId: NodeId): TreeRelation | null;
  getTreeSnapshot(): NodeTree;
  setRoot(nodeId: NodeId): void;
  attachChild(parentId: NodeId, childId: NodeId): void;
  getChildIds(parentId: NodeId): NodeId[];
}

export interface TreeService {
  createRoot(nodeId: NodeId): void;
  createChild(parentId: NodeId, childId: NodeId): void;
  getChildren(parentId: NodeId): SceneNode[];
}

export type SceneExecutor = (
  input: AdvanceSceneStartInput,
  runtime: AdvanceSceneRuntime,
) => Promise<AdvanceSceneRawResult>;

export interface SceneExecutorRegistry {
  advance: SceneExecutor;
}

export interface ExecuteSceneNodeDeps {
  nodeStore: NodeStore;
  executors: SceneExecutorRegistry;
  runtime: AdvanceSceneRuntime;
}
