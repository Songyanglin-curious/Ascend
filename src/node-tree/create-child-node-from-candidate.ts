import type { ChildCandidate } from "../child-candidates/types.js";

import type { NodeStore, SceneNode, TreeService } from "./types.js";

export function createChildNodeFromCandidate(params: {
  parentNodeId: string;
  candidate: ChildCandidate;
  nodeStore: NodeStore;
  treeService: TreeService;
}): SceneNode {
  const parentNode = params.nodeStore.getNodeById(params.parentNodeId);
  if (!parentNode) {
    throw new Error(`未找到父节点: ${params.parentNodeId}`);
  }

  if (params.candidate.parentNodeId !== params.parentNodeId) {
    throw new Error("候选子节点的来源父节点与当前父节点不一致。");
  }

  const childNode = params.nodeStore.createNode("advance", {}, {
    title: params.candidate.title,
    summary: params.candidate.summary,
    sourceParentNodeId: params.parentNodeId,
    sourceCandidateId: params.candidate.candidateId,
    sourceCandidateType: params.candidate.type,
  });

  params.treeService.createChild(params.parentNodeId, childNode.id);

  return childNode;
}
