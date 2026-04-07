import type {
  NodeId,
  NodeStore,
  SceneNode,
  TreeService,
  TreeStore,
} from "./types.js";

export function createTreeService(
  nodeStore: NodeStore,
  treeStore: TreeStore,
): TreeService {
  return {
    createRoot(nodeId: NodeId): void {
      const node = nodeStore.getNodeById(nodeId);
      if (!node) {
        throw new Error(`未找到要设为根节点的 node: ${nodeId}`);
      }

      treeStore.setRoot(nodeId);
    },

    createChild(parentId: NodeId, childId: NodeId): void {
      if (treeStore.getRootNodeId() === null) {
        throw new Error("当前树还没有 root node，不能创建子节点关系。");
      }

      const parentNode = nodeStore.getNodeById(parentId);
      if (!parentNode) {
        throw new Error(`未找到父节点: ${parentId}`);
      }

      const childNode = nodeStore.getNodeById(childId);
      if (!childNode) {
        throw new Error(`未找到子节点: ${childId}`);
      }

      if (!treeStore.getRelation(parentId)) {
        throw new Error(`父节点尚未挂入树中: ${parentId}`);
      }

      if (treeStore.getRelation(childId)) {
        throw new Error(`子节点已存在树关系，不能重复挂载: ${childId}`);
      }

      treeStore.attachChild(parentId, childId);
    },

    getChildren(parentId: NodeId): SceneNode[] {
      const parentNode = nodeStore.getNodeById(parentId);
      if (!parentNode) {
        throw new Error(`未找到父节点: ${parentId}`);
      }

      if (!treeStore.getRelation(parentId)) {
        throw new Error(`父节点尚未挂入树中: ${parentId}`);
      }

      return treeStore.getChildIds(parentId).map((childId) => {
        const childNode = nodeStore.getNodeById(childId);
        if (!childNode) {
          throw new Error(`树关系引用了不存在的子节点: ${childId}`);
        }

        return childNode;
      });
    },
  };
}
