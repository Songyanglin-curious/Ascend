import assert from "node:assert/strict";
import test from "node:test";

import {
  AWAIT_INTENT_FILLER_REMINDER,
  EMPTY_INPUT_REMINDER,
  processAdvanceInput,
} from "./cli.js";
import { buildAdvanceGraph } from "./graph.js";
import type { WorkflowModel } from "./model.js";
import { createInitialAgentState } from "./types.js";

class QueueWorkflowModel implements WorkflowModel {
  private readonly outputs: string[];

  constructor(outputs: string[]) {
    this.outputs = [...outputs];
  }

  async complete(): Promise<string> {
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
  const graph = buildAdvanceGraph(new QueueWorkflowModel(outputs));
  return processAdvanceInput(state, rawInput, graph);
}

function getMessageTexts(state: { messages: { type: string; text: string }[] }) {
  return state.messages.map((message) => ({
    type: message.type,
    text: message.text,
  }));
}

test("normalize 返回 EMPTY 时只结束当前轮并提示重新输入", async () => {
  const emptyTurn = await runTurn(createInitialAgentState(), "   ", ["EMPTY"]);

  assert.equal(emptyTurn.handoffRecord, undefined);
  assert.equal(emptyTurn.state.phase, "normal");
  assert.equal(emptyTurn.assistantOutput, EMPTY_INPUT_REMINDER);
  assert.equal(emptyTurn.state.messages.length, 2);
  assert.deepEqual(getMessageTexts(emptyTurn.state), [
    { type: "human", text: "   " },
    { type: "ai", text: EMPTY_INPUT_REMINDER },
  ]);

  const nextTurn = await runTurn(emptyTurn.state, "我要推进登录流程", [
    "我要推进登录流程",
    "A",
    "当前捕捉\n当前区分\n唯一追问",
  ]);

  assert.equal(nextTurn.state.phase, "normal");
  assert.equal(nextTurn.assistantOutput, "当前捕捉\n当前区分\n唯一追问");
});

test("A 路径可多轮循环并转入 B 和 C", async () => {
  const firstTurn = await runTurn(createInitialAgentState(), "需求很乱", [
    "需求很乱",
    "A",
    "当前捕捉\n当前区分\n唯一追问",
  ]);
  const secondTurn = await runTurn(firstTurn.state, "我先聚焦登录", [
    "我先聚焦登录",
    "B",
    "当前问题\n关键判断\n局部展开点",
  ]);
  const thirdTurn = await runTurn(secondTurn.state, "现在有两个推进方向", [
    "现在有两个推进方向",
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
    "问题对象已显形",
    "B",
    "当前问题\n关键判断\n局部展开点",
  ]);
  const secondTurn = await runTurn(firstTurn.state, "发现对象其实还没稳", [
    "发现对象其实还没稳",
    "A",
    "当前捕捉\n当前区分\n唯一追问",
  ]);
  const thirdTurn = await runTurn(secondTurn.state, "重新梳理后有两个候选", [
    "重新梳理后有两个候选",
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
  ]);

  assert.equal(firstTurn.state.currentState, "B");
  assert.equal(secondTurn.state.currentState, "A");
  assert.equal(thirdTurn.state.currentState, "C");
});

test("C 下 confirm 正常结束并统一产出 handoff", async () => {
  const candidateTurn = await runTurn(createInitialAgentState(), "给我候选", [
    "给我候选",
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
  ]);
  const confirmTurn = await runTurn(candidateTurn.state, "就按 A 走", [
    "confirm",
  ]);

  assert.equal(confirmTurn.state.phase, "ended");
  assert.ok(confirmTurn.handoffRecord);
  assert.equal(confirmTurn.handoffRecord?.endReason, "confirm");
  assert.equal(confirmTurn.handoffRecord?.messages.length, 3);
  assert.deepEqual(getMessageTexts(confirmTurn.state), [
    { type: "human", text: "给我候选" },
    { type: "ai", text: "当前问题\n候选方向\n优先候选\n确认提示" },
    { type: "human", text: "就按 A 走" },
  ]);
});

test("C 下 reject 会复用同轮输入重评且不重复写 user message", async () => {
  const candidateTurn = await runTurn(createInitialAgentState(), "请给我候选", [
    "请给我候选",
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
  ]);
  const rejectTurn = await runTurn(candidateTurn.state, "我觉得还差一点，再看看成本", [
    "reject",
    "再看看成本",
    "B",
    "当前问题\n关键判断\n局部展开点",
  ]);

  assert.equal(rejectTurn.handoffRecord, undefined);
  assert.equal(rejectTurn.state.phase, "normal");
  assert.equal(rejectTurn.state.currentState, "B");
  assert.equal(rejectTurn.state.messages.length, 4);
  assert.deepEqual(getMessageTexts(rejectTurn.state), [
    { type: "human", text: "请给我候选" },
    { type: "ai", text: "当前问题\n候选方向\n优先候选\n确认提示" },
    { type: "human", text: "我觉得还差一点，再看看成本" },
    { type: "ai", text: "当前问题\n关键判断\n局部展开点" },
  ]);
});

test("await_c_intent 下回车或语气词只提醒，不改状态，不进 recognizeIntent", async () => {
  const candidateTurn = await runTurn(createInitialAgentState(), "我要候选", [
    "我要候选",
    "C",
    "当前问题\n候选方向\n优先候选\n确认提示",
  ]);
  const fillerTurn = await runTurn(candidateTurn.state, "嗯");

  assert.equal(fillerTurn.handoffRecord, undefined);
  assert.equal(fillerTurn.state.phase, "await_c_intent");
  assert.equal(fillerTurn.assistantOutput, AWAIT_INTENT_FILLER_REMINDER);
  assert.deepEqual(getMessageTexts(fillerTurn.state), [
    { type: "human", text: "我要候选" },
    { type: "ai", text: "当前问题\n候选方向\n优先候选\n确认提示" },
    { type: "ai", text: AWAIT_INTENT_FILLER_REMINDER },
  ]);
});

test("任意时点显式退出时统一产出 explicit_exit handoff", async () => {
  const result = await runTurn(createInitialAgentState(), "退出");

  assert.ok(result.handoffRecord);
  assert.equal(result.handoffRecord?.endReason, "explicit_exit");
  assert.equal(result.state.shouldExit, true);
  assert.equal(result.state.phase, "ended");
  assert.deepEqual(getMessageTexts(result.state), [{ type: "human", text: "退出" }]);
});
