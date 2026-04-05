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
  // START 不是写业务逻辑的地方，它只是根据 phase 决定“本轮从哪类节点起步”。
  if (state.phase === "await_c_intent") {
    return "recognizeIntentNode";
  }

  return "normalizeInputNode";
}

function routeAfterNormalize(state: AgentState): "evaluateStateNode" | typeof END {
  // EMPTY 不是错误，只表示“当前轮没有可分析的问题”，
  // 所以直接结束本次 graph invocation，把控制权交回 CLI。
  if (isEmptyNormalizedQuery(state.normalizedQuery)) {
    return END;
  }

  return "evaluateStateNode";
}

function routeAfterEvaluate(
  state: AgentState,
): "actionANode" | "actionBNode" | "actionCNode" {
  // 图里只有 evaluate 能做状态分流，A/B/C 动作节点不再自己判态。
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
    // reject 后会回到这里，继续用同一条输入重走主链。
    return "normalizeInputNode";
  }

  throw new Error("确认意图判断后的状态不合法，无法继续路由。");
}

export function buildAdvanceGraph(model: WorkflowModel): AdvanceGraphRunner {
  const nodes = createAdvanceNodes(model);

  // 这张图的设计目标不是“把所有逻辑都塞进 LangGraph”，
  // 而是把真正属于工作流路由的部分交给图，把 CLI 交互和结束出口留在图外。
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
