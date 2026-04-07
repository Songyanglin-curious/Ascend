import { createChildNodeFromCandidate } from "../node-tree/create-child-node-from-candidate.js";
import { createTreeService } from "../node-tree/tree-service.js";
import { loadCurrentCandidatesForNode } from "../read-model/candidate-service.js";
import type {
  ConfirmCandidatesInput,
  ConfirmCandidatesResult,
  CreatedChildNodeRecord,
} from "../read-model/candidate-types.js";
import { createSqliteClient } from "../persistence/sqlite/client.js";
import { createSqliteChildCandidateEventStore } from "../persistence/sqlite/child-candidate-event-store.js";
import { createSqliteNodeStore } from "../persistence/sqlite/node-store.js";
import { ensureSqliteSchema } from "../persistence/sqlite/schema.js";
import { createSqliteTreeStore } from "../persistence/sqlite/tree-store.js";
import type { WorkflowModel } from "../workflows/advance/model.js";

function mapCreatedNode(parentNodeId: string, node: {
  id: string;
  meta: {
    title: string | null;
    summary: string | null;
    sourceCandidateId: string | null;
    sourceCandidateType: CreatedChildNodeRecord["sourceCandidateType"];
  };
}): CreatedChildNodeRecord {
  return {
    id: node.id,
    parentNodeId,
    title: node.meta.title,
    summary: node.meta.summary,
    sourceCandidateId: node.meta.sourceCandidateId,
    sourceCandidateType: node.meta.sourceCandidateType,
  };
}

export async function confirmNodeCandidatesAction(params: {
  databasePath: string;
  parentNodeId: ConfirmCandidatesInput["parentNodeId"];
  selectedCandidateIds: ConfirmCandidatesInput["selectedCandidateIds"];
  model: WorkflowModel;
}): Promise<ConfirmCandidatesResult> {
  const client = createSqliteClient(params.databasePath);

  try {
    ensureSqliteSchema(client);

    const nodeStore = createSqliteNodeStore(client);
    const treeStore = createSqliteTreeStore(client);
    const treeService = createTreeService(nodeStore, treeStore);
    const candidateEventStore = createSqliteChildCandidateEventStore(client);

    const parentNode = nodeStore.getNodeById(params.parentNodeId);
    if (!parentNode) {
      throw new Error(`未找到候选确认对应的父节点: ${params.parentNodeId}`);
    }

    const candidates = await loadCurrentCandidatesForNode({
      client,
      parentNode,
      model: params.model,
    });
    const candidateMap = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
    const seenCandidateIds = new Set<string>();

    const selectedCandidates = params.selectedCandidateIds.flatMap((candidateId) => {
      if (seenCandidateIds.has(candidateId)) {
        return [];
      }

      seenCandidateIds.add(candidateId);
      const candidate = candidateMap.get(candidateId);
      if (!candidate) {
        throw new Error(`提交的 candidateId 不属于当前父节点: ${candidateId}`);
      }

      return [candidate];
    });

    return client.transaction(() => {
      candidateEventStore.recordConfirmationBatch({
        parentNodeId: params.parentNodeId,
        candidates,
        selectedCandidateIds: params.selectedCandidateIds,
      });

      if (selectedCandidates.length === 0) {
        return {
          parentNodeId: params.parentNodeId,
          createdNodes: [],
          createdCount: 0,
        };
      }

      const createdNodes = selectedCandidates.map((candidate) =>
        createChildNodeFromCandidate({
          parentNodeId: params.parentNodeId,
          candidate,
          nodeStore,
          treeService,
        }),
      );

      return {
        parentNodeId: params.parentNodeId,
        createdNodes: createdNodes.map((node) => mapCreatedNode(params.parentNodeId, node)),
        createdCount: createdNodes.length,
      };
    });
  } finally {
    client.close();
  }
}
