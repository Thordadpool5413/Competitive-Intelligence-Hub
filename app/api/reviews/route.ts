import { NextRequest, NextResponse } from 'next/server';
import { readStore, saveReview } from '../../../lib/store';
import type { ReviewStatus } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const store = await readStore();
  return NextResponse.json({ reviews: store.reviews });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    findingId?: string;
    status?: ReviewStatus | 'Needs edits';
    note?: string;
    reviewer?: string;
  };

  if (!body.findingId || !body.status) {
    return NextResponse.json({ error: 'findingId and status are required.' }, { status: 400 });
  }

  const review = await saveReview({
    findingId: body.findingId,
    status: body.status,
    note: body.note,
    reviewer: body.reviewer || 'User'
  });

  return NextResponse.json({ review });
}
