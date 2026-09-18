import crypto from 'crypto';

/**
 * 验证微信测试号消息签名
 * 微信算法：sha1(token + timestamp + nonce 字典序排序后拼接)
 * 与飞书的 HMAC 不同，微信用的是简单 sha1，两套算法并存
 */
export function verifyWechatSignature(
  signature: string | null,
  timestamp: string | null,
  nonce: string | null,
  token: string,
): boolean {
  if (!signature || !timestamp || !nonce || !token) {
    return false;
  }

  // 字典序排序后拼接，再 sha1
  const sorted = [token, timestamp, nonce].sort().join('');
  const hash = crypto.createHash('sha1').update(sorted).digest('hex');

  return hash === signature;
}
