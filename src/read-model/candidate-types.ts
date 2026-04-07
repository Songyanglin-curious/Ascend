import type { ChildCandidateType } from "../child-candidates/types.js";
import type { NodeId } from "../node-tree/types.js";

export interface CandidateReadItem {
  candidateId: string;
  parentNodeId: NodeId;
  title: string;
  summary: string;
  type: ChildCandidateType;
  reason: string;
  evidence: string;
}

export interface CandidateReadModel {
  parentNodeId: NodeId;
  candidates: CandidateReadItem[];
}

export interface ConfirmCandidatesInput {
  parentNodeId: NodeId;
  selectedCandidateIds: string[];
}

export interface CreatedChildNodeRecord {
  id: NodeId;
  parentNodeId: NodeId;
  title: string | null;
  summary: string | null;
  sourceCandidateId: string | null;
  sourceCandidateType: ChildCandidateType | null;
}

export interface ConfirmCandidatesResult {
  parentNodeId: NodeId;
  createdNodes: CreatedChildNodeRecord[];
  createdCount: number;
}
