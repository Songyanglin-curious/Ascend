import type { ReactElement } from "react";
import { useMemo } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";

import type { FlowEdgeViewModel, FlowNodeViewModel } from "../data/types";

interface TreePanelProps {
  nodes: FlowNodeViewModel[];
  edges: FlowEdgeViewModel[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

function buildNodeLabel(node: FlowNodeViewModel): ReactElement {
  return (
    <div className="tree-node">
      <div className="tree-node__title">{node.label}</div>
      <div className="tree-node__status">{node.status}</div>
    </div>
  );
}

function buildFlowNode(node: FlowNodeViewModel): Node<{ label: ReactElement }> {
  return {
    id: node.id,
    position: node.position,
    data: {
      label: buildNodeLabel(node),
    },
    draggable: false,
    selectable: true,
    style: {
      width: 210,
      borderRadius: 20,
      border: node.selected ? "2px solid #20402c" : "1px solid #c9bfa9",
      background: node.selected ? "#f4ecd7" : "#fffaf0",
      boxShadow: node.selected
        ? "0 18px 36px rgba(32, 64, 44, 0.18)"
        : "0 10px 24px rgba(76, 60, 34, 0.08)",
      padding: 0,
    },
  };
}

function buildFlowEdge(edge: FlowEdgeViewModel): Edge {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: "#7a6b4a",
    },
    style: {
      stroke: "#7a6b4a",
      strokeWidth: 1.4,
    },
  };
}

export function TreePanel({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
}: TreePanelProps): ReactElement {
  const flowNodes = useMemo(() => nodes.map(buildFlowNode), [nodes]);
  const flowEdges = useMemo(() => edges.map(buildFlowEdge), [edges]);

  const handleNodeClick = useMemo<NodeMouseHandler>(
    () => (_event, node) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  return (
    <div className="panel tree-panel">
      <div className="panel__header">
        <div>
          <div className="panel__eyebrow">Node Tree</div>
          <h2 className="panel__title">树节点视图</h2>
        </div>
        <div className="panel__meta">{selectedNodeId ? `已选中 ${selectedNodeId}` : "未选中节点"}</div>
      </div>
      {flowNodes.length === 0 ? (
        <div className="panel__empty">当前没有可展示的树结构。</div>
      ) : (
        <div className="tree-panel__canvas">
          <ReactFlow
            fitView
            nodes={flowNodes}
            edges={flowEdges}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable
            proOptions={{ hideAttribution: true }}
            onNodeClick={handleNodeClick}
          >
            <MiniMap pannable zoomable />
            <Controls showInteractive={false} />
            <Background color="#d8ccb3" gap={28} />
          </ReactFlow>
        </div>
      )}
    </div>
  );
}
