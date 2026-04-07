import { AIMessage, HumanMessage } from "@langchain/core/messages";

import {
  ACTION_A_SYSTEM_PROMPT,
  ACTION_B_SYSTEM_PROMPT,
  ACTION_C_SYSTEM_PROMPT,
  buildActionPromptMessages,
  buildEvaluatePromptMessages,
  buildRecognizeIntentPromptMessages,
} from "./prompts.js";
import type { WorkflowModel } from "./model.js";
import {
  EMPTY_NORMALIZED_QUERY,
  type AgentState,
  type ProblemState,
} from "./types.js";

export interface AdvanceNodes {
  normalizeInputNode(state: AgentState): Promise<Partial<AgentState>>;
  evaluateStateNode(state: AgentState): Promise<Partial<AgentState>>;
  actionANode(state: AgentState): Promise<Partial<AgentState>>;
  actionBNode(state: AgentState): Promise<Partial<AgentState>>;
  actionCNode(state: AgentState): Promise<Partial<AgentState>>;
  recognizeIntentNode(state: AgentState): Promise<Partial<AgentState>>;
}

function ensureNonEmptyOutput(output: string, nodeName: string): string {
  const normalized = output.trim();
  if (normalized === "") {
    throw new Error(`${nodeName} 返回了空文本，无法继续执行。`);
  }

  return normalized;
}

function parseProblemState(output: string): Exclude<ProblemState, null> {
  const normalized = output.trim().toUpperCase();
  if (normalized === "A" || normalized === "B" || normalized === "C") {
    return normalized;
  }

  throw new Error(`状态评估节点返回了非法状态: ${output}`);
}

function parseIntentDecision(output: string): "confirm" | "reject" {
  const normalized = output.trim().toLowerCase();
  if (normalized === "confirm" || normalized === "reject") {
    return normalized;
  }

  throw new Error(`确认意图判断节点返回了非法结果: ${output}`);
}

function createAssistantUpdate(
  state: AgentState,
  output: string,
  extra: Partial<AgentState> = {},
): Partial<AgentState> {
  const normalized = ensureNonEmptyOutput(output, "动作节点");

  return {
    // rawMessages 记录真实对外输出；analysisMessages 只保留分析真正需要的语义消息。
    rawMessages: [new AIMessage(normalized)],
    analysisMessages: [
      new HumanMessage(state.normalizedQuery),
      new AIMessage(normalized),
    ],
    lastAssistantOutput: normalized,
    ...extra,
  };
}

export function createAdvanceNodes(model: WorkflowModel): AdvanceNodes {
  return {
    async normalizeInputNode(state) {
      // normalize 改为本地归一化，避免每轮额外消耗一次模型调用。
      const normalized = state.rawInput.trim();

      return {
        normalizedQuery:
          normalized === "" ? EMPTY_NORMALIZED_QUERY : normalized,
      };
    },

    async evaluateStateNode(state) {
      const output = await model.complete(
        buildEvaluatePromptMessages(
          state.normalizedQuery,
          state.analysisMessages,
        ),
      );

      return {
        currentState: parseProblemState(output),
      };
    },

    async actionANode(state) {
      const output = await model.complete(
        buildActionPromptMessages(
          ACTION_A_SYSTEM_PROMPT,
          state.normalizedQuery,
          state.analysisMessages,
        ),
      );

      return createAssistantUpdate(state, output);
    },

    async actionBNode(state) {
      const output = await model.complete(
        buildActionPromptMessages(
          ACTION_B_SYSTEM_PROMPT,
          state.normalizedQuery,
          state.analysisMessages,
        ),
      );

      return createAssistantUpdate(state, output);
    },

    async actionCNode(state) {
      const output = await model.complete(
        buildActionPromptMessages(
          ACTION_C_SYSTEM_PROMPT,
          state.normalizedQuery,
          state.analysisMessages,
        ),
      );

      return createAssistantUpdate(state, output, {
        phase: "await_c_intent",
      });
    },

    async recognizeIntentNode(state) {
      const lastAssistantOutput = state.lastAssistantOutput.trim();
      if (lastAssistantOutput === "") {
        throw new Error(
          "recognizeIntentNode 执行时缺少 lastAssistantOutput，当前状态不合法。",
        );
      }

      const output = await model.complete(
        buildRecognizeIntentPromptMessages(lastAssistantOutput, state.rawInput),
      );
      const decision = parseIntentDecision(output);

      if (decision === "confirm") {
        return {
          phase: "ended",
        };
      }

      return {
        phase: "normal",
        currentState: null,
      };
    },
  };
}
