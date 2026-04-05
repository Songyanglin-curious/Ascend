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
    // 把真实终端 IO 包一层，后面测试时就可以传入假的 io，而不用真的开交互终端。
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
        // 原始用户输入只进入 rawMessages，不进入 analysisMessages。
        rawMessages: appendHumanMessage(state.rawMessages, rawInput),
    };
}

export function appendFixedAssistantMessage(
    state: AgentState,
    message: string,
): AgentState {
    return {
        ...state,
        // 固定提醒只保留在原始转录里，避免污染分析上下文和业务输出指针。
        rawMessages: appendAssistantMessage(state.rawMessages, message),
    };
}

export function formatHandoffSummary(record: HandoffRecord): string {
    return [
        "=== handoff ===",
        `endReason: ${record.endReason}`,
        `currentState: ${record.currentState ?? "null"}`,
        `lastAssistantOutput: ${record.lastAssistantOutput || "[empty]"}`,
        `messageCount: ${record.rawMessages.length}`,
    ].join("\n");
}
// 这个函数是“单轮调度器”：
// 先处理图外规则，再决定是否进入 LangGraph。
export async function processAdvanceInput(
    state: AgentState,
    rawInput: string,
    graph: AdvanceGraphRunner,
): Promise<ProcessTurnResult> {

    //   只要用户输入像 退出/结束/quit/exit，就不再进入 graph
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
    // 一种图外拦截。  等待用户确认或拒绝时，用户输入 filler 输入，不进入 graph
    if (state.phase === "await_c_intent" && isAwaitIntentFillerInput(rawInput)) {
        // filler 输入不进入图，也不写 user message。
        // 这样可以避免“嗯”“啊”之类的噪音污染对话转录。
        const reminderState = appendFixedAssistantMessage(
            state,
            AWAIT_INTENT_FILLER_REMINDER,
        );

        return {
            state: reminderState,
            assistantOutput: AWAIT_INTENT_FILLER_REMINDER,
        };
    }
    // CLI 负责把用户输入落到 state
    // Graph 负责基于这个 state 决定后续节点流转
    // 只有真正进入处理轮的输入，才会先写 user message，再调用 graph。
    // 把 rawInput 写入 state.rawInput
    // 把这条用户输入追加到 state.rawMessages 里，形成新的状态副本 stateWithUser。
    const stateWithUser = appendUserMessage(state, rawInput);
    // 把“已经带上本轮用户输入的新状态”交给 LangGraph。
    // 图内部之后怎么跑，由 graph.ts 决定
    const nextState = await graph.invoke(stateWithUser);

    if (nextState.phase === "ended") {
        // confirm 结束和 explicit_exit 结束都统一走 buildHandoffRecord，
        // 这样交接记录的结构和出口保持一致。
        return {
            state: nextState,
            handoffRecord: buildHandoffRecord(nextState, "confirm"),
        };
    }
    // 这轮没拿到有效问题，但会话没结束，请重新输入。
    if (isEmptyNormalizedQuery(nextState.normalizedQuery)) {
        // EMPTY 只结束当前 graph invocation，不结束整个 CLI 会话。
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
            // prompt 只反映当前 phase，真正的业务分支仍然由 processAdvanceInput 决定。
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
