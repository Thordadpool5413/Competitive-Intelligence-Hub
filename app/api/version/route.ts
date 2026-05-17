import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'Competitive Intelligence Hub',
    version: '2026-05-17-json-guard-storage-cleanup',
    message: 'If this route returns JSON, Hostinger is serving the latest Next.js API routes from GitHub main.',
    checkedAt: new Date().toISOString()
  });
}
