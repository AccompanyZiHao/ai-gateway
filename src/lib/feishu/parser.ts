import type { FeishuEventRequest, ParsedMessage } from './types';
export type { ParsedMessage } from './types';

export function parseFeishuMessage(body: FeishuEventRequest): ParsedMessage | null {
  const event = body.event;
  const message = event?.message;
  const sender = event?.sender?.sender_id;

  if (!message?.chat_id || !message?.message_id) {
    return null;
  }

  const text = parseContent(message.content || '{}', message.message_type);
  if (!text) {
    return null;
  }

  return {
    chatId: message.chat_id,
    messageId: message.message_id,
    userId: sender?.open_id || sender?.user_id || 'unknown',
    text,
  };
}

function parseContent(content: string, messageType?: string): string {
  try {
    const parsed = JSON.parse(content);
    // 文本消息直接取 text 字段
    if (messageType === 'text' && parsed.text) {
      return parsed.text.trim();
    }
    // 富文本消息取纯文本
    if (messageType === 'post' && parsed.title) {
      return parsed.title;
    }
    return '';
  } catch {
    return '';
  }
}
