import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { verifyWechatSignature } from '@/lib/wechat/verify';
import { parseWechatXml } from '@/lib/wechat/parser';
import { processWechatMessage } from '@/services/wechat/bot';

/**
 * 微信测试号回调入口
 * GET：服务器配置验证（微信后台填 URL 时触发，原样返回 echostr）
 * POST：消息推送（text/voice/link/image 等），验签后立即回 success，
 *       实际处理放 after() 里 —— 化解微信 5 秒超时 + 重试机制
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const signature = searchParams.get('signature');
  const timestamp = searchParams.get('timestamp');
  const nonce = searchParams.get('nonce');
  const echostr = searchParams.get('echostr');
  const token = process.env.WECHAT_TOKEN ?? '';

  if (verifyWechatSignature(signature, timestamp, nonce, token)) {
    // 验证通过必须原样返回 echostr，微信以此确认服务器持有 Token
    return new NextResponse(echostr ?? '', {
      headers: { 'Content-Type': 'text/plain' },
    });
  }
  return new NextResponse('forbidden', { status: 403 });
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const signature = searchParams.get('signature');
  const timestamp = searchParams.get('timestamp');
  const nonce = searchParams.get('nonce');
  const token = process.env.WECHAT_TOKEN ?? '';

  // 验签失败直接拒绝，不进入处理流程
  if (!verifyWechatSignature(signature, timestamp, nonce, token)) {
    return new NextResponse('forbidden', { status: 403 });
  }

  const rawBody = await request.text();
  const msg = parseWechatXml(rawBody);
  if (!msg) {
    // 无法解析的消息体，回 success 避免微信重试
    return new NextResponse('success');
  }

  // 先回 success 断掉微信的 5s 计时器，再用 after() 在响应后入库 + 客服回复
  after(async () => {
    try {
      await processWechatMessage(msg);
    } catch (err) {
      // after() 里的异常微信侧完全感知不到，不捕获就会静默丢失
      console.error('[wechat] process failed:', err);
    }
  });

  return new NextResponse('success');
}
