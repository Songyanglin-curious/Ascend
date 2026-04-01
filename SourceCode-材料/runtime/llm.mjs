import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 这里封装的是当前仓库里的 DeepSeek 草稿生成逻辑。
 *
 * 当前实现的定位不是“完整运行代理”，而是：
 * - 为 step 生成一个最小 draft
 * - 为 finish 生成一个最小收尾 draft
 *
 * 它提供给模型的上下文也比较薄：
 * - 当前 project 的简化信息
 * - 当前 node 快照
 * - workspace 当前入口
 * - 最近最多几条 stepRecords
 *
 * 因此它能支撑 demo 级连续推进，但还不足以代表 docs 中更完整的树级运行语境。
 */
const runtimeDir = path.dirname(fileURLToPath(import.meta.url));
const llmConfigPath = path.join(runtimeDir, ".ascend-llm.config.json");

/** `DEFAULT_LLM_CONFIG` 定义运行时使用的默认 DeepSeek 配置。 */
const DEFAULT_LLM_CONFIG = {
  provider: "deepseek",
  baseURL: "https://api.deepseek.com",
  model: "deepseek-chat",
  apiKeyEnv: "DEEPSEEK_API_KEY",
  apiKey: "",
};

/** 读取一个 JSON 文件；如果文件不存在则返回 `null`。 */
function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

/** 把可能为空的文本输入标准化为去空白后的字符串。 */
function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

/** 返回运行时 LLM 配置文件路径。 */
export function getLlmConfigPath() {
  return llmConfigPath;
}

/** 创建默认的内存态 LLM 配置对象。 */
export function createDefaultLlmConfig() {
  return { ...DEFAULT_LLM_CONFIG };
}

/** 读取持久化 LLM 配置，并与默认配置合并。 */
export function readLlmConfig() {
  const rawConfig = readJsonFile(llmConfigPath);
  if (!rawConfig) {
    return createDefaultLlmConfig();
  }

  return {
    ...DEFAULT_LLM_CONFIG,
    ...rawConfig,
  };
}

/** 优先从环境变量解析 DeepSeek API Key，其次再读配置文件。 */
export function resolveDeepSeekApiKey(config) {
  const envKey = normalizeText(process.env[config.apiKeyEnv ?? DEFAULT_LLM_CONFIG.apiKeyEnv] ?? "");
  if (envKey) {
    return envKey;
  }

  const fileKey = normalizeText(config.apiKey);
  return fileKey || null;
}

/** 确保基础 URL 以斜杠结尾，避免接口拼接出错。 */
function ensureTrailingSlash(baseURL) {
  const normalized = normalizeText(baseURL) || DEFAULT_LLM_CONFIG.baseURL;
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

/** 解析一个 JSON 字符串；它也可能被包在代码块里。 */
function parseJsonCandidate(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("DeepSeek 返回了空响应。");
  }

  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    return JSON.parse(withoutFence);
  }

  return JSON.parse(trimmed);
}

/** 校验给定字段是否为非空字符串。 */
function ensureNonEmptyString(value, fieldName) {
  if (typeof value !== "string") {
    throw new Error(`DeepSeek 返回的草稿无效：${fieldName} 必须是非空字符串。`);
  }

  const text = value.trim();
  if (!text) {
    throw new Error(`DeepSeek 返回的草稿无效：${fieldName} 不能为空。`);
  }

  return text;
}

/** 校验可选字段：要么缺失，要么为非空字符串。 */
function ensureOptionalString(value, fieldName) {
  if (typeof value === "undefined") {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(`DeepSeek 返回的草稿无效：${fieldName} 必须是字符串。`);
  }

  const text = value.trim();
  return text.length > 0 ? text : undefined;
}

/** 校验 AI step 草稿的解析结果是否符合预期。 */
export function validateAiStepDraft(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DeepSeek 的响应必须是 JSON 对象。");
  }

  return {
    input: ensureNonEmptyString(parsed.input, "input"),
    output: ensureNonEmptyString(parsed.output, "output"),
    change: ensureNonEmptyString(parsed.change, "change"),
    next: ensureNonEmptyString(parsed.next, "next"),
    summary: ensureOptionalString(parsed.summary, "summary"),
    conclusion: ensureOptionalString(parsed.conclusion, "conclusion"),
  };
}

/** 校验 AI finish 草稿的解析结果是否符合预期。 */
export function validateAiFinishDraft(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("DeepSeek 的响应必须是 JSON 对象。");
  }

  return {
    summary: ensureNonEmptyString(parsed.summary, "summary"),
    conclusion: ensureNonEmptyString(parsed.conclusion, "conclusion"),
  };
}

/** 构造向 DeepSeek 请求 step 草稿时使用的消息列表。 */
function buildAiStepMessages(context) {
  const { project, node, workspace, recentStepRecords } = context;

  return [
    {
      role: "system",
      content: [
        "你要为当前聚焦节点生成一条最小 step 草稿。",
        "只返回 JSON，不要输出多余解释。",
        "JSON 字段名必须保留为 input、output、change、next。",
        "可以额外包含 summary 和 conclusion，但它们是可选字段。",
        "不要用 Markdown 代码块包裹 JSON。",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          // 当前只把项目和节点压成一个简化快照发给模型，
          // 没有把整棵树、父子路径或完整多轮原始记录一起提供出去。
          project: {
            id: project.id,
            title: project.title,
            goal: project.goal,
            currentNodeId: project.currentNodeId,
          },
          workspace: {
            id: workspace.id,
            currentProjectId: workspace.currentProjectId,
            currentEntry: workspace.currentEntry,
          },
          node: {
            id: node.id,
            scenario: node.scenario,
            title: node.title,
            raw: node.raw,
            summary: node.summary,
            conclusion: node.conclusion,
            next: node.next,
          },
          recentStepRecords,
        },
        null,
        2,
      ),
    },
  ];
}

/** 构造向 DeepSeek 请求 finish 草稿时使用的消息列表。 */
function buildAiFinishMessages(context) {
  const { project, node, workspace, recentStepRecords } = context;

  return [
    {
      role: "system",
      content: [
        "你要为当前即将结束的节点生成最小收尾草稿。",
        "只返回 JSON，不要输出多余解释。",
        "JSON 字段名必须保留为 summary、conclusion。",
        "两个字段都必须是非空字符串。",
        "不要用 Markdown 代码块包裹 JSON。",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          project: {
            id: project.id,
            title: project.title,
            goal: project.goal,
            currentNodeId: project.currentNodeId,
          },
          workspace: {
            id: workspace.id,
            currentProjectId: workspace.currentProjectId,
            currentEntry: workspace.currentEntry,
          },
          node: {
            id: node.id,
            scenario: node.scenario,
            title: node.title,
            raw: node.raw,
            summary: node.summary,
            conclusion: node.conclusion,
            next: node.next,
            status: node.status,
          },
          recentStepRecords,
        },
        null,
        2,
      ),
    },
  ];
}

/** 调用 DeepSeek chat-completions 接口，并返回 assistant 的文本内容。 */
async function callDeepSeekChatCompletion(messages) {
  const config = readLlmConfig();
  if ((config.provider ?? DEFAULT_LLM_CONFIG.provider) !== "deepseek") {
    throw new Error(`不支持的 LLM 提供方：${config.provider}`);
  }

  const apiKey = resolveDeepSeekApiKey(config);
  if (!apiKey) {
    throw new Error(`缺少 DeepSeek API key。请设置 ${config.apiKeyEnv ?? DEFAULT_LLM_CONFIG.apiKeyEnv}，或者在 ${llmConfigPath} 里填写 apiKey。`);
  }

  const endpoint = new URL("chat/completions", ensureTrailingSlash(config.baseURL)).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model ?? DEFAULT_LLM_CONFIG.model,
      messages,
      temperature: 0.2,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`DeepSeek 请求失败：${response.status} ${response.statusText}。${responseText}`);
  }

  let parsedResponse;
  try {
    parsedResponse = JSON.parse(responseText);
  } catch (error) {
    throw new Error(`DeepSeek 返回了非 JSON 响应：${error instanceof Error ? error.message : String(error)}`);
  }

  const content = parsedResponse?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("DeepSeek 响应中没有 message.content 字段。");
  }

  return content;
}

/** 根据当前项目上下文生成并校验 AI step 草稿。 */
export async function generateDeepSeekAiStepDraft(context) {
  const content = await callDeepSeekChatCompletion(buildAiStepMessages(context));
  return validateAiStepDraft(parseJsonCandidate(content));
}

/** 根据当前项目上下文生成并校验 AI finish 草稿。 */
export async function generateDeepSeekFinishDraft(context) {
  const content = await callDeepSeekChatCompletion(buildAiFinishMessages(context));
  return validateAiFinishDraft(parseJsonCandidate(content));
}
