import type {
  AdvanceNodePayload,
  AdvanceNodeResult,
  CandidateReadModelDto,
  ConfirmCandidatesPayload,
  ConfirmCandidatesResult,
  PageReadModel,
} from "./types";

interface ApiErrorPayload {
  error?: string;
  message?: string;
}

function buildApiErrorMessage(payload: ApiErrorPayload, fallback: string): string {
  if (typeof payload.message === "string" && payload.message.trim() !== "") {
    return payload.message;
  }

  return fallback;
}

export async function fetchPageReadModel(signal?: AbortSignal): Promise<PageReadModel> {
  const response = await fetch("/api/page-read-model", {
    method: "GET",
    signal,
  });

  if (!response.ok) {
    let payload: ApiErrorPayload = {};

    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = {};
    }

    throw new Error(buildApiErrorMessage(payload, `页面读取失败: HTTP ${response.status}`));
  }

  return (await response.json()) as PageReadModel;
}

export async function fetchNodeCandidates(
  parentNodeId: string,
  signal?: AbortSignal,
): Promise<CandidateReadModelDto> {
  const response = await fetch(
    `/api/node-candidates?parentNodeId=${encodeURIComponent(parentNodeId)}`,
    {
      method: "GET",
      signal,
    },
  );

  if (!response.ok) {
    let payload: ApiErrorPayload = {};

    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      payload = {};
    }

    throw new Error(buildApiErrorMessage(payload, `节点候选读取失败: HTTP ${response.status}`));
  }

  return (await response.json()) as CandidateReadModelDto;
}

export async function confirmNodeCandidates(
  payload: ConfirmCandidatesPayload,
): Promise<ConfirmCandidatesResult> {
  const response = await fetch("/api/node-candidates/confirm", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorPayload: ApiErrorPayload = {};

    try {
      errorPayload = (await response.json()) as ApiErrorPayload;
    } catch {
      errorPayload = {};
    }

    throw new Error(
      buildApiErrorMessage(errorPayload, `节点候选确认失败: HTTP ${response.status}`),
    );
  }

  return (await response.json()) as ConfirmCandidatesResult;
}

export async function advanceNode(payload: AdvanceNodePayload): Promise<AdvanceNodeResult> {
  const response = await fetch("/api/node-advance", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorPayload: ApiErrorPayload = {};

    try {
      errorPayload = (await response.json()) as ApiErrorPayload;
    } catch {
      errorPayload = {};
    }

    throw new Error(buildApiErrorMessage(errorPayload, `节点推进失败: HTTP ${response.status}`));
  }

  return (await response.json()) as AdvanceNodeResult;
}

export async function exitNodeAdvance(nodeId: string): Promise<AdvanceNodeResult> {
  const response = await fetch("/api/node-advance/exit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nodeId }),
  });

  if (!response.ok) {
    let errorPayload: ApiErrorPayload = {};

    try {
      errorPayload = (await response.json()) as ApiErrorPayload;
    } catch {
      errorPayload = {};
    }

    throw new Error(buildApiErrorMessage(errorPayload, `结束节点推进失败: HTTP ${response.status}`));
  }

  return (await response.json()) as AdvanceNodeResult;
}
