import type {
  CandidatePanelViewModel,
  CandidateReadModelDto,
  ChatThreadViewModel,
  FlowEdgeViewModel,
  FlowNodeViewModel,
  PageNodeRecord,
  PageReadModel,
  PageTreeRelationRecord,
  PageViewModel,
} from "./types";

const HORIZONTAL_GAP = 280;
const VERTICAL_GAP = 164;

function buildNodeMap(readModel: PageReadModel): Map<string, PageNodeRecord> {
  return new Map(readModel.nodes.map((node) => [node.id, node]));
}

function buildRelationMap(readModel: PageReadModel): Map<string, PageTreeRelationRecord> {
  return new Map(readModel.relations.map((relation) => [relation.nodeId, relation]));
}

export function resolveSelectedNodeId(
  readModel: PageReadModel,
  requestedNodeId: string | null,
): string | null {
  const nodeMap = buildNodeMap(readModel);

  if (requestedNodeId && nodeMap.has(requestedNodeId)) {
    return requestedNodeId;
  }

  if (readModel.rootNodeId && nodeMap.has(readModel.rootNodeId)) {
    return readModel.rootNodeId;
  }

  return readModel.nodes[0]?.id ?? null;
}

function buildNodePositions(readModel: PageReadModel): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const relationMap = buildRelationMap(readModel);
  const levels = new Map<number, string[]>();
  const visited = new Set<string>();

  function visit(nodeId: string, depth: number): void {
    if (visited.has(nodeId)) {
      return;
    }

    visited.add(nodeId);

    const levelNodes = levels.get(depth) ?? [];
    levelNodes.push(nodeId);
    levels.set(depth, levelNodes);

    const relation = relationMap.get(nodeId);
    if (!relation) {
      return;
    }

    for (const childId of relation.childrenIds) {
      visit(childId, depth + 1);
    }
  }

  if (readModel.rootNodeId) {
    visit(readModel.rootNodeId, 0);
  }

  for (const node of readModel.nodes) {
    if (!visited.has(node.id)) {
      visit(node.id, levels.size);
    }
  }

  for (const [depth, nodeIds] of levels.entries()) {
    nodeIds.forEach((nodeId, index) => {
      positions.set(nodeId, {
        x: depth * HORIZONTAL_GAP,
        y: index * VERTICAL_GAP,
      });
    });
  }

  return positions;
}

export function toFlowNodes(
  readModel: PageReadModel,
  selectedNodeId: string | null,
): FlowNodeViewModel[] {
  const nodePositions = buildNodePositions(readModel);

  return readModel.nodes.map((node) => ({
    id: node.id,
    label: node.label,
    status: node.executionStatus,
    summary: node.summary,
    position: nodePositions.get(node.id) ?? { x: 0, y: 0 },
    selected: node.id === selectedNodeId,
  }));
}

export function toFlowEdges(readModel: PageReadModel): FlowEdgeViewModel[] {
  return readModel.relations.flatMap((relation) =>
    relation.childrenIds.map((childId) => ({
      id: `${relation.nodeId}->${childId}`,
      source: relation.nodeId,
      target: childId,
    })),
  );
}

export function toChatThreadViewModel(
  readModel: PageReadModel,
  selectedNodeId: string | null,
): ChatThreadViewModel {
  const nodeMap = buildNodeMap(readModel);
  const selectedNode = selectedNodeId ? nodeMap.get(selectedNodeId) ?? null : null;

  if (!selectedNode) {
    return {
      nodeId: null,
      title: "尚未选中节点",
      subtitle: null,
      messages: [],
      emptyHint: "当前没有可展示的节点聊天历史。",
    };
  }

  return {
    nodeId: selectedNode.id,
    title: selectedNode.label,
    subtitle: selectedNode.summary,
    messages: selectedNode.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
    })),
    emptyHint:
      selectedNode.messages.length === 0 ? "当前节点没有聊天历史。" : null,
  };
}

export function toPageViewModel(
  readModel: PageReadModel,
  requestedSelectedNodeId: string | null,
): PageViewModel {
  const selectedNodeId = resolveSelectedNodeId(readModel, requestedSelectedNodeId);
  const selectedNode = selectedNodeId
    ? readModel.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const hasTree = readModel.rootNodeId !== null && readModel.nodes.length > 0;

  return {
    hasTree,
    rootNodeId: readModel.rootNodeId,
    selectedNodeId,
    selectedNodeExecutionStatus: selectedNode?.executionStatus ?? null,
    flowNodes: toFlowNodes(readModel, selectedNodeId),
    flowEdges: toFlowEdges(readModel),
    thread: toChatThreadViewModel(readModel, selectedNodeId),
  };
}

export function createEmptyCandidatePanelViewModel(
  parentNodeId: string | null,
  emptyHint: string,
): CandidatePanelViewModel {
  return {
    parentNodeId,
    items: [],
    isEmpty: true,
    emptyHint,
  };
}

export function toCandidatePanelViewModel(
  readModel: CandidateReadModelDto,
): CandidatePanelViewModel {
  if (readModel.candidates.length === 0) {
    return createEmptyCandidatePanelViewModel(readModel.parentNodeId, "当前节点没有可确认的候选。");
  }

  return {
    parentNodeId: readModel.parentNodeId,
    items: readModel.candidates.map((candidate) => ({
      candidateId: candidate.candidateId,
      title: candidate.title,
      summary: candidate.summary,
      type: candidate.type,
      reason: candidate.reason,
      evidence: candidate.evidence,
    })),
    isEmpty: false,
    emptyHint: "",
  };
}
