import { randomUUID } from "node:crypto";

import type { BaseMessage } from "@langchain/core/messages";

import type { WorkflowModel } from "../workflows/advance/model.js";
import { buildChildCandidatePromptMessages } from "./prompts.js";
import type {
  ChildCandidate,
  ChildCandidateRawItem,
  ChildCandidateType,
} from "./types.js";

function isChildCandidateType(value: unknown): value is ChildCandidateType {
  return value === "question" || value === "direction" || value === "constraint";
}

function ensureNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new Error(`候选子节点字段 ${fieldName} 不是字符串。`);
  }

  const normalized = value.trim();
  if (normalized === "") {
    throw new Error(`候选子节点字段 ${fieldName} 不能为空。`);
  }

  return normalized;
}

export function validateChildCandidateRawItem(value: unknown): ChildCandidateRawItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("候选子节点项不是合法对象。");
  }

  const item = value as Record<string, unknown>;
  const type = item.type;
  if (!isChildCandidateType(type)) {
    throw new Error(`候选子节点 type 非法: ${String(type)}`);
  }

  return {
    title: ensureNonEmptyString(item.title, "title"),
    summary: ensureNonEmptyString(item.summary, "summary"),
    type,
    reason: ensureNonEmptyString(item.reason, "reason"),
    evidence: ensureNonEmptyString(item.evidence, "evidence"),
  };
}

export function parseChildCandidateJson(text: string): ChildCandidateRawItem[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `候选子节点提取结果不是合法 JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("候选子节点提取结果必须是 JSON 数组。");
  }

  return parsed.map((item) => validateChildCandidateRawItem(item));
}

export function normalizeChildCandidates(
  parentNodeId: string,
  rawItems: ChildCandidateRawItem[],
): ChildCandidate[] {
  return rawItems.map((item) => ({
    candidateId: randomUUID(),
    parentNodeId,
    title: item.title,
    summary: item.summary,
    type: item.type,
    reason: item.reason,
    evidence: item.evidence,
  }));
}

export async function extractChildCandidates(params: {
  parentNodeId: string;
  rawMessages: BaseMessage[];
  model: WorkflowModel;
}): Promise<ChildCandidate[]> {
  const output = await params.model.complete(
    buildChildCandidatePromptMessages(params.rawMessages),
  );
  const rawItems = parseChildCandidateJson(output);

  return normalizeChildCandidates(params.parentNodeId, rawItems);
}
