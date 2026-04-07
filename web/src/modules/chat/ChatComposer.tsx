import type { FormEvent, ReactElement } from "react";
import { useEffect, useState } from "react";

interface ChatComposerProps {
  nodeId: string | null;
  disabled: boolean;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (message: string) => void;
  onExit: () => void;
}

export function ChatComposer({
  nodeId,
  disabled,
  submitting,
  errorMessage,
  onSubmit,
  onExit,
}: ChatComposerProps): ReactElement {
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage("");
  }, [nodeId]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const normalized = message.trim();
    if (normalized === "" || disabled || submitting) {
      return;
    }

    onSubmit(normalized);
  }

  return (
    <form className="panel chat-composer" onSubmit={handleSubmit}>
      <div className="panel__header">
        <div>
          <div className="panel__eyebrow">Continue Workflow</div>
          <h2 className="panel__title">继续推进当前节点</h2>
        </div>
        <div className="panel__meta">{nodeId ? `节点 ${nodeId}` : "当前未选中节点"}</div>
      </div>
      <div className="chat-composer__body">
        <textarea
          className="chat-composer__input"
          value={message}
          disabled={disabled || submitting}
          placeholder={disabled ? "当前节点不可继续推进。" : "输入你希望继续推进的问题或补充信息..."}
          onChange={(event) => setMessage(event.target.value)}
        />
        {errorMessage ? <div className="chat-composer__error">{errorMessage}</div> : null}
        <div className="chat-composer__footer">
          <div className="chat-composer__hint">发送普通消息继续推进；点击“结束本轮”可直接结束当前节点推进。</div>
          <div className="chat-composer__actions">
            <button
              className="chat-composer__exit"
              type="button"
              disabled={disabled || submitting}
              onClick={onExit}
            >
              {submitting ? "处理中..." : "结束本轮"}
            </button>
            <button
              className="chat-composer__submit"
              type="submit"
              disabled={disabled || submitting || message.trim() === ""}
            >
              {submitting ? "发送中..." : "发送并推进"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
