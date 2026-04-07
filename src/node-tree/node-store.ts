import { randomUUID } from "node:crypto";

import type { AdvanceSceneStartInput } from "../workflows/advance/scene.js";
import type {
  NodeId,
  NodeStore,
  SceneNode,
  SceneNodeMeta,
  SceneType,
} from "./types.js";

function cloneSceneInput(sceneInput: AdvanceSceneStartInput): AdvanceSceneStartInput {
  return { ...sceneInput };
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

function cloneNode(node: SceneNode): SceneNode {
  return {
    ...node,
    sceneInput: cloneSceneInput(node.sceneInput),
    meta: { ...node.meta },
  };
}

export function createInMemoryNodeStore(): NodeStore {
  const nodes = new Map<NodeId, SceneNode>();

  return {
    createNode(
      sceneType: SceneType,
      sceneInput: AdvanceSceneStartInput,
      meta?: Partial<SceneNodeMeta>,
    ): SceneNode {
      const node: SceneNode = {
        id: randomUUID(),
        sceneType,
        sceneInput: cloneSceneInput(sceneInput),
        executionStatus: "idle",
        rawResult: null,
        errorMessage: null,
        meta: normalizeNodeMeta(meta),
      };

      nodes.set(node.id, cloneNode(node));

      return cloneNode(node);
    },

    getNodeById(nodeId: NodeId): SceneNode | null {
      const node = nodes.get(nodeId);
      return node ? cloneNode(node) : null;
    },

    getAllNodes(): SceneNode[] {
      return Array.from(nodes.values(), (node) => cloneNode(node));
    },

    replaceNode(node: SceneNode): void {
      if (!nodes.has(node.id)) {
        throw new Error(`未找到要替换的节点: ${node.id}`);
      }

      nodes.set(node.id, cloneNode(node));
    },
  };
}
