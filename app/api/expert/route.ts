import { NextRequest, NextResponse } from 'next/server';
import { readStore } from '../../../lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const reportId = url.searchParams.get('reportId');
  const store = await readStore();
  const report = reportId ? store.reports.find((item) => item.id === reportId) : store.reports[0];

  if (!report) {
    return NextResponse.json({
      ok: true,
      route: '/api/expert',
      message: 'No stored report found yet. Run a competitive scan first to generate an expert brief.',
      expertBrief: null
    });
  }

  if (!report.expertBrief) {
    return NextResponse.json({
      ok: true,
      route: '/api/expert',
      reportId: report.id,
      generatedAt: report.generatedAt,
      message: 'This report was generated before the foremost expert engine was added. Run a fresh scan to create an expert brief.',
      expertBrief: null
    });
  }

  return NextResponse.json({
    ok: true,
    route: '/api/expert',
    reportId: report.id,
    generatedAt: report.generatedAt,
    expertBrief: report.expertBrief
  });
}
