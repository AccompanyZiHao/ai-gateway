import { NextResponse } from 'next/server';

// Web 聊天接口（预留，后续扩展）
export async function POST() {
  return NextResponse.json(
    { error: 'Web 聊天功能待开发' },
    { status: 501 },
  );
}
