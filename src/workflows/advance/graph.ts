import { END, START, StateGraph } from "@langchain/langgraph";

import type { WorkflowModel } from "./model.js";
import { createAdvanceNodes } from "./nodes.js";
import {
  AdvanceStateAnnotation,
  type AgentState,
  isEmptyNormalizedQuery,
} from "./types.js";

export interface AdvanceGraphRunner {
  invoke(state: AgentState): Promise<AgentState>;
}

function routeFromStart(state: AgentState): "normalizeInputNode" | "recognizeIntentNode" {
  if (state.phase === "await_c_intent") {
    return "recognizeIntentNode";
  }

  return "normalizeInputNode";
}

function routeAfterNormalize(state: AgentState): "evaluateStateNode" | typeof END {
  if (isEmptyNormalizedQuery(state.normalizedQuery)) {
    return END;
  }

  return "evaluateStateNode";
}

function routeAfterEvaluate(
  state: AgentState,
): "actionANode" | "actionBNode" | "actionCNode" {
  switch (state.currentState) {
    case "A":
      return "actionANode";
    case "B":
      return "actionBNode";
    case "C":
      return "actionCNode";
    default:
      throw new Error("状态评估后没有得到可路由的 A/B/C 状态。");
  }
}

function routeAfterRecognize(state: AgentState): "normalizeInputNode" | typeof END {
  if (state.phase === "ended") {
    return END;
  }

  if (state.phase === "normal" && state.currentState === null) {
    return "normalizeInputNode";
  }

  throw new Error("确认意图判断后的状态不合法，无法继续路由。");
}

export function buildAdvanceGraph(model: WorkflowModel): AdvanceGraphRunner {
  const nodes = createAdvanceNodes(model);

  return new StateGraph(AdvanceStateAnnotation)
    .addNode("normalizeInputNode", nodes.normalizeInputNode)
    .addNode("evaluateStateNode", nodes.evaluateStateNode)
    .addNode("actionANode", nodes.actionANode)
    .addNode("actionBNode", nodes.actionBNode)
    .addNode("actionCNode", nodes.actionCNode)
    .addNode("recognizeIntentNode", nodes.recognizeIntentNode)
    .addConditionalEdges(START, routeFromStart, [
      "normalizeInputNode",
      "recognizeIntentNode",
    ])
    .addConditionalEdges("normalizeInputNode", routeAfterNormalize, [
      "evaluateStateNode",
      END,
    ])
    .addConditionalEdges("evaluateStateNode", routeAfterEvaluate, [
      "actionANode",
      "actionBNode",
      "actionCNode",
    ])
    .addEdge("actionANode", END)
    .addEdge("actionBNode", END)
    .addEdge("actionCNode", END)
    .addConditionalEdges("recognizeIntentNode", routeAfterRecognize, [
      "normalizeInputNode",
      END,
    ])
    .compile({
      name: "advanceWorkflow",
    });
}
