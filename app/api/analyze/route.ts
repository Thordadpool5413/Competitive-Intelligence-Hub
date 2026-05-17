import { NextRequest, NextResponse } from 'next/server';
import { crawlSite } from '@/lib/crawler';
import { analyzeCompetitor, buildReport } from '@/lib/analysis';
import { saveReport } from '@/lib/store';
import type { CompetitorInput, CrawledPage } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/analyze',
    message: 'Analyze API route is active. Use POST with competitor URLs to run analysis.',
    checkedAt: new Date().toISOString()
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { competitors?: CompetitorInput[]; maxPagesPerSite?: number; save?: boolean };
    const competitors = (body.competitors || [])
      .filter((item) => item.url?.trim())
      .slice(0, 25)
      .map((item) => ({ ...item, url: normalizeUrl(item.url.trim()) }));

    if (!competitors.length) {
      return NextResponse.json({ error: 'Add at least one competitor URL.' }, { status: 400 });
    }

    const maxPages = Math.min(Math.max(body.maxPagesPerSite || Number(process.env.CRAWL_MAX_PAGES_PER_SITE || 24), 4), 35);
    const analyses = [];
    const crawlErrors: { url: string; error: string }[] = [];

    for (let i = 0; i < competitors.length; i += 1) {
      const competitor = competitors[i];
      try {
        const pages = await crawlSite(competitor.url, maxPages);
        analyses.push(analyzeCompetitor(competitor, pages, i));
      } catch (error) {
        crawlErrors.push({ url: competitor.url, error: error instanceof Error ? error.message : 'Unknown crawl error' });
        const fallbackPage: CrawledPage = {
          url: competitor.url,
          title: 'Crawl limitation',
          text: '',
          excerpt: 'No readable public content could be extracted from this website.'
        };
        analyses.push(analyzeCompetitor(competitor, [fallbackPage], i));
      }
    }

    const report = buildReport(analyses, crawlErrors);
    if (body.save !== false) await saveReport(report);
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown analysis error' }, { status: 500 });
  }
}
