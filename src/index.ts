import { loadEnvFile } from "node:process";
loadEnvFile(".env.dev");

import "dotenv/config";

import { runAdvanceCli } from "./workflows/advance/cli.js";
import { buildAdvanceGraph } from "./workflows/advance/graph.js";
import { createDeepSeekWorkflowModel } from "./workflows/advance/model.js";
async function main(): Promise<void> {
    // 入口只做装配：创建模型、创建图、启动 CLI。
    // 真正的业务判断都下沉到 workflow 目录，避免入口文件承担状态逻辑。
    const model = createDeepSeekWorkflowModel();
    const graph = buildAdvanceGraph(model);

    await runAdvanceCli(graph);
}

main().catch((error: unknown) => {
    // 进程级退出只放在最顶层，方便测试时直接调用底层模块而不被中途终止。
    if (error instanceof Error) {
        console.error("推进工作流运行失败:", error.message);
    } else {
        console.error("推进工作流运行失败:", error);
    }

    process.exit(1);
});
