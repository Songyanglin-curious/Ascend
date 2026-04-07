import type { NodeId, NodeTree, TreeRelation, TreeStore } from "../../node-tree/types.js";
import type { SqliteClient } from "./client.js";

interface TreeRelationRow {
  node_id: string;
  parent_id: string | null;
  position: number;
}

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

export function createSqliteTreeStore(client: SqliteClient): TreeStore {
  const getRootStatement = client.db.prepare(
    `SELECT root_node_id FROM tree_state WHERE singleton_id = 1`,
  );
  const setRootStatement = client.db.prepare(
    `UPDATE tree_state SET root_node_id = ? WHERE singleton_id = 1`,
  );
  const insertRelationStatement = client.db.prepare(`
    INSERT INTO tree_relations (node_id, parent_id, position)
    VALUES (?, ?, ?)
  `);
  const selectRelationStatement = client.db.prepare(
    `SELECT node_id, parent_id, position FROM tree_relations WHERE node_id = ?`,
  );
  const selectAllRelationsStatement = client.db.prepare(
    `SELECT node_id, parent_id, position FROM tree_relations ORDER BY parent_id ASC, position ASC, node_id ASC`,
  );
  const selectChildIdsStatement = client.db.prepare(
    `SELECT node_id FROM tree_relations WHERE parent_id = ? ORDER BY position ASC`,
  );
  const getMaxPositionStatement = client.db.prepare(
    `SELECT MAX(position) AS max_position FROM tree_relations WHERE parent_id = ?`,
  );

  function getRootNodeId(): NodeId | null {
    const row = getRootStatement.get() as { root_node_id: string | null } | undefined;
    return row?.root_node_id ?? null;
  }

  function getNextChildPosition(parentId: NodeId): number {
    const row = getMaxPositionStatement.get(parentId) as { max_position: number | null } | undefined;
    return row?.max_position === null || row?.max_position === undefined ? 0 : row.max_position + 1;
  }

  function buildTreeSnapshot(): NodeTree {
    const relations: Record<NodeId, TreeRelation> = {};
    const rows = selectAllRelationsStatement.all() as TreeRelationRow[];

    for (const row of rows) {
      if (!relations[row.node_id]) {
        relations[row.node_id] = {
          parentId: row.parent_id,
          childrenIds: [],
        };
      }
    }

    for (const row of rows) {
      if (row.parent_id === null) {
        continue;
      }

      if (!relations[row.parent_id]) {
        relations[row.parent_id] = {
          parentId: null,
          childrenIds: [],
        };
      }

      relations[row.parent_id]!.childrenIds.push(row.node_id);
    }

    return {
      rootNodeId: getRootNodeId(),
      relations,
    };
  }

  return {
    createEmptyTree(): NodeTree {
      client.db.prepare(`DELETE FROM tree_relations`).run();
      client.db.prepare(`UPDATE tree_state SET root_node_id = NULL WHERE singleton_id = 1`).run();

      return {
        rootNodeId: null,
        relations: {},
      };
    },

    getRootNodeId(): NodeId | null {
      return getRootNodeId();
    },

    getRelation(nodeId: NodeId): TreeRelation | null {
      const row = selectRelationStatement.get(nodeId) as TreeRelationRow | undefined;
      if (!row) {
        return null;
      }

      return {
        parentId: row.parent_id,
        childrenIds: this.getChildIds(nodeId),
      };
    },

    getTreeSnapshot(): NodeTree {
      return cloneTree(buildTreeSnapshot());
    },

    setRoot(nodeId: NodeId): void {
      if (getRootNodeId() !== null) {
        throw new Error("当前树已存在 root node，不能重复创建根节点。");
      }

      setRootStatement.run(nodeId);
      insertRelationStatement.run(nodeId, null, 0);
    },

    attachChild(parentId: NodeId, childId: NodeId): void {
      const parentRelation = selectRelationStatement.get(parentId) as TreeRelationRow | undefined;
      if (!parentRelation) {
        throw new Error(`父节点尚未挂入树中: ${parentId}`);
      }

      const childRelation = selectRelationStatement.get(childId) as TreeRelationRow | undefined;
      if (childRelation) {
        throw new Error(`子节点已存在树关系，不能重复挂载: ${childId}`);
      }

      insertRelationStatement.run(childId, parentId, getNextChildPosition(parentId));
    },

    getChildIds(parentId: NodeId): NodeId[] {
      return (selectChildIdsStatement.all(parentId) as Array<{ node_id: string }>).map(
        (row) => row.node_id,
      );
    },
  };
}
