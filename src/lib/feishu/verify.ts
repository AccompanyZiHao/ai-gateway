import crypto from 'crypto';

/**
 * 验证飞书签名
 */
export function verifySignature(
  signature: string | null,
  timestamp: string | null,
  body: string,
  signingKey: string,
): boolean {
  if (!signature || !timestamp || !signingKey) {
    return false;
  }

  const content = timestamp + '\n' + signingKey;
  const hash = crypto
    .createHmac('sha256', signingKey)
    .update(content)
    .digest()
    .toString('base64');

  return hash === signature;
}

/**
 * 处理飞书 url_verification challenge
 */
export function isChallengeRequest(body: Record<string, unknown>): boolean {
  return body.type === 'url_verification' && typeof body.challenge === 'string';
}
