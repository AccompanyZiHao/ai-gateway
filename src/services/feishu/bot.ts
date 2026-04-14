import { verifySignature, isChallengeRequest } from '@/lib/feishu/verify';
import { parseFeishuMessage, type ParsedMessage } from '@/lib/feishu/parser';
import { getTenantToken, replyMessage } from '@/lib/feishu/client';
import { chat } from '@/lib/ai/claude';
import type { FeishuEventRequest } from '@/lib/feishu/types';

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  verificationToken?: string;
  encryptKey?: string;
}

export interface FeishuWebhookResult {
  type: 'challenge' | 'reply' | 'ignored' | 'error';
  body?: Record<string, unknown>;
  error?: string;
}

/**
 * 处理飞书 Webhook 请求的完整业务逻辑
 */
export async function handleFeishuWebhook(
  rawBody: string,
  headers: Headers,
  slug: string,
  config: FeishuConfig,
): Promise<FeishuWebhookResult> {
  let body: FeishuEventRequest;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { type: 'error', error: '无效的 JSON' };
  }

  // 1. 处理 url_verification challenge
  if (isChallengeRequest(body as Record<string, unknown>)) {
    return { type: 'challenge', body: { challenge: body.challenge } };
  }

  // 2. 验证 token
  if (body.token && config.verificationToken && body.token !== config.verificationToken) {
    return { type: 'error', error: 'token 验证失败' };
  }

  // 3. 验证签名
  if (config.encryptKey) {
    const signature = headers.get('x-lark-signature');
    const timestamp = headers.get('x-lark-timestamp');
    if (!verifySignature(signature, timestamp, rawBody, config.encryptKey)) {
      return { type: 'error', error: '签名验证失败' };
    }
  }

  // 4. 只处理消息事件
  if (body.header?.event_type !== 'im.message.receive_v1') {
    return { type: 'ignored' };
  }

  // 5. 解析消息
  const message = parseFeishuMessage(body);
  if (!message) {
    return { type: 'ignored' };
  }

  // 6. 异步处理消息（不阻塞响应）
  processMessage(slug, message, config).catch((err) => {
    console.error(`[${slug}] 处理消息失败:`, err);
  });

  return { type: 'reply' };
}

async function processMessage(
  slug: string,
  message: ParsedMessage,
  config: FeishuConfig,
) {
  try {
    const reply = await chat(message.text);
    const token = await getTenantToken(config.appId, config.appSecret);
    await replyMessage(token, message.messageId, reply);
  } catch (err) {
    console.error(`[${slug}] Claude 调用失败:`, err);
    try {
      const token = await getTenantToken(config.appId, config.appSecret);
      await replyMessage(token, message.messageId, '抱歉，处理消息时出错了，请稍后再试。');
    } catch {
      // 静默失败
    }
  }
}
