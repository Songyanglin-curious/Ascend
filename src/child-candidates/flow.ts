import { createChildNodeFromCandidate } from "../node-tree/create-child-node-from-candidate.js";
import type { NodeStore, SceneNode, TreeService } from "../node-tree/types.js";
import type { ChildCandidateEventStore } from "../persistence/sqlite/child-candidate-event-store.js";
import type { WorkflowModel } from "../workflows/advance/model.js";
import { confirmChildCandidates, type ConfirmationIO } from "./confirmation.js";
import { extractChildCandidates } from "./extractor.js";

export async function processCompletedNodeChildCandidates(params: {
  parentNodeId: string;
  nodeStore: NodeStore;
  treeService: TreeService;
  candidateEventStore: ChildCandidateEventStore;
  transaction<T>(fn: () => T): T;
  model: WorkflowModel;
  io: ConfirmationIO;
}): Promise<SceneNode[]> {
  const parentNode = params.nodeStore.getNodeById(params.parentNodeId);
  if (!parentNode) {
    throw new Error(`未找到父节点: ${params.parentNodeId}`);
  }

  if (!parentNode.rawResult) {
    throw new Error(`父节点尚未产生场景原始结果: ${params.parentNodeId}`);
  }

  const candidates = await extractChildCandidates({
    parentNodeId: params.parentNodeId,
    rawMessages: parentNode.rawResult.rawMessages,
    model: params.model,
  });

  if (candidates.length === 0) {
    return [];
  }

  const selectedCandidates = await confirmChildCandidates(candidates, params.io);

  return params.transaction(() => {
    params.candidateEventStore.recordConfirmationBatch({
      parentNodeId: params.parentNodeId,
      candidates,
      selectedCandidateIds: selectedCandidates.map((candidate) => candidate.candidateId),
    });

    if (selectedCandidates.length === 0) {
      return [];
    }

    return selectedCandidates.map((candidate) =>
      createChildNodeFromCandidate({
        parentNodeId: params.parentNodeId,
        candidate,
        nodeStore: params.nodeStore,
        treeService: params.treeService,
      }),
    );
  });
}
