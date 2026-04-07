import type { BaseMessage } from "@langchain/core/messages";

import type { PromptMessage } from "../workflows/advance/model.js";

export const CHILD_CANDIDATE_EXTRACTOR_SYSTEM_PROMPT = `角色：Child Candidate Extractor。

你的唯一任务：
从当前节点的对话记录中，提取“值得成为子节点的候选分支”。

你不是在总结，不是在扩展，也不是在给方案。
你只做一件事：把对话里的潜在分支结构化。

提取原则：
1. 只提“可独立推进”的分支。
2. 优先提取三类：
- 新问题
- 分支方向
- 关键约束
3. 禁止污染：
- 不要改写原意
- 不要补充你自己的想法
- 不要创造新方向
4. 去重与合并：
- 语义重复的合并为一个
5. 控制数量：
- 默认 3 到 5 个
- 不足就少给，不强凑

输出要求：
- 只能输出合法 JSON 数组
- 不要输出 markdown 代码块
- 不要输出数组以外的解释文字
- 每项必须包含：
  - title
  - summary
  - type
  - reason
  - evidence
- type 只允许：question | direction | constraint`;

function getMessageRoleLabel(type: string): string {
    if (type === "human") {
        return "user";
    }

    if (type === "ai") {
        return "assistant";
    }

    return type;
}

/**
 * 创建提示消息对象
 * 
 * 该函数用于创建一个包含角色和内容的提示消息对象，
 * 用于构建发送给模型的消息列表。
 * @param {PromptMessage["role"]} role - 消息的角色，如 "system"、"user" 等
 * @param {string} content - 消息的内容
 * @returns {PromptMessage} 包含角色和内容的提示消息对象
 * @example
 */
function createPromptMessage(role: PromptMessage["role"], content: string): PromptMessage {
    return { role, content };
}

export function formatRawMessagesForExtraction(rawMessages: BaseMessage[]): string {
    return rawMessages
        .map((message, index) => {
            const content = typeof message.text === "string" ? message.text : String(message.content);
            return `${index + 1}. ${getMessageRoleLabel(message.type)}: ${content}`;
        })
        .join("\n");
}

export function buildChildCandidatePromptMessages(
    rawMessages: BaseMessage[],
): PromptMessage[] {
    return [
        createPromptMessage("system", CHILD_CANDIDATE_EXTRACTOR_SYSTEM_PROMPT),
        createPromptMessage(
            "user",
            `当前节点的原始对话记录如下：\n${formatRawMessagesForExtraction(rawMessages)}`,
        ),
    ];
}