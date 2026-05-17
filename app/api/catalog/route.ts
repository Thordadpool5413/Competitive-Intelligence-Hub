import { NextRequest, NextResponse } from 'next/server';
import { andwellCatalog } from '../../../lib/andwell';
import { readStore, saveCatalogOverride } from '../../../lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const store = await readStore();
  const overrides = new Map(store.catalogOverrides.map((override) => [override.serviceLine, override]));
  const catalog = andwellCatalog.map((service) => ({
    ...service,
    override: overrides.get(service.serviceLine) || null
  }));
  return NextResponse.json({ catalog, overrides: store.catalogOverrides });
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    serviceLine?: string;
    description?: string;
    safeLanguage?: string;
    avoid?: string;
    internalNotes?: string;
    approvalStatus?: 'Draft' | 'Needs review' | 'Approved' | 'Retired' | 'Do not show to sales';
  };

  if (!body.serviceLine) {
    return NextResponse.json({ error: 'serviceLine is required.' }, { status: 400 });
  }

  const override = await saveCatalogOverride({
    serviceLine: body.serviceLine,
    description: body.description,
    safeLanguage: body.safeLanguage,
    avoid: body.avoid,
    internalNotes: body.internalNotes,
    approvalStatus: body.approvalStatus || 'Needs review'
  });

  return NextResponse.json({ override });
}
