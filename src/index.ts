import "dotenv/config";

import { runAdvanceCli } from "./workflows/advance/cli.js";
import { buildAdvanceGraph } from "./workflows/advance/graph.js";
import { createDeepSeekWorkflowModel } from "./workflows/advance/model.js";

async function main(): Promise<void> {
  const model = createDeepSeekWorkflowModel();
  const graph = buildAdvanceGraph(model);

  await runAdvanceCli(graph);
}

main().catch((error: unknown) => {
  if (error instanceof Error) {
    console.error("推进工作流运行失败:", error.message);
  } else {
    console.error("推进工作流运行失败:", error);
  }

  process.exit(1);
});
