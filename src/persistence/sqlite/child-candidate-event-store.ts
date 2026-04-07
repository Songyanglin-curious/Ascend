import { randomUUID } from "node:crypto";

import type { ChildCandidate } from "../../child-candidates/types.js";
import type { SqliteClient } from "./client.js";

export interface ChildCandidateEventStore {
  recordConfirmationBatch(params: {
    parentNodeId: string;
    candidates: ChildCandidate[];
    selectedCandidateIds: string[];
  }): void;
}

export function createSqliteChildCandidateEventStore(
  client: SqliteClient,
): ChildCandidateEventStore {
  const insertStatement = client.db.prepare(`
    INSERT INTO child_candidate_events (
      id,
      parent_node_id,
      candidate_id,
      candidate_json,
      selected
    ) VALUES (?, ?, ?, ?, ?)
  `);

  return {
    recordConfirmationBatch(params): void {
      const selectedCandidateIds = new Set(params.selectedCandidateIds);

      for (const candidate of params.candidates) {
        insertStatement.run(
          randomUUID(),
          params.parentNodeId,
          candidate.candidateId,
          JSON.stringify(candidate),
          selectedCandidateIds.has(candidate.candidateId) ? 1 : 0,
        );
      }
    },
  };
}
