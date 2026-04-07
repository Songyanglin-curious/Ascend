import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import type { ChildCandidate, ChildCandidateSelectionResult } from "./types.js";

export interface ConfirmationIO {
  readLine(prompt: string): Promise<string>;
  writeLine(text: string): void | Promise<void>;
  close?(): void | Promise<void>;
}

export function createConsoleConfirmationIo(): ConfirmationIO {
  const readline = createInterface({ input, output });

  return {
    readLine(prompt) {
      return readline.question(prompt);
    },
    writeLine(text) {
      console.log(text);
    },
    close() {
      readline.close();
    },
  };
}

export function formatChildCandidateList(candidates: ChildCandidate[]): string {
  if (candidates.length === 0) {
    return "没有可确认的候选子节点。";
  }

  return [
    "=== child candidates ===",
    ...candidates.map(
      (candidate, index) =>
        `${index + 1}. [${candidate.type}] ${candidate.title}\nsummary: ${candidate.summary}\nreason: ${candidate.reason}\nevidence: ${candidate.evidence}`,
    ),
    "输入多个编号确认添加，例如 1,3 或 1 3；输入 0 或 none 拒绝全部。",
  ].join("\n");
}

function parseSelectionIndexes(rawInput: string, max: number): number[] {
  const normalized = rawInput.trim().toLowerCase();

  if (normalized === "0" || normalized === "none") {
    return [];
  }

  const parts = normalized.split(/[\s,]+/).filter((part) => part !== "");
  if (parts.length === 0) {
    throw new Error("输入无效，请输入候选编号组合，或输入 0 / none。");
  }

  const indexes: number[] = [];
  const seen = new Set<number>();

  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      throw new Error("输入无效，请输入候选编号组合，或输入 0 / none。");
    }

    const numeric = Number(part);
    if (!Number.isInteger(numeric) || numeric < 1 || numeric > max) {
      throw new Error("输入无效，请输入候选编号组合，或输入 0 / none。");
    }

    const index = numeric - 1;
    if (seen.has(index)) {
      continue;
    }

    seen.add(index);
    indexes.push(index);
  }

  return indexes;
}

export async function confirmChildCandidates(
  candidates: ChildCandidate[],
  io: ConfirmationIO,
): Promise<ChildCandidateSelectionResult> {
  if (candidates.length === 0) {
    return [];
  }

  await io.writeLine(formatChildCandidateList(candidates));

  while (true) {
    const rawInput = await io.readLine("child-candidate> ");

    try {
      const selectedIndexes = parseSelectionIndexes(rawInput, candidates.length);
      return selectedIndexes.map((index) => candidates[index]!).filter(Boolean);
    } catch (error) {
      await io.writeLine(error instanceof Error ? error.message : String(error));
    }
  }
}
