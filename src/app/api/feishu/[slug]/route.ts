import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { handleFeishuWebhook, processMessage } from '@/services/feishu/bot';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json({ error: '飞书配置缺失' }, { status: 500 });
  }

  const rawBody = await request.text();
  const result = await handleFeishuWebhook(rawBody, request.headers, slug, {
    appId,
    appSecret,
    verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
    encryptKey: process.env.FEISHU_ENCRYPT_KEY,
  });

  if (result.type === 'error') {
    const status = result.error === '无效的 JSON' ? 400 : 401;
    return NextResponse.json({ error: result.error }, { status });
  }

  if (result.type === 'challenge') {
    return NextResponse.json(result.body);
  }

  // 用 after() 在返回响应后继续处理消息
  // Vercel 会保持函数存活直到 after() 完成
  if (result.message) {
    after(async () => {
      await processMessage(slug, result.message!, { appId, appSecret });
    });
  }

  return NextResponse.json({ code: 0 });
}
