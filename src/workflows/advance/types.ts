import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

export const EMPTY_NORMALIZED_QUERY = "EMPTY" as const;

export type ProblemState = "A" | "B" | "C" | null;
export type Phase = "normal" | "await_c_intent" | "ended";
export type WorkflowEndReason = "confirm" | "explicit_exit";

export interface AgentState {
  // 原始会话转录：用户真实输入 + assistant 实际输出 + 必要系统提醒。
  rawMessages: BaseMessage[];
  // 工作流真正依赖的分析上下文：只保留规范化后的问题与业务输出。
  analysisMessages: BaseMessage[];
  rawInput: string;
  normalizedQuery: string;
  currentState: ProblemState;
  phase: Phase;
  shouldExit: boolean;
  // 只保存最近一次业务 assistant 输出，不被 CLI 固定提醒覆盖。
  lastAssistantOutput: string;
}

export interface HandoffRecord {
  rawMessages: BaseMessage[];
  endReason: WorkflowEndReason;
  currentState: ProblemState;
  lastAssistantOutput: string;
}

export interface AdvanceSceneRawResult {
  rawMessages: BaseMessage[];
  analysisMessages?: BaseMessage[];
  endReason: WorkflowEndReason | null;
  currentState: ProblemState;
  phase?: Phase;
  lastAssistantOutput: string;
}

function replaceWithLatest<T>(_: T, right: T): T {
  return right;
}

function appendMessages(left: BaseMessage[], right: BaseMessage[]): BaseMessage[] {
  return left.concat(right);
}

export const AdvanceStateAnnotation = Annotation.Root({
  rawMessages: Annotation<BaseMessage[]>({
    reducer: appendMessages,
    default: () => [],
  }),
  analysisMessages: Annotation<BaseMessage[]>({
    reducer: appendMessages,
    default: () => [],
  }),
  rawInput: Annotation<string>({
    reducer: replaceWithLatest,
    default: () => "",
  }),
  normalizedQuery: Annotation<string>({
    reducer: replaceWithLatest,
    default: () => "",
  }),
  currentState: Annotation<ProblemState>({
    reducer: replaceWithLatest,
    default: () => null,
  }),
  phase: Annotation<Phase>({
    reducer: replaceWithLatest,
    default: () => "normal",
  }),
  shouldExit: Annotation<boolean>({
    reducer: replaceWithLatest,
    default: () => false,
  }),
  lastAssistantOutput: Annotation<string>({
    reducer: replaceWithLatest,
    default: () => "",
  }),
});

export type AdvanceGraphState = typeof AdvanceStateAnnotation.State;
export type AdvanceGraphUpdate = typeof AdvanceStateAnnotation.Update;

export function createInitialAgentState(): AgentState {
  return {
    rawMessages: [],
    analysisMessages: [],
    rawInput: "",
    normalizedQuery: "",
    currentState: null,
    phase: "normal",
    shouldExit: false,
    lastAssistantOutput: "",
  };
}

export function buildHandoffRecord(
  state: AgentState,
  endReason: WorkflowEndReason,
): HandoffRecord {
  return {
    rawMessages: [...state.rawMessages],
    endReason,
    currentState: state.currentState,
    lastAssistantOutput: state.lastAssistantOutput,
  };
}

export function buildAdvanceSceneRawResult(
  state: AgentState,
  endReason: WorkflowEndReason | null,
): AdvanceSceneRawResult {
  return {
    rawMessages: [...state.rawMessages],
    analysisMessages: [...state.analysisMessages],
    endReason,
    currentState: state.currentState,
    phase: state.phase,
    lastAssistantOutput: state.lastAssistantOutput,
  };
}

export function createContinuationStateFromRawResult(
  rawResult: AdvanceSceneRawResult | null,
): AgentState {
  if (!rawResult) {
    return createInitialAgentState();
  }

  return {
    rawMessages: [...rawResult.rawMessages],
    analysisMessages: [...(rawResult.analysisMessages ?? rawResult.rawMessages)],
    rawInput: "",
    normalizedQuery: "",
    currentState: rawResult.currentState,
    // 已结束节点在继续推进时应回到 normal 起点；未结束节点则按快照继续。
    phase: (rawResult.phase ?? "ended") === "ended" ? "normal" : (rawResult.phase ?? "ended"),
    shouldExit: false,
    lastAssistantOutput: rawResult.lastAssistantOutput,
  };
}

export function appendHumanMessage(messages: BaseMessage[], content: string): BaseMessage[] {
  return messages.concat(new HumanMessage(content));
}

export function appendAssistantMessage(messages: BaseMessage[], content: string): BaseMessage[] {
  return messages.concat(new AIMessage(content));
}

export function isEmptyNormalizedQuery(normalizedQuery: string): boolean {
  return normalizedQuery === EMPTY_NORMALIZED_QUERY;
}
