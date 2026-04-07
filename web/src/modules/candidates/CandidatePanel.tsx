import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

import type { CandidatePanelViewModel } from "../data/types";

interface CandidatePanelProps {
  viewModel: CandidatePanelViewModel;
  submitting: boolean;
  errorMessage: string | null;
  loading: boolean;
  onConfirm: (selectedCandidateIds: string[]) => void;
}

export function CandidatePanel({
  viewModel,
  submitting,
  errorMessage,
  loading,
  onConfirm,
}: CandidatePanelProps): ReactElement {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedIds([]);
  }, [viewModel.parentNodeId]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggleCandidate(candidateId: string): void {
    setSelectedIds((current) => {
      if (current.includes(candidateId)) {
        return current.filter((id) => id !== candidateId);
      }

      return [...current, candidateId];
    });
  }

  return (
    <div className="panel candidate-panel">
      <div className="panel__header">
        <div>
          <div className="panel__eyebrow">Candidates</div>
          <h2 className="panel__title">候选子节点</h2>
        </div>
        <div className="panel__meta">
          {viewModel.parentNodeId ? `父节点 ${viewModel.parentNodeId}` : "当前未选中节点"}
        </div>
      </div>
      {loading ? (
        <div className="panel__empty">候选加载中...</div>
      ) : viewModel.isEmpty ? (
        <div className="panel__empty">{viewModel.emptyHint}</div>
      ) : (
        <div className="candidate-panel__body">
          <div className="candidate-panel__list">
            {viewModel.items.map((candidate) => (
              <label className="candidate-card" key={candidate.candidateId}>
                <input
                  className="candidate-card__checkbox"
                  type="checkbox"
                  checked={selectedSet.has(candidate.candidateId)}
                  disabled={submitting}
                  onChange={() => toggleCandidate(candidate.candidateId)}
                />
                <div className="candidate-card__content">
                  <div className="candidate-card__topline">
                    <span className="candidate-card__type">{candidate.type}</span>
                    <span className="candidate-card__title">{candidate.title}</span>
                  </div>
                  <div className="candidate-card__summary">{candidate.summary}</div>
                  <div className="candidate-card__field">
                    <span className="candidate-card__label">Reason</span>
                    <span>{candidate.reason}</span>
                  </div>
                  <div className="candidate-card__field">
                    <span className="candidate-card__label">Evidence</span>
                    <span>{candidate.evidence}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
          <div className="candidate-panel__footer">
            <div className="candidate-panel__summary">
              已选择 {selectedIds.length} 项，空选提交表示本轮不创建子节点。
            </div>
            {errorMessage ? <div className="candidate-panel__error">{errorMessage}</div> : null}
            <button
              className="candidate-panel__submit"
              type="button"
              disabled={submitting}
              onClick={() => onConfirm(selectedIds)}
            >
              {submitting ? "确认中..." : "确认创建子节点"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
