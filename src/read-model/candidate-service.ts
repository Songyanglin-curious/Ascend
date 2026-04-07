import { createHash } from "node:crypto";

import type { ChildCandidate } from "../child-candidates/types.js";
import { validateChildCandidateRawItem } from "../child-candidates/extractor.js";
import { extractChildCandidates } from "../child-candidates/extractor.js";
import type { SceneNode } from "../node-tree/types.js";
import { createSqliteClient } from "../persistence/sqlite/client.js";
import { createSqliteNodeStore } from "../persistence/sqlite/node-store.js";
import { ensureSqliteSchema } from "../persistence/sqlite/schema.js";
import type { WorkflowModel } from "../workflows/advance/model.js";
import type { CandidateReadItem, CandidateReadModel } from "./candidate-types.js";

interface CandidateEventRow {
  candidate_json: string;
  selected: number;
  created_at: string;
}

interface StableCandidateIdentityFields {
  title: string;
  summary: string;
  type: ChildCandidate["type"];
  reason: string;
  evidence: string;
}

function buildStableCandidateSeed(
  parentNodeId: string,
  candidate: StableCandidateIdentityFields,
): string {
  return JSON.stringify({
    parentNodeId,
    title: candidate.title.trim(),
    summary: candidate.summary.trim(),
    type: candidate.type,
    reason: candidate.reason.trim(),
    evidence: candidate.evidence.trim(),
  });
}

export function buildStableCandidateId(
  parentNodeId: string,
  candidate: StableCandidateIdentityFields,
): string {
  const hash = createHash("sha1");
  hash.update(buildStableCandidateSeed(parentNodeId, candidate), "utf8");
  return `candidate:${hash.digest("hex")}`;
}

export function normalizeExtractedCandidatesForPage(
  parentNodeId: string,
  candidates: ChildCandidate[],
): ChildCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    parentNodeId,
    candidateId: buildStableCandidateId(parentNodeId, candidate),
  }));
}

function toCandidateReadItem(candidate: ChildCandidate): CandidateReadItem {
  return {
    candidateId: candidate.candidateId,
    parentNodeId: candidate.parentNodeId,
    title: candidate.title,
    summary: candidate.summary,
    type: candidate.type,
    reason: candidate.reason,
    evidence: candidate.evidence,
  };
}

function parseCandidateFromStoredEvent(parentNodeId: string, candidateJson: string): ChildCandidate {
  const parsed = JSON.parse(candidateJson) as unknown;
  const item = validateChildCandidateRawItem(parsed);

  return {
    candidateId: buildStableCandidateId(parentNodeId, item),
    parentNodeId,
    title: item.title,
    summary: item.summary,
    type: item.type,
    reason: item.reason,
    evidence: item.evidence,
  };
}

export function loadCandidatesFromLatestEventBatch(
  client: ReturnType<typeof createSqliteClient>,
  parentNodeId: string,
): ChildCandidate[] | null {
  const latestBatchRow = client.db
    .prepare(
      `
        SELECT MAX(created_at) AS latest_created_at
        FROM child_candidate_events
        WHERE parent_node_id = ?
      `,
    )
    .get(parentNodeId) as { latest_created_at: string | null } | undefined;

  if (!latestBatchRow?.latest_created_at) {
    return null;
  }

  const rows = client.db
    .prepare(
      `
        SELECT candidate_json, selected, created_at
        FROM child_candidate_events
        WHERE parent_node_id = ?
          AND created_at = ?
        ORDER BY id ASC
      `,
    )
    .all(parentNodeId, latestBatchRow.latest_created_at) as CandidateEventRow[];

  return rows
    .filter((row) => row.selected === 0)
    .map((row) => parseCandidateFromStoredEvent(parentNodeId, row.candidate_json));
}

export async function extractStableCandidatesForNode(
  node: SceneNode,
  model: WorkflowModel,
): Promise<ChildCandidate[]> {
  if (!node.rawResult) {
    return [];
  }

  const extractedCandidates = await extractChildCandidates({
    parentNodeId: node.id,
    rawMessages: node.rawResult.rawMessages,
    model,
  });

  return normalizeExtractedCandidatesForPage(node.id, extractedCandidates);
}

export async function loadCurrentCandidatesForNode(params: {
  client: ReturnType<typeof createSqliteClient>;
  parentNode: SceneNode;
  model: WorkflowModel;
}): Promise<ChildCandidate[]> {
  if (
    !params.parentNode.rawResult ||
    (params.parentNode.rawResult.phase ?? "ended") !== "ended" ||
    params.parentNode.rawResult.currentState !== "C"
  ) {
    return [];
  }

  const eventCandidates = loadCandidatesFromLatestEventBatch(params.client, params.parentNode.id);
  if (eventCandidates !== null) {
    return eventCandidates;
  }

  return extractStableCandidatesForNode(params.parentNode, params.model);
}

export async function loadNodeCandidates(params: {
  databasePath: string;
  parentNodeId: string;
  model: WorkflowModel;
}): Promise<CandidateReadModel> {
  const client = createSqliteClient(params.databasePath);

  try {
    ensureSqliteSchema(client);

    const nodeStore = createSqliteNodeStore(client);
    const parentNode = nodeStore.getNodeById(params.parentNodeId);
    if (!parentNode) {
      throw new Error(`未找到候选读取对应的父节点: ${params.parentNodeId}`);
    }

    if (!parentNode.rawResult) {
      return {
        parentNodeId: params.parentNodeId,
        candidates: [],
      };
    }

    const candidates = await loadCurrentCandidatesForNode({
      client,
      parentNode,
      model: params.model,
    });

    return {
      parentNodeId: params.parentNodeId,
      candidates: candidates.map((candidate) => toCandidateReadItem(candidate)),
    };
  } finally {
    client.close();
  }
}
