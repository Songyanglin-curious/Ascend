import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import type { AdvanceGraphRunner } from "./graph.js";
import {
  appendAssistantMessage,
  appendHumanMessage,
  buildHandoffRecord,
  createInitialAgentState,
  type AgentState,
  type HandoffRecord,
  isEmptyNormalizedQuery,
} from "./types.js";

export const EMPTY_INPUT_REMINDER = "请输入一个明确、有效的问题，我们再继续推进。";
export const AWAIT_INTENT_FILLER_REMINDER =
  "请明确告诉我是确认当前候选，还是希望我继续补充或重评。";

export interface CliIO {
  readLine(prompt: string): Promise<string>;
  writeLine(text: string): void | Promise<void>;
  close?(): void | Promise<void>;
}

export interface ProcessTurnResult {
  state: AgentState;
  assistantOutput?: string;
  handoffRecord?: HandoffRecord;
}

function createConsoleIo(): CliIO {
  const readline = createInterface({ input, output });

  return {
    readLine(prompt) {
      return readline.question(prompt);
    },
    writeLine(text) {
      console.log(text);
    },
    close() {
      readline.close();
    },
  };
}

export function isExplicitExitInput(rawInput: string): boolean {
  const normalized = rawInput.trim().toLowerCase();

  if (normalized === "") {
    return false;
  }

  return /^(exit|quit|退出|结束|停止)(当前)?(这个)?(工作流)?$/.test(normalized);
}

export function isAwaitIntentFillerInput(rawInput: string): boolean {
  const normalized = rawInput.trim().toLowerCase();

  if (normalized === "") {
    return true;
  }

  return /^(嗯|额|呃|啊|哦|噢|emm|uh|。。。|\.{2,}|[?!？！,，。]+)$/.test(
    normalized,
  );
}

export function appendUserMessage(state: AgentState, rawInput: string): AgentState {
  return {
    ...state,
    rawInput,
    messages: appendHumanMessage(state.messages, rawInput),
  };
}

export function appendFixedAssistantMessage(
  state: AgentState,
  message: string,
): AgentState {
  return {
    ...state,
    messages: appendAssistantMessage(state.messages, message),
    lastAssistantOutput: message,
  };
}

export function formatHandoffSummary(record: HandoffRecord): string {
  return [
    "=== handoff ===",
    `endReason: ${record.endReason}`,
    `currentState: ${record.currentState ?? "null"}`,
    `lastAssistantOutput: ${record.lastAssistantOutput || "[empty]"}`,
    `messageCount: ${record.messages.length}`,
  ].join("\n");
}

export async function processAdvanceInput(
  state: AgentState,
  rawInput: string,
  graph: AdvanceGraphRunner,
): Promise<ProcessTurnResult> {
  if (isExplicitExitInput(rawInput)) {
    const exitState: AgentState = {
      ...appendUserMessage(state, rawInput),
      shouldExit: true,
      phase: "ended",
    };

    return {
      state: exitState,
      handoffRecord: buildHandoffRecord(exitState, "explicit_exit"),
    };
  }

  if (state.phase === "await_c_intent" && isAwaitIntentFillerInput(rawInput)) {
    const reminderState = appendFixedAssistantMessage(
      state,
      AWAIT_INTENT_FILLER_REMINDER,
    );

    return {
      state: reminderState,
      assistantOutput: AWAIT_INTENT_FILLER_REMINDER,
    };
  }

  const stateWithUser = appendUserMessage(state, rawInput);
  const nextState = await graph.invoke(stateWithUser);

  if (nextState.phase === "ended") {
    return {
      state: nextState,
      handoffRecord: buildHandoffRecord(nextState, "confirm"),
    };
  }

  if (isEmptyNormalizedQuery(nextState.normalizedQuery)) {
    const reminderState = appendFixedAssistantMessage(
      nextState,
      EMPTY_INPUT_REMINDER,
    );

    return {
      state: reminderState,
      assistantOutput: EMPTY_INPUT_REMINDER,
    };
  }

  return {
    state: nextState,
    assistantOutput: nextState.lastAssistantOutput || undefined,
  };
}

export async function runAdvanceCli(
  graph: AdvanceGraphRunner,
  io: CliIO = createConsoleIo(),
): Promise<HandoffRecord> {
  let state = createInitialAgentState();

  try {
    await io.writeLine("推进工作流已启动。输入问题开始，输入“退出”可结束当前工作流。");

    while (true) {
      const prompt =
        state.phase === "await_c_intent" ? "confirm/reject> " : "input> ";
      const rawInput = await io.readLine(prompt);
      const result = await processAdvanceInput(state, rawInput, graph);

      state = result.state;

      if (result.assistantOutput) {
        await io.writeLine(result.assistantOutput);
      }

      if (result.handoffRecord) {
        await io.writeLine(formatHandoffSummary(result.handoffRecord));
        return result.handoffRecord;
      }
    }
  } finally {
    await io.close?.();
  }
}
