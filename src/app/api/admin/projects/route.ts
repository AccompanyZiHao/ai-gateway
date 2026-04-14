import { NextResponse } from 'next/server';

// 项目管理 API（预留，后续扩展）
export async function GET() {
  return NextResponse.json(
    { error: '管理后台 API 待开发' },
    { status: 501 },
  );
}
