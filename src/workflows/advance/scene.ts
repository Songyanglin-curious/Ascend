import { runAdvanceCli, type CliIO } from "./cli.js";
import { buildAdvanceGraph } from "./graph.js";
import type { WorkflowModel } from "./model.js";
import type { AdvanceSceneRawResult } from "./types.js";
export type { AdvanceSceneRawResult } from "./types.js";

export type AdvanceSceneStartInput = Record<string, never>;

export interface AdvanceSceneRuntime {
  model: WorkflowModel;
  io?: CliIO;
}

export async function executeAdvanceScene(
  _input: AdvanceSceneStartInput,
  runtime: AdvanceSceneRuntime,
): Promise<AdvanceSceneRawResult> {
  const graph = buildAdvanceGraph(runtime.model);

  return runAdvanceCli(graph, runtime.io);
}
