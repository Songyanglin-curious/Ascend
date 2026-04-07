import type { AdvanceSceneRawResult } from "../workflows/advance/scene.js";
import type { ExecuteSceneNodeDeps, NodeId, SceneNode } from "./types.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function ensureExecutableNode(node: SceneNode): void {
  if (node.executionStatus !== "idle") {
    throw new Error(
      `节点当前状态不允许执行: ${node.id} (${node.executionStatus})`,
    );
  }
}

export async function executeSceneNode(
  nodeId: NodeId,
  deps: ExecuteSceneNodeDeps,
): Promise<AdvanceSceneRawResult> {
  const node = deps.nodeStore.getNodeById(nodeId);
  if (!node) {
    throw new Error(`未找到要执行的节点: ${nodeId}`);
  }

  const executor = deps.executors[node.sceneType];
  if (!executor) {
    throw new Error(`未注册 scene executor: ${node.sceneType}`);
  }

  ensureExecutableNode(node);

  const runningNode: SceneNode = {
    ...node,
    executionStatus: "running",
    errorMessage: null,
  };
  deps.nodeStore.replaceNode(runningNode);

  try {
    const rawResult = await executor(node.sceneInput, deps.runtime);
    const completedNode: SceneNode = {
      ...runningNode,
      executionStatus: "completed",
      rawResult,
      errorMessage: null,
    };

    deps.nodeStore.replaceNode(completedNode);

    return rawResult;
  } catch (error) {
    const failedNode: SceneNode = {
      ...runningNode,
      executionStatus: "failed",
      rawResult: null,
      errorMessage: getErrorMessage(error),
    };

    deps.nodeStore.replaceNode(failedNode);
    throw error;
  }
}
