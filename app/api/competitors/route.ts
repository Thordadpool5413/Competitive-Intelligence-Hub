import { NextRequest, NextResponse } from 'next/server';
import { readStore, saveCompetitors } from '../../../lib/store';
import type { CompetitorInput } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

export async function GET() {
  const store = await readStore();
  return NextResponse.json({ competitors: store.competitors });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { competitors?: CompetitorInput[] };
  const competitors = (body.competitors || [])
    .filter((competitor) => competitor.url?.trim())
    .map((competitor) => ({ ...competitor, url: normalizeUrl(competitor.url.trim()) }));
  const store = await saveCompetitors(competitors);
  return NextResponse.json({ competitors: store.competitors });
}
