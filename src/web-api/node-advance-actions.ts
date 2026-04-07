import { createSqliteClient } from "../persistence/sqlite/client.js";
import { createSqliteNodeStore } from "../persistence/sqlite/node-store.js";
import { ensureSqliteSchema } from "../persistence/sqlite/schema.js";
import { processAdvanceInput } from "../workflows/advance/cli.js";
import { buildAdvanceGraph } from "../workflows/advance/graph.js";
import type { WorkflowModel } from "../workflows/advance/model.js";
import {
  buildAdvanceSceneRawResult,
  createContinuationStateFromRawResult,
  type Phase,
  type ProblemState,
} from "../workflows/advance/types.js";

export interface AdvanceNodeActionResult {
  nodeId: string;
  action: "advance" | "exit";
  workflow: {
    phase: Phase;
    currentState: ProblemState;
    ended: boolean;
    endReason: "confirm" | "explicit_exit" | null;
  };
  candidateRefreshRecommended: boolean;
  hint: {
    level: "info" | "success";
    text: string;
  } | null;
  latestAssistantOutput: string;
}

function toActionResult(
  nodeId: string,
  rawResult: {
    endReason?: "confirm" | "explicit_exit" | null;
    phase?: Phase;
    currentState: ProblemState;
    lastAssistantOutput: string;
  },
  action: "advance" | "exit",
): AdvanceNodeActionResult {
  const phase = rawResult.phase ?? "ended";
  const ended = phase === "ended";
  const endReason = rawResult.endReason ?? null;
  const candidateRefreshRecommended = ended && rawResult.currentState === "C";

  return {
    nodeId,
    action,
    workflow: {
      phase,
      currentState: rawResult.currentState,
      ended,
      endReason,
    },
    candidateRefreshRecommended,
    hint: buildActionHint({
      action,
      phase,
      endReason,
      candidateRefreshRecommended,
    }),
    latestAssistantOutput: rawResult.lastAssistantOutput,
  };
}

function buildActionHint(params: {
  action: "advance" | "exit";
  phase: Phase;
  endReason: "confirm" | "explicit_exit" | null;
  candidateRefreshRecommended: boolean;
}): AdvanceNodeActionResult["hint"] {
  if (params.action === "exit") {
    return {
      level: "info",
      text: "已结束当前节点本轮推进。你可以继续查看历史，或切换到别的节点处理。",
    };
  }

  if (params.phase === "await_c_intent") {
    return {
      level: "info",
      text: "当前已进入方向确认阶段。你可以继续补充前提，或直接结束本轮。",
    };
  }

  if (params.candidateRefreshRecommended) {
    return {
      level: "success",
      text: "当前节点已进入可产出候选的结束态，可以查看并确认候选子节点。",
    };
  }

  if (params.phase === "ended" && params.endReason === "confirm") {
    return {
      level: "success",
      text: "当前节点本轮推进已结束。",
    };
  }

  return {
    level: "info",
    text: "当前节点已更新，你可以继续补充信息或收束问题。",
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function ensureAdvanceableNode(node: {
  id: string;
  sceneType: string;
  executionStatus: string;
}): void {
  if (node.sceneType !== "advance") {
    throw new Error(`当前节点不是可推进的 advance 节点: ${node.id}`);
  }

  if (node.executionStatus === "failed") {
    throw new Error(`failed 节点不允许继续推进: ${node.id}`);
  }

  if (node.executionStatus === "running") {
    throw new Error(`节点当前正在运行，不能重复推进: ${node.id}`);
  }
}

export async function advanceNodeAction(params: {
  databasePath: string;
  nodeId: string;
  message: string;
  model: WorkflowModel;
}): Promise<AdvanceNodeActionResult> {
  const client = createSqliteClient(params.databasePath);

  try {
    ensureSqliteSchema(client);

    const nodeStore = createSqliteNodeStore(client);
    const node = nodeStore.getNodeById(params.nodeId);
    if (!node) {
      throw new Error(`未找到要继续推进的节点: ${params.nodeId}`);
    }

    ensureAdvanceableNode(node);

    const graph = buildAdvanceGraph(params.model);
    const runningNode = {
      ...node,
      executionStatus: "running" as const,
      errorMessage: null,
    };
    nodeStore.replaceNode(runningNode);

    try {
      const previousState = createContinuationStateFromRawResult(node.rawResult);
      const turnResult = await processAdvanceInput(previousState, params.message.trim(), graph);
      const nextRawResult = buildAdvanceSceneRawResult(
        turnResult.state,
        turnResult.handoffRecord?.endReason ?? null,
      );

      nodeStore.replaceNode({
        ...runningNode,
        executionStatus: "completed",
        rawResult: nextRawResult,
        errorMessage: null,
      });

      return toActionResult(node.id, nextRawResult, "advance");
    } catch (error) {
      nodeStore.replaceNode({
        ...runningNode,
        executionStatus: "failed",
        rawResult: node.rawResult,
        errorMessage: getErrorMessage(error),
      });
      throw error;
    }
  } finally {
    client.close();
  }
}

export function exitNodeAdvanceAction(params: {
  databasePath: string;
  nodeId: string;
}): AdvanceNodeActionResult {
  const client = createSqliteClient(params.databasePath);

  try {
    ensureSqliteSchema(client);

    const nodeStore = createSqliteNodeStore(client);
    const node = nodeStore.getNodeById(params.nodeId);
    if (!node) {
      throw new Error(`未找到要结束推进的节点: ${params.nodeId}`);
    }

    ensureAdvanceableNode(node);

    const currentRawResult =
      node.rawResult ??
      buildAdvanceSceneRawResult(createContinuationStateFromRawResult(null), "explicit_exit");
    const nextRawResult = {
      ...currentRawResult,
      phase: "ended" as const,
      endReason: "explicit_exit" as const,
    };

    nodeStore.replaceNode({
      ...node,
      executionStatus: "completed",
      rawResult: nextRawResult,
      errorMessage: null,
    });

    return toActionResult(node.id, nextRawResult, "exit");
  } finally {
    client.close();
  }
}
