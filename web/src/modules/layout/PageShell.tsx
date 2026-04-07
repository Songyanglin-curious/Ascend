import type { CSSProperties, ReactElement, ReactNode } from "react";

interface PageShellProps {
  treePanel: ReactNode;
  chatPanel: ReactNode;
  chatComposer: ReactNode;
  candidatePanel: ReactNode;
  treeCollapsed: boolean;
  chatCollapsed: boolean;
  composerCollapsed: boolean;
  candidatesCollapsed: boolean;
  onToggleTree: () => void;
  onToggleChat: () => void;
  onToggleComposer: () => void;
  onToggleCandidates: () => void;
}

export function PageShell({
  treePanel,
  chatPanel,
  chatComposer,
  candidatePanel,
  treeCollapsed,
  chatCollapsed,
  composerCollapsed,
  candidatesCollapsed,
  onToggleTree,
  onToggleChat,
  onToggleComposer,
  onToggleCandidates,
}: PageShellProps): ReactElement {
  const shellStyle = {
    "--page-shell-tree-width": treeCollapsed ? "88px" : "minmax(360px, 1.08fr)",
    "--page-shell-side-width": treeCollapsed ? "minmax(520px, 1fr)" : "minmax(340px, 0.92fr)",
    "--page-shell-chat-size": chatCollapsed ? "60px" : "minmax(260px, 1fr)",
    "--page-shell-composer-size": composerCollapsed ? "60px" : "minmax(220px, auto)",
    "--page-shell-candidates-size": candidatesCollapsed ? "60px" : "minmax(280px, 0.95fr)",
  } as CSSProperties;

  return (
    <main className="page-shell" style={shellStyle}>
      <section
        className="page-shell__column page-shell__column--tree"
        data-collapsed={treeCollapsed}
      >
        <div className="page-shell__panel-host page-shell__panel-host--tree">{treePanel}</div>
        <button className="page-shell__toggle page-shell__toggle--tree" type="button" onClick={onToggleTree}>
          {treeCollapsed ? "展开树图" : "收起树图"}
        </button>
      </section>
      <section className="page-shell__column page-shell__column--side">
        <div className="page-shell__stack page-shell__stack--chat" data-collapsed={chatCollapsed}>
          <div className="page-shell__panel-host">{chatPanel}</div>
          <button className="page-shell__toggle page-shell__toggle--stack" type="button" onClick={onToggleChat}>
            {chatCollapsed ? "展开聊天历史" : "收起聊天历史"}
          </button>
        </div>
        <div
          className="page-shell__stack page-shell__stack--composer"
          data-collapsed={composerCollapsed}
        >
          <div className="page-shell__panel-host">{chatComposer}</div>
          <button
            className="page-shell__toggle page-shell__toggle--stack"
            type="button"
            onClick={onToggleComposer}
          >
            {composerCollapsed ? "展开继续推进" : "收起继续推进"}
          </button>
        </div>
        <div
          className="page-shell__stack page-shell__stack--candidates"
          data-collapsed={candidatesCollapsed}
        >
          <div className="page-shell__panel-host">{candidatePanel}</div>
          <button
            className="page-shell__toggle page-shell__toggle--stack"
            type="button"
            onClick={onToggleCandidates}
          >
            {candidatesCollapsed ? "展开候选区" : "收起候选区"}
          </button>
        </div>
      </section>
    </main>
  );
}
