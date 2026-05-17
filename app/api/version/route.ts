import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'Competitive Intelligence Hub',
    version: 'stable-clean-next-server-2026-05-17-01',
    message: 'If this route returns this exact version, Hostinger is running the cleaned GitHub main build through Next.js.',
    expectedServer: 'server.js clean Next server',
    checkedAt: new Date().toISOString()
  });
}
