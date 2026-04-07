import type { ReactElement } from "react";
import { startTransition, useEffect, useMemo, useState } from "react";

import { CandidatePanel } from "../modules/candidates/CandidatePanel";
import {
  advanceNode,
  confirmNodeCandidates,
  exitNodeAdvance,
  fetchNodeCandidates,
  fetchPageReadModel,
} from "../modules/data/api";
import {
  createEmptyCandidatePanelViewModel,
  resolveSelectedNodeId,
  toCandidatePanelViewModel,
  toPageViewModel,
} from "../modules/data/mappers";
import type {
  AdvanceNodeResult,
  CandidatePanelViewModel,
  PageReadModel,
} from "../modules/data/types";
import { ChatComposer } from "../modules/chat/ChatComposer";
import { ChatPanel } from "../modules/chat/ChatPanel";
import { PageShell } from "../modules/layout/PageShell";
import { TreePanel } from "../modules/tree/TreePanel";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; readModel: PageReadModel };

type CandidateLoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; viewModel: CandidatePanelViewModel };

type CandidateSubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

type ChatSubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

type ChatHintState = AdvanceNodeResult["hint"];

const CANDIDATE_LOAD_TIMEOUT_MS = 12000;

function buildErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function App(): ReactElement {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [candidateLoadState, setCandidateLoadState] = useState<CandidateLoadState>({
    status: "idle",
  });
  const [candidateSubmitState, setCandidateSubmitState] = useState<CandidateSubmitState>({
    status: "idle",
  });
  const [chatSubmitState, setChatSubmitState] = useState<ChatSubmitState>({
    status: "idle",
  });
  const [chatHint, setChatHint] = useState<ChatHintState>(null);
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [composerCollapsed, setComposerCollapsed] = useState(false);
  const [candidatesCollapsed, setCandidatesCollapsed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;

    void (async () => {
      try {
        const readModel = await fetchPageReadModel(controller.signal);
        if (disposed || controller.signal.aborted) {
          return;
        }

        setLoadState({ status: "ready", readModel });
      } catch (error: unknown) {
        if (disposed || controller.signal.aborted) {
          return;
        }

        setLoadState({
          status: "error",
          message: buildErrorMessage(error),
        });
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, []);

  const resolvedSelectedNodeId = useMemo(() => {
    if (loadState.status !== "ready") {
      return null;
    }

    return resolveSelectedNodeId(loadState.readModel, selectedNodeId);
  }, [loadState, selectedNodeId]);

  const pageViewModel = useMemo(() => {
    if (loadState.status !== "ready") {
      return null;
    }

    return toPageViewModel(loadState.readModel, resolvedSelectedNodeId);
  }, [loadState, resolvedSelectedNodeId]);

  useEffect(() => {
    if (loadState.status !== "ready") {
      return;
    }

    if (!resolvedSelectedNodeId) {
      setCandidateLoadState({
        status: "ready",
        viewModel: createEmptyCandidatePanelViewModel(null, "当前没有可确认的候选。"),
      });
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    setCandidateLoadState({ status: "loading" });

    void (async () => {
      let timeoutId: number | undefined;
      let timedOut = false;

      try {
        const readModel = await Promise.race([
          fetchNodeCandidates(resolvedSelectedNodeId, controller.signal),
          new Promise<never>((_resolve, reject) => {
            timeoutId = window.setTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(new Error("候选读取超时，请稍后重试。"));
            }, CANDIDATE_LOAD_TIMEOUT_MS);
          }),
        ]);
        if (disposed || controller.signal.aborted) {
          return;
        }

        setCandidateLoadState({
          status: "ready",
          viewModel: toCandidatePanelViewModel(readModel),
        });
      } catch (error: unknown) {
        if (disposed || (controller.signal.aborted && !timedOut)) {
          return;
        }

        setCandidateLoadState({
          status: "error",
          message: buildErrorMessage(error),
        });
      } finally {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      }
    })();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [loadState, resolvedSelectedNodeId]);

  const candidatePanelViewModel = useMemo(() => {
    if (candidateLoadState.status === "ready") {
      return candidateLoadState.viewModel;
    }

    return createEmptyCandidatePanelViewModel(
      resolvedSelectedNodeId,
      candidateLoadState.status === "error" ? "候选读取失败，请稍后重试。" : "当前没有可确认的候选。",
    );
  }, [candidateLoadState, resolvedSelectedNodeId]);

  if (loadState.status === "loading") {
    return <div className="app-state">页面数据加载中...</div>;
  }

  if (loadState.status === "error") {
    return <div className="app-state app-state--error">页面读取失败：{loadState.message}</div>;
  }

  if (!pageViewModel || !pageViewModel.hasTree) {
    return <div className="app-state">当前数据库还没有可展示的树节点。</div>;
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <div className="app__eyebrow">Ascend Readonly Viewer</div>
          <h1 className="app__title">树节点与聊天历史</h1>
        </div>
        <div className="app__summary">当前 root：{pageViewModel.rootNodeId}</div>
      </header>
      <PageShell
        treeCollapsed={treeCollapsed}
        chatCollapsed={chatCollapsed}
        composerCollapsed={composerCollapsed}
        candidatesCollapsed={candidatesCollapsed}
        onToggleTree={() => setTreeCollapsed((current) => !current)}
        onToggleChat={() => setChatCollapsed((current) => !current)}
        onToggleComposer={() => setComposerCollapsed((current) => !current)}
        onToggleCandidates={() => setCandidatesCollapsed((current) => !current)}
        treePanel={
          <TreePanel
            nodes={pageViewModel.flowNodes}
            edges={pageViewModel.flowEdges}
            selectedNodeId={pageViewModel.selectedNodeId}
            onSelectNode={(nodeId) => {
              startTransition(() => {
                setSelectedNodeId(nodeId);
                setCandidateSubmitState({ status: "idle" });
                setChatSubmitState({ status: "idle" });
                setChatHint(null);
              });
            }}
          />
        }
        chatPanel={<ChatPanel thread={pageViewModel.thread} />}
        chatComposer={
          <ChatComposer
            nodeId={pageViewModel.selectedNodeId}
            disabled={
              pageViewModel.selectedNodeId === null ||
              pageViewModel.selectedNodeExecutionStatus === "failed"
            }
            submitting={chatSubmitState.status === "submitting"}
            errorMessage={chatSubmitState.status === "error" ? chatSubmitState.message : null}
            onSubmit={(message) => {
              const nodeId = pageViewModel.selectedNodeId;
              if (!nodeId) {
                return;
              }

              void (async () => {
                setChatSubmitState({ status: "submitting" });
                setCandidateSubmitState({ status: "idle" });
                setChatHint(null);

                try {
                  const result = await advanceNode({
                    nodeId,
                    message,
                  });

                  setChatSubmitState({ status: "idle" });
                  setChatHint(result.hint);

                  const refreshedReadModel = await fetchPageReadModel();
                  startTransition(() => {
                    setLoadState({ status: "ready", readModel: refreshedReadModel });
                    setSelectedNodeId(nodeId);
                  });
                } catch (error: unknown) {
                  setChatSubmitState({
                    status: "error",
                    message: buildErrorMessage(error),
                  });
                }
              })();
            }}
            onExit={() => {
              const nodeId = pageViewModel.selectedNodeId;
              if (!nodeId) {
                return;
              }

              void (async () => {
                setChatSubmitState({ status: "submitting" });
                setCandidateSubmitState({ status: "idle" });
                setChatHint(null);

                try {
                  const result = await exitNodeAdvance(nodeId);

                  setChatSubmitState({ status: "idle" });
                  setChatHint(result.hint);

                  const refreshedReadModel = await fetchPageReadModel();
                  startTransition(() => {
                    setLoadState({ status: "ready", readModel: refreshedReadModel });
                    setSelectedNodeId(nodeId);
                  });
                } catch (error: unknown) {
                  setChatSubmitState({
                    status: "error",
                    message: buildErrorMessage(error),
                  });
                }
              })();
            }}
          />
        }
        candidatePanel={
          <CandidatePanel
            viewModel={candidatePanelViewModel}
            loading={candidateLoadState.status === "loading"}
            submitting={candidateSubmitState.status === "submitting"}
            errorMessage={
              candidateSubmitState.status === "error" ? candidateSubmitState.message : null
            }
            onConfirm={(selectedCandidateIds) => {
              const parentNodeId = pageViewModel.selectedNodeId;
              if (!parentNodeId) {
                return;
              }

              void (async () => {
                setCandidateSubmitState({ status: "submitting" });

                try {
                  await confirmNodeCandidates({
                    parentNodeId,
                    selectedCandidateIds,
                  });

                  const refreshedReadModel = await fetchPageReadModel();
                  startTransition(() => {
                    setLoadState({ status: "ready", readModel: refreshedReadModel });
                    setSelectedNodeId(parentNodeId);
                    setCandidateSubmitState({ status: "idle" });
                  });
                } catch (error: unknown) {
                  setCandidateSubmitState({
                    status: "error",
                    message: buildErrorMessage(error),
                  });
                }
              })();
            }}
          />
        }
      />
      {chatHint ? (
        <div className={`app__notice app__notice--${chatHint.level}`}>{chatHint.text}</div>
      ) : null}
    </div>
  );
}
