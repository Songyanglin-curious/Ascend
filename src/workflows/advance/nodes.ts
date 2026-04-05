import { AIMessage, HumanMessage } from "@langchain/core/messages";

import {
  ACTION_A_SYSTEM_PROMPT,
  ACTION_B_SYSTEM_PROMPT,
  ACTION_C_SYSTEM_PROMPT,
  buildActionPromptMessages,
  buildEvaluatePromptMessages,
  buildNormalizePromptMessages,
  buildRecognizeIntentPromptMessages,
} from "./prompts.js";
import type { WorkflowModel } from "./model.js";
import type { AgentState, ProblemState } from "./types.js";

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
  // evaluate 是纯判态节点，只接受 A/B/C 三个字面量。
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
    // rawMessages 记录真实对外输出；analysisMessages 记录规范化问题与业务回复。
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
      // normalize 只看当前输入，不依赖历史。
      const output = await model.complete(buildNormalizePromptMessages(state.rawInput));
      const normalized = ensureNonEmptyOutput(output, "normalizeInputNode");

      return {
        normalizedQuery: normalized,
      };
    },

    async evaluateStateNode(state) {
      // evaluate 会读取完整历史消息和本轮规范化问题，但只负责判态。
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
        // 进入 await_c_intent 后，下一轮先判断 confirm / reject，
        // 而不是直接重新评估 A/B/C。
        phase: "await_c_intent",
      });
    },

    async recognizeIntentNode(state) {
      // recognizeIntent 只看上一轮 C 输出与当前原始回复，不依赖 analysisMessages。
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
        // reject 不直接给用户输出，而是让图拿同一条输入回到主链继续重评。
        phase: "normal",
        currentState: null,
      };
    },
  };
}
