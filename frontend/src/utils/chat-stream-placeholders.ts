export type StreamMessageVariant = 'user' | 'assistant' | 'error' | 'success' | 'progress' | string | undefined;

export type StreamDeltaMessage = {
  content: string;
  variant?: StreamMessageVariant;
};

export type StreamDeltaPatch = {
  content: string;
  variant?: StreamMessageVariant;
};

const defaultProgressPlaceholders = ['正在生成回答…', '正在基于课程资料回答…'] as const;

export function isChatStreamPlaceholderMessage(
  message: StreamDeltaMessage,
  extraPlaceholders: readonly string[] = [],
): boolean {
  if (message.variant !== 'progress') return false;
  const content = message.content.trim();
  return [...defaultProgressPlaceholders, ...extraPlaceholders].some((placeholder) => content === placeholder);
}

export function applyChatStreamDelta(
  message: StreamDeltaMessage,
  delta: string,
  extraPlaceholders: readonly string[] = [],
): StreamDeltaPatch {
  if (isChatStreamPlaceholderMessage(message, extraPlaceholders)) {
    return {
      variant: 'assistant',
      content: delta,
    };
  }

  return {
    variant: message.variant,
    content: `${message.content}${delta}`,
  };
}
