import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { verifyWecomSignature, decryptWecomMessage } from '@/lib/wecom/crypto';
import { parseWecomXml } from '@/lib/wecom/parser';
import { processWecomMessage } from '@/services/wecom/bot';

/**
 * 企业微信自建应用回调入口
 * GET：服务器配置验证（保存回调配置时触发，解密 echostr 后原样返回明文）
 * POST：消息推送（密文 XML），验签 + 解密后立即回 success，
 *       实际处理放 after() 里 —— 化解微信 5 秒超时 + 重试机制
 */

function envConfig(): { token: string; aesKey: string } | null {
  const token = process.env.WECOM_TOKEN;
  const aesKey = process.env.WECOM_ENCODING_AES_KEY;
  if (!token || !aesKey) {
    return null;
  }
  return { token, aesKey };
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
    // 无法解析的消息体，回 success 避免重试
    console.error('[wecom] parse decrypted xml failed:', message.slice(0, 200));
    return new NextResponse('success');
  }

  // 先回 success 断掉微信的 5s 计时器，再用 after() 在响应后入库 + 应用消息回复
  after(async () => {
    try {
      await processWecomMessage(msg);
    } catch (err) {
      // after() 里的异常微信侧完全感知不到，不捕获就会静默丢失
      console.error('[wecom] process failed:', err);
    }
  });

  return new NextResponse('success');
}
