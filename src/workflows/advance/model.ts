import OpenAI from "openai";

export type PromptRole = "system" | "user" | "assistant";

export interface PromptMessage {
  role: PromptRole;
  content: string;
}

export interface WorkflowModel {
  complete(messages: PromptMessage[]): Promise<string>;
}

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-reasoner";

class DeepSeekWorkflowModel implements WorkflowModel {
  private readonly client: OpenAI;

  private readonly model: string;

  constructor(apiKey: string, baseURL: string, model: string) {
    // 这里仍然使用 OpenAI 官方 SDK。
    // 原因是 DeepSeek 兼容 OpenAI 风格的 chat completions 接口，
    // 我们只需要改 baseURL 和 model，就能复用同一套调用方式。
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
    this.model = model;
  }

  /**
   * 调用 DeepSeek API 完成消息式 chat 生成
   *
   * 这里把上层统一约束在 PromptMessage[]，
   * 既保住 chat message 的 role 结构，
   * 又不把 OpenAI SDK 的 provider 类型暴露到 workflow 其他层。
   */
  async complete(messages: PromptMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    });

    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("DeepSeek 返回了空响应，无法继续推进工作流。");
    }

    return content.trim();
  }
}

/**
 * 创建 DeepSeek 工作流模型实例
 * 
 * 该函数从环境变量中获取 DeepSeek API 配置，创建并返回一个 DeepSeekWorkflowModel 实例。
 * 如果缺少必要的 API key，会直接抛出错误，避免在运行过程中才发现环境问题。
 * 
 * @returns {WorkflowModel} DeepSeek 工作流模型实例
 * @throws {Error} 如果缺少 DEEPSEEK_API_KEY 环境变量，则抛出错误
 * @example
 * $env:DEEPSEEK_API_KEY = "你的key"
 */
export function createDeepSeekWorkflowModel(): WorkflowModel {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    // 缺 key 直接失败，避免跑到中途才发现是环境问题。
    throw new Error("缺少 DEEPSEEK_API_KEY，无法创建 DeepSeek 工作流模型。");
  }

  const baseURL = process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL;

  return new DeepSeekWorkflowModel(apiKey, baseURL, DEFAULT_DEEPSEEK_MODEL);
}
