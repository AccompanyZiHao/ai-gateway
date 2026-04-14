import { NextRequest, NextResponse } from 'next/server';
import { handleFeishuWebhook } from '@/services/feishu/bot';

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

  return NextResponse.json({ code: 0 });
}
