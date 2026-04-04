import OpenAI from "openai";

export interface WorkflowModel {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-reasoner";

class DeepSeekWorkflowModel implements WorkflowModel {
  private readonly client: OpenAI;

  private readonly model: string;

  constructor(apiKey: string, baseURL: string, model: string) {
    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
    this.model = model;
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new Error("DeepSeek 返回了空响应，无法继续推进工作流。");
    }

    return content.trim();
  }
}

export function createDeepSeekWorkflowModel(): WorkflowModel {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY，无法创建 DeepSeek 工作流模型。");
  }

  const baseURL = process.env.DEEPSEEK_BASE_URL ?? DEFAULT_DEEPSEEK_BASE_URL;

  return new DeepSeekWorkflowModel(apiKey, baseURL, DEFAULT_DEEPSEEK_MODEL);
}
