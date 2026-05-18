import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'Competitive Intelligence Hub',
    version: 'hostinger-auto-rebuild-2026-05-18-02',
    message: 'If this route returns this exact version, Hostinger is running the GitHub main build through the self-healing Node.js Next server.',
    expectedServer: 'server.js Hostinger Node server',
    checkedAt: new Date().toISOString()
  });
}
