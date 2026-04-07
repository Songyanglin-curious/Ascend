import { loadEnvFile } from "node:process";

loadEnvFile(".env.dev");

import "dotenv/config";

import { createConsoleConfirmationIo } from "./child-candidates/confirmation.js";
import { processCompletedNodeChildCandidates } from "./child-candidates/flow.js";
import { executeSceneNode } from "./node-tree/execute-scene-node.js";
import { createTreeService } from "./node-tree/tree-service.js";
import { createSqliteClient } from "./persistence/sqlite/client.js";
import { createSqliteChildCandidateEventStore } from "./persistence/sqlite/child-candidate-event-store.js";
import { createSqliteNodeStore } from "./persistence/sqlite/node-store.js";
import { ensureSqliteSchema } from "./persistence/sqlite/schema.js";
import { createSqliteTreeStore } from "./persistence/sqlite/tree-store.js";
import { createDeepSeekWorkflowModel } from "./workflows/advance/model.js";
import { executeAdvanceScene } from "./workflows/advance/scene.js";

const DATABASE_PATH = "D:\\db\\sqlite\\data\\ascend.db";

async function main(): Promise<void> {
  const model = createDeepSeekWorkflowModel();
  const sqliteClient = createSqliteClient(DATABASE_PATH);

  try {
    // 所有 store 创建前都先把数据库收敛到当前 schema 版本。
    ensureSqliteSchema(sqliteClient);

    const nodeStore = createSqliteNodeStore(sqliteClient);
    const treeStore = createSqliteTreeStore(sqliteClient);
    const treeService = createTreeService(nodeStore, treeStore);
    const candidateEventStore = createSqliteChildCandidateEventStore(sqliteClient);

    let rootNodeId = treeStore.getRootNodeId();

    if (rootNodeId === null) {
      const rootNode = sqliteClient.transaction(() => {
        const createdRootNode = nodeStore.createNode("advance", {});
        treeService.createRoot(createdRootNode.id);
        return createdRootNode;
      });

      rootNodeId = rootNode.id;

      await executeSceneNode(rootNode.id, {
        nodeStore,
        executors: {
          advance: executeAdvanceScene,
        },
        runtime: {
          model,
        },
      });

      const confirmationIo = createConsoleConfirmationIo();
      try {
        await processCompletedNodeChildCandidates({
          parentNodeId: rootNode.id,
          nodeStore,
          treeService,
          candidateEventStore,
          transaction: sqliteClient.transaction,
          model,
          io: confirmationIo,
        });
      } finally {
        await confirmationIo.close?.();
      }
    }

    console.log("=== nodes ===");
    console.dir(nodeStore.getAllNodes(), { depth: null });
    console.log("=== tree ===");
    console.dir(treeStore.getTreeSnapshot(), { depth: null });
  } finally {
    sqliteClient.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error("推进工作流运行失败:", error.message);
  } else {
    console.error("推进工作流运行失败:", error);
  }

  process.exit(1);
});
