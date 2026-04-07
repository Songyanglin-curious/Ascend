import assert from "node:assert/strict";
import test from "node:test";

import {
  AWAIT_INTENT_FILLER_REMINDER,
  EMPTY_INPUT_REMINDER,
  EXPLICIT_EXIT_REMINDER,
  processAdvanceInput,
} from "./cli.js";
import { buildAdvanceGraph } from "./graph.js";
import type { PromptMessage, WorkflowModel } from "./model.js";
import { createInitialAgentState } from "./types.js";

class QueueWorkflowModel implements WorkflowModel {
  private readonly outputs: string[];

  readonly calls: PromptMessage[][] = [];

  constructor(outputs: string[]) {
    this.outputs = [...outputs];
  }

  async complete(messages: PromptMessage[]): Promise<string> {
    this.calls.push(messages.map((message) => ({ ...message })));

    const next = this.outputs.shift();
    if (next === undefined) {
      throw new Error("测试 stub 没有足够的输出。");
    }

    return next;
  }
}

async function runTurn(
  state = createInitialAgentState(),
  rawInput = "",
  outputs: string[] = [],
) {
  const model = new QueueWorkflowModel(outputs);
  const graph = buildAdvanceGraph(model);
  const result = await processAdvanceInput(state, rawInput, graph);

  return {
    ...result,
    model,
  };
}

function getMessageTexts(messages: { type: string; text: string }[]) {
  return messages.map((message) => ({
    type: message.type,
    text: message.text,
  }));
}

test("normalizeInputNode 只做 trim，不调用模型", async () => {
  const rawInput = "  我要推进登录流程  ";
  const turn = await runTurn(createInitialAgentState(), rawInput, [
    "B",
    "当前问题\n关键判断\n局部展开点",
  ]);

  assert.equal(turn.model.calls.length, 2);
  assert.equal(turn.state.normalizedQuery, "我要推进登录流程");
  assert.deepEqual(
    turn.model.calls[0]?.map((message) => message.role),
    ["system", "user"],
  );
  assert.equal(
    turn.model.calls[0]?.[1]?.content,
    "当前规范化问题：\n我要推进登录流程",
  );
  assert.equal(
    turn.model.calls[1]?.[1]?.content,
    "当前规范化问题：\n我要推进登录流程",
  );
});

test("normalize 返回 EMPTY 时只结束当前轮并提示重新输入，且不调用模型", async () => {
  const emptyTurn = await runTurn(createInitialAgentState(), "   ");

  assert.equal(emptyTurn.model.calls.length, 0);
  assert.equal(emptyTurn.handoffRecord, undefined);
  assert.equal(emptyTurn.state.phase, "normal");
  assert.equal(emptyTurn.assistantOutput, EMPTY_INPUT_REMINDER);
  assert.equal(emptyTurn.state.rawMessages.length, 2);
  assert.equal(emptyTurn.state.analysisMessages.length, 0);
  assert.deepEqual(getMessageTexts(emptyTurn.state.rawMessages), [
    { type: "human", text: "   " },
    { type: "ai", text: EMPTY_INPUT_REMINDER },
  ]);

  const nextTurn = await runTurn(emptyTurn.state, "我要推进登录流程", [
    "A",
    "当前捕捉\n当前区分\n唯一追问",
  ]);

  assert.equal(nextTurn.state.phase, "normal");
  assert.equal(nextTurn.assistantOutput, "当前捕捉\n当前区分\n唯一追问");
});

test("evaluate 和 action prompt 不重复包含当前轮原始输入", async () => {
  const rawInput = "  我要推进登录流程  ";
  const turn = await runTurn(createInitialAgentState(), rawInput, [
    "B",
    "当前问题\n关键判断\n局部展开点",
  ]);

  const evaluatePrompt = turn.model.calls[0];
  const actionPrompt = turn.model.calls[1];

  assert.equal(evaluatePrompt.some((message) => message.content === rawInput), false);
  assert.equal(actionPrompt.some((message) => message.content === rawInput), false);
  assert.deepEqual(getMessageTexts(turn.state.analysisMessages), [
    { type: "human", text: "我要推进登录流程" },
    { type: "ai", text: "当前问题\n关键判断\n局部展开点" },
  ]);
});

test("A 路径可多轮循环并转入 B 和 C", async () => {
  const firstTurn = await runTurn(createInitialAgentState(), "需求很乱", [
    "A",
    "当前捕捉\n当前区分\n唯一追问",
  ]);
  const secondTurn = await runTurn(firstTurn.state, "我先聚焦登录", [
    "B",
    "当前问题\n关键判断\n局部展开点",
  ]);
  const thirdTurn = await runTurn(secondTurn.state, "现在有两个推进方向", [
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
  ]);

  assert.equal(firstTurn.state.currentState, "A");
  assert.equal(secondTurn.state.currentState, "B");
  assert.equal(thirdTurn.state.currentState, "C");
  assert.equal(thirdTurn.state.phase, "await_c_intent");
});

test("B 路径可回到 A 再进入 C", async () => {
  const firstTurn = await runTurn(createInitialAgentState(), "问题对象已显形", [
    "B",
    "当前问题\n关键判断\n局部展开点",
  ]);
  const secondTurn = await runTurn(firstTurn.state, "发现对象其实还没稳", [
    "A",
    "当前捕捉\n当前区分\n唯一追问",
  ]);
  const thirdTurn = await runTurn(secondTurn.state, "重新梳理后有两个候选", [
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
  ]);

  assert.equal(firstTurn.state.currentState, "B");
  assert.equal(secondTurn.state.currentState, "A");
  assert.equal(thirdTurn.state.currentState, "C");
});

test("C 下 confirm 正常结束并统一产出 handoff，recognizeIntent 继续调用 AI", async () => {
  const candidateTurn = await runTurn(createInitialAgentState(), "给我候选", [
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
  ]);
  const confirmTurn = await runTurn(candidateTurn.state, "confirm", ["confirm"]);

  assert.equal(confirmTurn.model.calls.length, 1);
  assert.deepEqual(
    confirmTurn.model.calls[0]?.map((message) => message.role),
    ["system", "assistant", "user"],
  );
  assert.equal(confirmTurn.state.phase, "ended");
  assert.ok(confirmTurn.handoffRecord);
  assert.equal(confirmTurn.handoffRecord?.endReason, "confirm");
  assert.equal(confirmTurn.handoffRecord?.rawMessages.length, 3);
  assert.deepEqual(getMessageTexts(confirmTurn.state.rawMessages), [
    { type: "human", text: "给我候选" },
    { type: "ai", text: "当前问题\n候选方向\n优先候选\n确认提示" },
    { type: "human", text: "confirm" },
  ]);
});

test("C 下 reject 会复用同轮输入重评且不重复写 user message", async () => {
  const candidateTurn = await runTurn(createInitialAgentState(), "请给我候选", [
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
  ]);
  const rejectTurn = await runTurn(candidateTurn.state, "reject", [
    "reject",
    "B",
    "当前问题\n关键判断\n局部展开点",
  ]);

  assert.equal(rejectTurn.model.calls.length, 3);
  assert.equal(rejectTurn.handoffRecord, undefined);
  assert.equal(rejectTurn.state.phase, "normal");
  assert.equal(rejectTurn.state.currentState, "B");
  assert.equal(rejectTurn.state.rawMessages.length, 4);
  assert.deepEqual(getMessageTexts(rejectTurn.state.rawMessages), [
    { type: "human", text: "请给我候选" },
    { type: "ai", text: "当前问题\n候选方向\n优先候选\n确认提示" },
    { type: "human", text: "reject" },
    { type: "ai", text: "当前问题\n关键判断\n局部展开点" },
  ]);
  assert.deepEqual(getMessageTexts(rejectTurn.state.analysisMessages), [
    { type: "human", text: "请给我候选" },
    { type: "ai", text: "当前问题\n候选方向\n优先候选\n确认提示" },
    { type: "human", text: "reject" },
    { type: "ai", text: "当前问题\n关键判断\n局部展开点" },
  ]);
});

test("await_c_intent 下回车或语气词只提醒，不改状态，不进 recognizeIntent", async () => {
  const candidateTurn = await runTurn(createInitialAgentState(), "我要候选", [
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
  ]);
  const fillerTurn = await runTurn(candidateTurn.state, "嗯");

  assert.equal(fillerTurn.model.calls.length, 0);
  assert.equal(fillerTurn.handoffRecord, undefined);
  assert.equal(fillerTurn.state.phase, "await_c_intent");
  assert.equal(fillerTurn.assistantOutput, AWAIT_INTENT_FILLER_REMINDER);
  assert.equal(fillerTurn.state.lastAssistantOutput, "当前问题\n候选方向\n优先候选\n确认提示");
  assert.deepEqual(getMessageTexts(fillerTurn.state.rawMessages), [
    { type: "human", text: "我要候选" },
    { type: "ai", text: "当前问题\n候选方向\n优先候选\n确认提示" },
    { type: "ai", text: AWAIT_INTENT_FILLER_REMINDER },
  ]);
});

test("任意时点显式退出时统一产出 explicit_exit handoff，且不调用模型", async () => {
  const result = await runTurn(createInitialAgentState(), "退出");

  assert.equal(result.model.calls.length, 0);
  assert.ok(result.handoffRecord);
  assert.equal(result.handoffRecord?.endReason, "explicit_exit");
  assert.equal(result.state.shouldExit, true);
  assert.equal(result.state.phase, "ended");
  assert.equal(result.assistantOutput, EXPLICIT_EXIT_REMINDER);
  assert.deepEqual(getMessageTexts(result.state.rawMessages), [
    { type: "human", text: "退出" },
    { type: "ai", text: EXPLICIT_EXIT_REMINDER },
  ]);
});
