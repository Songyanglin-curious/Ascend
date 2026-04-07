export type NodeExecutionStatus = "idle" | "running" | "completed" | "failed";
export type SceneType = "advance";
export type ChatMessageRole = "user" | "assistant";

export interface PageMessageRecord {
  id: string;
  role: ChatMessageRole;
  content: string;
  order: number;
}

export interface PageNodeRecord {
  id: string;
  sceneType: SceneType;
  executionStatus: NodeExecutionStatus;
  title: string | null;
  summary: string | null;
  label: string;
  messages: PageMessageRecord[];
}

export interface PageTreeRelationRecord {
  nodeId: string;
  parentId: string | null;
  childrenIds: string[];
}

export interface PageReadModel {
  rootNodeId: string | null;
  nodes: PageNodeRecord[];
  relations: PageTreeRelationRecord[];
}

export interface CandidateDto {
  candidateId: string;
  parentNodeId: string;
  title: string;
  summary: string;
  type: "question" | "direction" | "constraint";
  reason: string;
  evidence: string;
}

export interface CandidateReadModelDto {
  parentNodeId: string;
  candidates: CandidateDto[];
}

export interface CreatedChildNodeDto {
  id: string;
  parentNodeId: string;
  title: string | null;
  summary: string | null;
  sourceCandidateId: string | null;
  sourceCandidateType: CandidateDto["type"] | null;
}

export interface ConfirmCandidatesPayload {
  parentNodeId: string;
  selectedCandidateIds: string[];
}

export interface ConfirmCandidatesResult {
  parentNodeId: string;
  createdNodes: CreatedChildNodeDto[];
  createdCount: number;
}

export interface FlowNodeViewModel {
  id: string;
  label: string;
  status: NodeExecutionStatus;
  summary: string | null;
  position: {
    x: number;
    y: number;
  };
  selected: boolean;
}

export interface FlowEdgeViewModel {
  id: string;
  source: string;
  target: string;
}

export interface ChatMessageViewModel {
  id: string;
  role: ChatMessageRole;
  content: string;
}

export interface ChatThreadViewModel {
  nodeId: string | null;
  title: string;
  subtitle: string | null;
  messages: ChatMessageViewModel[];
  emptyHint: string | null;
}

export interface AdvanceNodePayload {
  nodeId: string;
  message: string;
}

export interface AdvanceNodeResult {
  nodeId: string;
  action: "advance" | "exit";
  workflow: {
    phase: "normal" | "await_c_intent" | "ended";
    currentState: "A" | "B" | "C" | null;
    ended: boolean;
    endReason: "confirm" | "explicit_exit" | null;
  };
  candidateRefreshRecommended: boolean;
  hint: {
    level: "info" | "success";
    text: string;
  } | null;
  latestAssistantOutput: string;
}

export interface CandidateViewModel {
  candidateId: string;
  title: string;
  summary: string;
  type: CandidateDto["type"];
  reason: string;
  evidence: string;
}

export interface CandidatePanelViewModel {
  parentNodeId: string | null;
  items: CandidateViewModel[];
  isEmpty: boolean;
  emptyHint: string;
}

export interface PageViewModel {
  hasTree: boolean;
  rootNodeId: string | null;
  selectedNodeId: string | null;
  selectedNodeExecutionStatus: NodeExecutionStatus | null;
  flowNodes: FlowNodeViewModel[];
  flowEdges: FlowEdgeViewModel[];
  thread: ChatThreadViewModel;
}
