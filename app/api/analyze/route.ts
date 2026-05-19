import { NextRequest, NextResponse } from 'next/server';
import { crawlSite } from '../../../lib/crawler';
import { analyzeCompetitor, buildReport } from '../../../lib/analysis';
import { extractCompetitorIntelligence, isAIExtractionConfigured } from '../../../lib/ai-extractor';
import { saveReport } from '../../../lib/store';
import type { CompetitorAnalysis, CompetitorInput, CrawledPage } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AnalyzeResult = {
  analysis: CompetitorAnalysis;
  crawlError?: { url: string; error: string };
  aiError?: { url: string; error: string };
};

function cleanHost(hostname: string) {
  return hostname.toLowerCase().trim().replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '');
}

function blockedIPv4(host: string) {
  const parts = cleanHost(host).split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function blockedIPv6(host: string) {
  const value = cleanHost(host);
  if (!value.includes(':')) return false;
  if (value.includes('%')) return true;
  if (value === '::' || value === '::1' || value === '0:0:0:0:0:0:0:1') return true;
  if (/^fe[89ab]/i.test(value)) return true;
  if (/^f[cd]/i.test(value)) return true;
  const mapped = value.match(/(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  return mapped ? blockedIPv4(mapped) : false;
}

function toSafePublicHttpUrl(rawUrl: string): string | null {
  try {
    const candidate = rawUrl.trim();
    if (!candidate) return null;
    const parsed = new URL(candidate.startsWith('http://') || candidate.startsWith('https://') ? candidate : `https://${candidate}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    const host = cleanHost(parsed.hostname);
    if (!host || host === 'localhost') return null;
    if (host.endsWith('.local') || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home') || host.endsWith('.corp') || host.endsWith('.test')) return null;
    if (blockedIPv4(host) || blockedIPv6(host)) return null;
    parsed.hash = '';
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function getAllowedHostPatterns(): string[] {
  return (process.env.CRAWL_ALLOWED_HOSTS || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function matchesAllowedHost(hostname: string, patterns: string[]): boolean {
  const host = hostname.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      return host === suffix || host.endsWith(`.${suffix}`);
    }
    return host === pattern;
  });
}

function sanitizeCompetitorInput(item: CompetitorInput): CompetitorInput | null {
  const safeUrl = toSafePublicHttpUrl(item.url || '');
  if (!safeUrl) return null;

  const patterns = getAllowedHostPatterns();
  if (patterns.length) {
    const host = new URL(safeUrl).hostname.toLowerCase();
    if (!matchesAllowedHost(host, patterns)) return null;
  }

  return {
    ...item,
    url: safeUrl
  };
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

function analyzeConcurrency(shouldUseAI: boolean) {
  const fallback = shouldUseAI ? 5 : 8;
  const requested = Number(process.env.ANALYZE_CONCURRENCY || fallback);
  const ceiling = shouldUseAI ? 5 : 8;
  if (!Number.isFinite(requested)) return fallback;
  return Math.max(1, Math.min(ceiling, Math.floor(requested)));
}

function crawlMaxPagesLimit() {
  const requested = Number(process.env.CRAWL_MAX_PAGES_PER_SITE || 8);
  if (!Number.isFinite(requested)) return 8;
  return Math.max(4, Math.min(35, Math.floor(requested)));
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }));

  return results;
}

export async function GET() {
  const aiConfigured = isAIExtractionConfigured();
  return NextResponse.json({
    ok: true,
    route: '/api/analyze',
    aiConfigured,
    analyzeConcurrency: analyzeConcurrency(aiConfigured),
    crawlMaxPagesPerSiteLimit: crawlMaxPagesLimit(),
    urlValidation: 'enabled at request boundary and crawler boundary',
    message: aiConfigured
      ? 'Analyze API route is active with OpenAI extraction enabled and maximum speed parallel processing.'
      : 'Analyze API route is active. OpenAI extraction is not enabled because OPENAI_API_KEY is missing.',
    checkedAt: new Date().toISOString()
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { competitors?: CompetitorInput[]; maxPagesPerSite?: number; save?: boolean; useAI?: boolean };
    const rawCompetitors = (body.competitors || []).filter((item) => item.url?.trim()).slice(0, 25);
    const competitors = rawCompetitors
      .map(sanitizeCompetitorInput)
      .filter((item): item is CompetitorInput => Boolean(item));

    if (!competitors.length) {
      return NextResponse.json({
        error: 'Add at least one valid public competitor URL. Only public http or https URLs are allowed. Localhost, private IPs, link-local addresses, internal hostnames, and credentialed URLs are blocked.'
      }, { status: 400 });
    }

    const maxPagesLimit = crawlMaxPagesLimit();
    const requestedMaxPages = Number(body.maxPagesPerSite || maxPagesLimit);
    const maxPages = Math.min(Math.max(Number.isFinite(requestedMaxPages) ? requestedMaxPages : maxPagesLimit, 4), maxPagesLimit);
    const shouldUseAI = body.useAI !== false && isAIExtractionConfigured();
    const concurrency = analyzeConcurrency(shouldUseAI);

    const results = await mapWithConcurrency<CompetitorInput, AnalyzeResult>(competitors, concurrency, async (competitor, index) => {
      try {
        const pages = await crawlSite(competitor.url, maxPages);
        let analysis = analyzeCompetitor(competitor, pages, index);
        let aiError: AnalyzeResult['aiError'];

        if (shouldUseAI) {
          try {
            const aiExtraction = await extractCompetitorIntelligence(competitor, pages);
            if (aiExtraction) analysis = applyAIEnhancement(analysis, aiExtraction);
          } catch (error) {
            aiError = { url: competitor.url, error: error instanceof Error ? error.message : 'Unknown AI extraction error' };
          }
        }

        return { analysis, aiError };
      } catch (error) {
        const fallbackPage: CrawledPage = {
          url: competitor.url,
          title: 'Crawl limitation',
          text: '',
          excerpt: 'No readable public content could be extracted from this website.'
        };
        return {
          analysis: analyzeCompetitor(competitor, [fallbackPage], index),
          crawlError: { url: competitor.url, error: error instanceof Error ? error.message : 'Unknown crawl error' }
        };
      }
    });

    const analyses = results.map((item) => item.analysis);
    const crawlErrors = results.map((item) => item.crawlError).filter((item): item is NonNullable<AnalyzeResult['crawlError']> => Boolean(item));
    const aiErrors = results.map((item) => item.aiError).filter((item): item is NonNullable<AnalyzeResult['aiError']> => Boolean(item));
    const report = buildReport(analyses, [...crawlErrors, ...aiErrors.map((item) => ({ url: item.url, error: `AI extraction: ${item.error}` }))]);
    const aiSummaries = analyses.map((analysis) => analysis.aiExtraction?.leadershipSummary).filter(Boolean);
    const enhancedReport = {
      ...report,
      aiEnabled: shouldUseAI,
      aiModel: process.env.OPENAI_MODEL || 'gpt-4.1-nano',
      analysisConcurrency: concurrency,
      crawlMaxPagesPerSite: maxPages,
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
