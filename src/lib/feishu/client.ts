// 飞书 API 客户端封装

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

// 简易 token 缓存，避免频繁请求
let tokenCache: { token: string; expireAt: number } | null = null;

export async function getTenantToken(
  appId: string,
  appSecret: string,
): Promise<string> {
  // 如果缓存未过期直接返回
  if (tokenCache && tokenCache.expireAt > Date.now()) {
    return tokenCache.token;
  }

  const res = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });

  const data = await res.json();
  if (data.code !== 0) {
    throw new Error(`获取 tenant_access_token 失败: ${data.msg}`);
  }

  const token = data.tenant_access_token as string;
  const expire = data.expire as number;

  tokenCache = {
    token,
    expireAt: Date.now() + (expire - 60) * 1000, // 提前 60 秒过期
  };

  return token;
}

export async function replyMessage(
  token: string,
  messageId: string,
  text: string,
): Promise<void> {
  await fetch(`${FEISHU_API_BASE}/im/v1/messages/${messageId}/reply`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });
}

export async function sendMessage(
  token: string,
  chatId: string,
  text: string,
): Promise<void> {
  await fetch(`${FEISHU_API_BASE}/im/v1/messages?receive_id_type=chat_id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      receive_id: chatId,
      msg_type: 'text',
      content: JSON.stringify({ text }),
    }),
  });
}
