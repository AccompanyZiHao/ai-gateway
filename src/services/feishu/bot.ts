import { verifySignature, isChallengeRequest } from '@/lib/feishu/verify';
import { parseFeishuMessage, type ParsedMessage } from '@/lib/feishu/parser';
import { getLLMProvider } from '@/lib/ai';
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
  /** 解析后的消息，供路由层用 after() 异步处理 */
  message?: ParsedMessage;
}

/**
 * 处理飞书 Webhook 请求的验证和解析（不处理回复）
 * 回复逻辑由路由层通过 after() 执行
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

  return { type: 'reply', message };
}

/**
 * 处理消息：调用 LLM → 回复飞书
 * 由路由层在 after() 中调用
 */
export async function processMessage(
  slug: string,
  message: ParsedMessage,
  config: FeishuConfig,
) {
  const { getTenantToken, replyMessage } = await import('@/lib/feishu/client');

  try {
    const provider = getLLMProvider();
    const reply = await provider.chat(
      [{ role: 'user', content: message.text }],
    );
    const token = await getTenantToken(config.appId, config.appSecret);
    await replyMessage(token, message.messageId, reply);
  } catch (err) {
    console.error(`[${slug}] LLM 调用失败:`, err);
    try {
      const token = await getTenantToken(config.appId, config.appSecret);
      await replyMessage(token, message.messageId, '抱歉，处理消息时出错了，请稍后再试。');
    } catch {
      // 静默失败
    }
  }
}
