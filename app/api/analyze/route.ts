import { NextRequest, NextResponse } from 'next/server';
import { crawlSite } from '../../../lib/crawler';
import { analyzeCompetitor, buildReport } from '../../../lib/analysis';
import { extractCompetitorIntelligence, isAIExtractionConfigured } from '../../../lib/ai-extractor';
import { saveReport } from '../../../lib/store';
import type { CompetitorAnalysis, CompetitorInput, CrawledPage } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

function applyAIEnhancement(analysis: CompetitorAnalysis, aiExtraction: NonNullable<CompetitorAnalysis['aiExtraction']>): CompetitorAnalysis {
  const findings = analysis.findings.map((finding) => {
    const aiService = aiExtraction.serviceLineDepth.find((item) => item.serviceLine.toLowerCase() === finding.serviceLine.toLowerCase());
    if (!aiService) return finding;
    return {
      ...finding,
      aiInterpretation: `${finding.aiInterpretation} AI extraction: ${aiService.summary}`,
      andwellAdvantage: aiService.andwellAdvantages.length ? aiService.andwellAdvantages.join(' ') : finding.andwellAdvantage,
      competitorAdvantage: aiService.competitorAdvantages.length ? aiService.competitorAdvantages.join(' ') : finding.competitorAdvantage,
      safeSalesWording: aiExtraction.safeSalesLanguage[0] || finding.safeSalesWording,
      avoidSaying: aiExtraction.doNotSayLanguage[0] || finding.avoidSaying,
      subserviceDepthScore: Math.max(finding.subserviceDepthScore, aiService.depthScore)
    };
  });

  const subserviceFindings = analysis.subserviceFindings.map((finding) => {
    const aiSub = aiExtraction.subserviceDepth.find((item) => item.serviceLine.toLowerCase() === finding.serviceLine.toLowerCase() && item.subservice.toLowerCase() === finding.subservice.toLowerCase());
    if (!aiSub) return finding;
    return {
      ...finding,
      competitorStatus: aiSub.status,
      confidence: aiSub.confidence,
      evidenceExcerpt: aiSub.evidenceExcerpt || finding.evidenceExcerpt,
      sourceUrl: aiSub.sourceUrl || finding.sourceUrl,
      aiInterpretation: `${finding.aiInterpretation} AI extraction reviewed this subservice and classified it as ${aiSub.status}.`,
      safeSalesWording: aiSub.safeSalesLanguage || finding.safeSalesWording,
      avoidSaying: aiSub.doNotSayLanguage || finding.avoidSaying
    };
  });

  return {
    ...analysis,
    findings,
    subserviceFindings,
    aiExtraction,
    aiEnhanced: true
  };
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/analyze',
    aiConfigured: isAIExtractionConfigured(),
    message: isAIExtractionConfigured()
      ? 'Analyze API route is active with OpenAI extraction enabled.'
      : 'Analyze API route is active. OpenAI extraction is not enabled because OPENAI_API_KEY is missing.',
    checkedAt: new Date().toISOString()
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { competitors?: CompetitorInput[]; maxPagesPerSite?: number; save?: boolean; useAI?: boolean };
    const competitors = (body.competitors || [])
      .filter((item) => item.url?.trim())
      .slice(0, 25)
      .map((item) => ({ ...item, url: normalizeUrl(item.url.trim()) }));

    if (!competitors.length) {
      return NextResponse.json({ error: 'Add at least one competitor URL.' }, { status: 400 });
    }

    const maxPages = Math.min(Math.max(body.maxPagesPerSite || Number(process.env.CRAWL_MAX_PAGES_PER_SITE || 24), 4), 35);
    const analyses: CompetitorAnalysis[] = [];
    const crawlErrors: { url: string; error: string }[] = [];
    const aiErrors: { url: string; error: string }[] = [];
    const shouldUseAI = body.useAI !== false && isAIExtractionConfigured();

    for (let i = 0; i < competitors.length; i += 1) {
      const competitor = competitors[i];
      try {
        const pages = await crawlSite(competitor.url, maxPages);
        let analysis = analyzeCompetitor(competitor, pages, i);

        if (shouldUseAI) {
          try {
            const aiExtraction = await extractCompetitorIntelligence(competitor, pages);
            if (aiExtraction) analysis = applyAIEnhancement(analysis, aiExtraction);
          } catch (error) {
            aiErrors.push({ url: competitor.url, error: error instanceof Error ? error.message : 'Unknown AI extraction error' });
          }
        }

        analyses.push(analysis);
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

    const report = buildReport(analyses, [...crawlErrors, ...aiErrors.map((item) => ({ url: item.url, error: `AI extraction: ${item.error}` }))]);
    const aiSummaries = analyses.map((analysis) => analysis.aiExtraction?.leadershipSummary).filter(Boolean);
    const enhancedReport = {
      ...report,
      aiEnabled: shouldUseAI,
      aiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      aiLeadershipSummary: aiSummaries.length ? aiSummaries.join('\n\n') : undefined,
      executiveSummary: aiSummaries.length
        ? `${report.executiveSummary}\n\nAI leadership summary: ${aiSummaries.join(' ')}`
        : report.executiveSummary
    };

    if (body.save !== false) await saveReport(enhancedReport);
    return NextResponse.json(enhancedReport);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown analysis error' }, { status: 500 });
  }
}
