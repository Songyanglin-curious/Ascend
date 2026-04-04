import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";

export const EMPTY_NORMALIZED_QUERY = "EMPTY" as const;

export type ProblemState = "A" | "B" | "C" | null;
export type Phase = "normal" | "await_c_intent" | "ended";
export type WorkflowEndReason = "confirm" | "explicit_exit";

export interface AgentState {
  messages: BaseMessage[];
  rawInput: string;
  normalizedQuery: string;
  currentState: ProblemState;
  phase: Phase;
  shouldExit: boolean;
  lastAssistantOutput: string;
}

export interface HandoffRecord {
  messages: BaseMessage[];
  endReason: WorkflowEndReason;
  currentState: ProblemState;
  lastAssistantOutput: string;
}

function replaceWithLatest<T>(_: T, right: T): T {
  return right;
}

function appendMessages(left: BaseMessage[], right: BaseMessage[]): BaseMessage[] {
  return left.concat(right);
}

export const AdvanceStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
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
    messages: [],
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
    messages: [...state.messages],
    endReason,
    currentState: state.currentState,
    lastAssistantOutput: state.lastAssistantOutput,
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
