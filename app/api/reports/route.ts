import { NextRequest, NextResponse } from 'next/server';
import { getReport, readStore } from '../../../lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (id) {
    const report = await getReport(id);
    if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
    return NextResponse.json({ report });
  }
  const store = await readStore();
  return NextResponse.json({
    reports: store.reports.map((report) => ({
      id: report.id,
      generatedAt: report.generatedAt,
      competitorsAnalyzed: report.competitorsAnalyzed,
      pagesReviewed: report.pagesReviewed,
      serviceLinesMapped: report.serviceLinesMapped,
      subservicesMapped: report.subservicesMapped,
      matchedServiceFindings: report.matchedServiceFindings,
      potentialAndwellAdvantages: report.potentialAndwellAdvantages,
      humanReviewItems: report.humanReviewItems,
      competitors: report.analyses.map((analysis) => analysis.name),
      executiveSummary: report.executiveSummary
    }))
  });
}
