import { loadEnvFile } from "node:process";

loadEnvFile(".env.dev");
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";

import { loadNodeCandidates } from "../read-model/candidate-service.js";
import { loadPageReadModel } from "../read-model/page-service.js";
import { createDeepSeekWorkflowModel, type WorkflowModel } from "../workflows/advance/model.js";
import { confirmNodeCandidatesAction } from "./candidate-actions.js";
import { advanceNodeAction, exitNodeAdvanceAction } from "./node-advance-actions.js";

const DEFAULT_DATABASE_PATH = process.env.ASCEND_DB_PATH ?? "D:\\db\\sqlite\\data\\ascend.db";
const DEFAULT_PORT = Number(process.env.ASCEND_WEB_API_PORT ?? "4318");
const DEFAULT_HOST = process.env.ASCEND_WEB_API_HOST ?? "127.0.0.1";

export interface ReadOnlyWebApiServerOptions {
    databasePath: string;
    port?: number;
    host?: string;
    model?: WorkflowModel;
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    });
    response.end(JSON.stringify(payload));
}

function buildErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }

    const text = Buffer.concat(chunks).toString("utf8").trim();
    if (text === "") {
        return {};
    }

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(
            `页面候选确认请求体不是合法 JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

function ensureParentNodeId(value: unknown): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error("缺少有效的 parentNodeId。");
    }

    return value.trim();
}

function ensureSelectedCandidateIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        throw new Error("selectedCandidateIds 必须是字符串数组。");
    }

    return value.map((item, index) => {
        if (typeof item !== "string" || item.trim() === "") {
            throw new Error(`selectedCandidateIds[${index}] 不是有效字符串。`);
        }

        return item.trim();
    });
}

function ensureNodeId(value: unknown): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error("缺少有效的 nodeId。");
    }

    return value.trim();
}

function ensureAdvanceMessage(value: unknown): string {
    if (typeof value !== "string") {
        throw new Error("message 必须是字符串。");
    }

    const normalized = value.trim();
    if (normalized === "") {
        throw new Error("message 不能为空。");
    }

    return normalized;
}

export function handlePageReadModelRequest(
    response: ServerResponse,
    databasePath: string,
): void {
    try {
        const model = loadPageReadModel(databasePath);
        writeJson(response, 200, model);
    } catch (error: unknown) {
        writeJson(response, 500, {
            error: "PAGE_READ_MODEL_LOAD_FAILED",
            message: buildErrorMessage(error),
        });
    }
}

export async function handleNodeCandidatesRequest(
    response: ServerResponse,
    databasePath: string,
    parentNodeId: string,
    model: WorkflowModel,
): Promise<void> {
    try {
        const readModel = await loadNodeCandidates({
            databasePath,
            parentNodeId,
            model,
        });
        writeJson(response, 200, readModel);
    } catch (error: unknown) {
        writeJson(response, 500, {
            error: "NODE_CANDIDATES_LOAD_FAILED",
            message: buildErrorMessage(error),
        });
    }
}

export async function handleConfirmNodeCandidatesRequest(
    request: IncomingMessage,
    response: ServerResponse,
    databasePath: string,
    model: WorkflowModel,
): Promise<void> {
    try {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const parentNodeId = ensureParentNodeId(body.parentNodeId);
        const selectedCandidateIds = ensureSelectedCandidateIds(body.selectedCandidateIds);

        const result = await confirmNodeCandidatesAction({
            databasePath,
            parentNodeId,
            selectedCandidateIds,
            model,
        });
        writeJson(response, 200, result);
    } catch (error: unknown) {
        writeJson(response, 500, {
            error: "NODE_CANDIDATES_CONFIRM_FAILED",
            message: buildErrorMessage(error),
        });
    }
}

export async function handleAdvanceNodeRequest(
    request: IncomingMessage,
    response: ServerResponse,
    databasePath: string,
    model: WorkflowModel,
): Promise<void> {
    try {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const nodeId = ensureNodeId(body.nodeId);
        const message = ensureAdvanceMessage(body.message);

        const result = await advanceNodeAction({
            databasePath,
            nodeId,
            message,
            model,
        });
        writeJson(response, 200, result);
    } catch (error: unknown) {
        writeJson(response, 500, {
            error: "NODE_ADVANCE_FAILED",
            message: buildErrorMessage(error),
        });
    }
}

export async function handleExitNodeAdvanceRequest(
    request: IncomingMessage,
    response: ServerResponse,
    databasePath: string,
): Promise<void> {
    try {
        const body = (await readJsonBody(request)) as Record<string, unknown>;
        const nodeId = ensureNodeId(body.nodeId);

        const result = exitNodeAdvanceAction({
            databasePath,
            nodeId,
        });
        writeJson(response, 200, result);
    } catch (error: unknown) {
        writeJson(response, 500, {
            error: "NODE_ADVANCE_EXIT_FAILED",
            message: buildErrorMessage(error),
        });
    }
}

async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
    databasePath: string,
    model: WorkflowModel,
): Promise<void> {
    if (request.method === "OPTIONS") {
        writeJson(response, 204, null);
        return;
    }

    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

    if (request.method === "GET" && requestUrl.pathname === "/api/page-read-model") {
        handlePageReadModelRequest(response, databasePath);
        return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/node-candidates") {
        try {
            const parentNodeId = ensureParentNodeId(requestUrl.searchParams.get("parentNodeId"));
            await handleNodeCandidatesRequest(response, databasePath, parentNodeId, model);
        } catch (error: unknown) {
            writeJson(response, 400, {
                error: "INVALID_NODE_CANDIDATES_REQUEST",
                message: buildErrorMessage(error),
            });
        }
        return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/node-candidates/confirm") {
        await handleConfirmNodeCandidatesRequest(request, response, databasePath, model);
        return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/node-advance") {
        await handleAdvanceNodeRequest(request, response, databasePath, model);
        return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/node-advance/exit") {
        await handleExitNodeAdvanceRequest(request, response, databasePath);
        return;
    }

    writeJson(response, 404, {
        error: "NOT_FOUND",
        message: "页面 API 未找到对应路由。",
    });
}

export function startReadOnlyWebApiServer(options: ReadOnlyWebApiServerOptions): Server {
    const host = options.host ?? DEFAULT_HOST;
    const port = options.port ?? DEFAULT_PORT;
    const model = options.model ?? createDeepSeekWorkflowModel();
    const server = createServer((request, response) => {
        void handleRequest(request, response, options.databasePath, model);
    });

    server.listen(port, host, () => {
        console.log(`页面 API 已启动: http://${host}:${port}`);
    });

    return server;
}

function isMainModule(): boolean {
    const entry = process.argv[1];
    if (!entry) {
        return false;
    }

    return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
    startReadOnlyWebApiServer({
        databasePath: DEFAULT_DATABASE_PATH,
    });
}
