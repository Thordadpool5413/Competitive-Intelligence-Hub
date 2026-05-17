import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/diagnostics',
    message: 'Next.js API routes are active.',
    checkedAt: new Date().toISOString()
  });
}
