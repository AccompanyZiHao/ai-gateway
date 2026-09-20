import { NextRequest, NextResponse } from 'next/server';
import {
  verifyWecomSignature,
  decryptWecomMessage,
  encryptWecomMessage,
  computeWecomSignature,
} from '@/lib/wecom/crypto';
import { parseWecomXml } from '@/lib/wecom/parser';
import { processWecomMessage } from '@/services/wecom/bot';

/**
 * 企业微信自建应用回调入口（被动回复版）
 * GET：服务器配置验证（保存回调配置时触发，解密 echostr 后原样返回明文）
 * POST：消息推送（密文 XML），验签 + 解密 → 同步处理（写坚果云）→
 *       把回复加密后直接写进响应体（5 秒窗口内），不调企业微信 API，
 *       因此不依赖可信 IP 白名单（Vercel 出口 IP 不固定）
 */

function envConfig(): { token: string; aesKey: string } | null {
  const token = process.env.WECOM_TOKEN;
  const aesKey = process.env.WECOM_ENCODING_AES_KEY;
  if (!token || !aesKey) {
    return null;
  }
  return { token, aesKey };
}

/**
 * 组装被动回复的完整密文响应体（企业微信要求的固定 XML 壳）
 */
function buildEncryptedReply(
  replyText: string,
  msg: { fromUserName: string; toUserName: string },
  config: { token: string; aesKey: string },
): string {
  const createTime = Math.floor(Date.now() / 1000);
  const nonce = Math.random().toString(36).slice(2, 12);

  // 回复明文 XML：To/From 与收到的消息互换（发给谁 / 以谁的身份）
  const plainXml = `<xml>
<ToUserName><![CDATA[${msg.fromUserName}]]></ToUserName>
<FromUserName><![CDATA[${msg.toUserName}]]></FromUserName>
<CreateTime>${createTime}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${replyText}]]></Content>
</xml>`;

  const encrypted = encryptWecomMessage(plainXml, config.aesKey, msg.toUserName);
  const msgSignature = computeWecomSignature(config.token, String(createTime), nonce, encrypted);

  return `<xml>
<Encrypt><![CDATA[${encrypted}]]></Encrypt>
<MsgSignature><![CDATA[${msgSignature}]]></MsgSignature>
<TimeStamp>${createTime}</TimeStamp>
<Nonce><![CDATA[${nonce}]]></Nonce>
</xml>`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const msgSignature = searchParams.get('msg_signature');
  const timestamp = searchParams.get('timestamp');
  const nonce = searchParams.get('nonce');
  const echostr = searchParams.get('echostr');

  const config = envConfig();
  if (!config || !echostr || !timestamp || !nonce || !msgSignature) {
    return new NextResponse('forbidden', { status: 403 });
  }

  // 验签通过后解密 echostr，企业微信要求返回解密后的明文
  if (
    !verifyWecomSignature(config.token, timestamp, nonce, echostr, msgSignature)
  ) {
    console.error('[wecom] verify GET failed: signature mismatch');
    return new NextResponse('forbidden', { status: 403 });
  }
  const { message } = decryptWecomMessage(echostr, config.aesKey);
  return new NextResponse(message, {
    headers: { 'Content-Type': 'text/plain' },
  });
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const msgSignature = searchParams.get('msg_signature');
  const timestamp = searchParams.get('timestamp');
  const nonce = searchParams.get('nonce');

  const config = envConfig();
  if (!config || !msgSignature || !timestamp || !nonce) {
    return new NextResponse('forbidden', { status: 403 });
  }

  const rawBody = await request.text();
  // 回调体是 <xml><Encrypt>密文</Encrypt></xml>，先取出密文再验签解密
  const encryptMatch = rawBody.match(
    /<Encrypt>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/Encrypt>/,
  );
  if (!encryptMatch) {
    console.error('[wecom] POST body has no Encrypt field');
    return new NextResponse('success');
  }
  const encrypted = encryptMatch[1];

  if (
    !verifyWecomSignature(config.token, timestamp, nonce, encrypted, msgSignature)
  ) {
    console.error('[wecom] verify POST failed: signature mismatch');
    return new NextResponse('forbidden', { status: 403 });
  }

  const { message } = decryptWecomMessage(encrypted, config.aesKey);
  const msg = parseWecomXml(message);
  if (!msg) {
    // 无法解析的消息体，回空串避免重试
    console.error('[wecom] parse decrypted xml failed:', message.slice(0, 200));
    return new NextResponse('');
  }

  // 同步处理 + 被动回复；留 4.2s 上限防超时（超 5s 企业微信会断开并重试）
  // 超时兜底返回空串（企业微信视为不回复，不触发重试风暴）
  const TIMEOUT_MS = 4200;
  const reply = await Promise.race([
    processWecomMessage(msg),
    new Promise<string | null>((resolve) =>
      setTimeout(() => resolve(null), TIMEOUT_MS),
    ),
  ]);

  if (reply === null) {
    // 处理超时：后台任务可能仍在跑（入库或许成功），只是不回消息了
    console.error('[wecom] process timeout, reply skipped');
    return new NextResponse('');
  }

  const body = buildEncryptedReply(reply, msg, config);
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}
