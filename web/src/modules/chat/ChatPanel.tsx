import type { ReactElement } from "react";
import type { ThreadMessage } from "@assistant-ui/core";
import {
  MessagePrimitiveParts,
  ReadonlyThreadProvider,
  ThreadPrimitiveMessages,
} from "@assistant-ui/core/react";

import type { ChatMessageViewModel, ChatThreadViewModel } from "../data/types";

interface ChatPanelProps {
  thread: ChatThreadViewModel;
}

const messagePartComponents = {
  Text: ({ text }: { text: string }) => <span>{text}</span>,
};

function toAssistantMessage(message: ChatMessageViewModel, index: number): ThreadMessage {
  const createdAt = new Date(index * 1000);
  const content = [{ type: "text" as const, text: message.content }];

  if (message.role === "user") {
    return {
      id: message.id,
      role: "user",
      createdAt,
      content,
      attachments: [],
      metadata: {
        custom: {},
      },
    };
  }

  return {
    id: message.id,
    role: "assistant",
    createdAt,
    content,
    status: {
      type: "complete",
      reason: "stop",
    },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: {},
    },
  };
}

export function ChatPanel({ thread }: ChatPanelProps): ReactElement {
  const messages = thread.messages.map(toAssistantMessage);

  return (
    <div className="panel chat-panel">
      <div className="panel__header">
        <div>
          <div className="panel__eyebrow">Conversation</div>
          <h2 className="panel__title">{thread.title}</h2>
        </div>
        <div className="panel__meta">{thread.subtitle ?? "只读聊天历史"}</div>
      </div>
      {messages.length === 0 ? (
        <div className="panel__empty">{thread.emptyHint ?? "当前节点没有聊天历史。"}</div>
      ) : (
        <ReadonlyThreadProvider messages={messages}>
          <div className="chat-thread">
            <div className="chat-thread__viewport">
              <ThreadPrimitiveMessages>
                {({ message }) => (
                  <div className={`chat-message chat-message--${message.role}`}>
                    <div className="chat-message__role">
                      {message.role === "user" ? "User" : "Assistant"}
                    </div>
                    <div className="chat-message__bubble">
                      <MessagePrimitiveParts components={messagePartComponents} />
                    </div>
                  </div>
                )}
              </ThreadPrimitiveMessages>
            </div>
          </div>
        </ReadonlyThreadProvider>
      )}
    </div>
  );
}
