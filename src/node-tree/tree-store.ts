import type { NodeId, NodeTree, TreeRelation, TreeStore } from "./types.js";

function cloneRelation(relation: TreeRelation): TreeRelation {
  return {
    parentId: relation.parentId,
    childrenIds: [...relation.childrenIds],
  };
}

function cloneTree(tree: NodeTree): NodeTree {
  const relations: Record<NodeId, TreeRelation> = {};

  for (const [nodeId, relation] of Object.entries(tree.relations)) {
    relations[nodeId] = cloneRelation(relation);
  }

  return {
    rootNodeId: tree.rootNodeId,
    relations,
  };
}

export function createEmptyTree(): NodeTree {
  return {
    rootNodeId: null,
    relations: {},
  };
}

export function createInMemoryTreeStore(
  initialTree: NodeTree = createEmptyTree(),
): TreeStore {
  let tree = cloneTree(initialTree);

  return {
    createEmptyTree(): NodeTree {
      tree = createEmptyTree();
      return cloneTree(tree);
    },

    getRootNodeId(): NodeId | null {
      return tree.rootNodeId;
    },

    getRelation(nodeId: NodeId): TreeRelation | null {
      const relation = tree.relations[nodeId];
      return relation ? cloneRelation(relation) : null;
    },

    getTreeSnapshot(): NodeTree {
      return cloneTree(tree);
    },

    setRoot(nodeId: NodeId): void {
      if (tree.rootNodeId !== null) {
        throw new Error("当前树已存在 root node，不能重复创建根节点。");
      }

      tree.rootNodeId = nodeId;
      tree.relations[nodeId] = {
        parentId: null,
        childrenIds: [],
      };
    },

    attachChild(parentId: NodeId, childId: NodeId): void {
      const parentRelation = tree.relations[parentId];
      if (!parentRelation) {
        throw new Error(`父节点尚未挂入树中: ${parentId}`);
      }

      if (tree.relations[childId]) {
        throw new Error(`子节点已存在树关系，不能重复挂载: ${childId}`);
      }

      tree.relations[parentId] = {
        parentId: parentRelation.parentId,
        childrenIds: [...parentRelation.childrenIds, childId],
      };
      tree.relations[childId] = {
        parentId,
        childrenIds: [],
      };
    },

    getChildIds(parentId: NodeId): NodeId[] {
      const relation = tree.relations[parentId];
      return relation ? [...relation.childrenIds] : [];
    },
  };
}
