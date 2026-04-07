export type ChildCandidateType = "question" | "direction" | "constraint";

export interface ChildCandidateRawItem {
  title: string;
  summary: string;
  type: ChildCandidateType;
  reason: string;
  evidence: string;
}

export interface ChildCandidate {
  candidateId: string;
  parentNodeId: string;
  title: string;
  summary: string;
  type: ChildCandidateType;
  reason: string;
  evidence: string;
}

export type ChildCandidateSelectionResult = ChildCandidate[];
