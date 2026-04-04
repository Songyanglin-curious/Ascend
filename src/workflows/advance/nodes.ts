import { AIMessage } from "@langchain/core/messages";

import {
  ACTION_A_SYSTEM_PROMPT,
  ACTION_B_SYSTEM_PROMPT,
  ACTION_C_SYSTEM_PROMPT,
  buildActionUserPrompt,
  buildEvaluateUserPrompt,
  buildNormalizeUserPrompt,
  buildRecognizeIntentUserPrompt,
  EVALUATE_SYSTEM_PROMPT,
  NORMALIZE_SYSTEM_PROMPT,
  RECOGNIZE_INTENT_SYSTEM_PROMPT,
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
  output: string,
  extra: Partial<AgentState> = {},
): Partial<AgentState> {
  const normalized = ensureNonEmptyOutput(output, "动作节点");

  return {
    messages: [new AIMessage(normalized)],
    lastAssistantOutput: normalized,
    ...extra,
  };
}

export function createAdvanceNodes(model: WorkflowModel): AdvanceNodes {
  return {
    async normalizeInputNode(state) {
      const output = await model.complete(
        NORMALIZE_SYSTEM_PROMPT,
        buildNormalizeUserPrompt(state.rawInput),
      );
      const normalized = ensureNonEmptyOutput(output, "normalizeInputNode");

      return {
        normalizedQuery: normalized,
      };
    },

    async evaluateStateNode(state) {
      const output = await model.complete(
        EVALUATE_SYSTEM_PROMPT,
        buildEvaluateUserPrompt(state.normalizedQuery, state.messages),
      );

      return {
        currentState: parseProblemState(output),
      };
    },

    async actionANode(state) {
      const output = await model.complete(
        ACTION_A_SYSTEM_PROMPT,
        buildActionUserPrompt(state.normalizedQuery, state.messages),
      );

      return createAssistantUpdate(output);
    },

    async actionBNode(state) {
      const output = await model.complete(
        ACTION_B_SYSTEM_PROMPT,
        buildActionUserPrompt(state.normalizedQuery, state.messages),
      );

      return createAssistantUpdate(output);
    },

    async actionCNode(state) {
      const output = await model.complete(
        ACTION_C_SYSTEM_PROMPT,
        buildActionUserPrompt(state.normalizedQuery, state.messages),
      );

      return createAssistantUpdate(output, {
        phase: "await_c_intent",
      });
    },

    async recognizeIntentNode(state) {
      const output = await model.complete(
        RECOGNIZE_INTENT_SYSTEM_PROMPT,
        buildRecognizeIntentUserPrompt(state.rawInput, state.messages),
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
