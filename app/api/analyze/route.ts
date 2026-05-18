import { NextRequest, NextResponse } from 'next/server';
import { crawlSite } from '../../../lib/crawler';
import { analyzeCompetitor, buildReport } from '../../../lib/analysis';
import { extractCompetitorIntelligence, isAIExtractionConfigured } from '../../../lib/ai-extractor';
import { saveReport } from '../../../lib/store';
import type { CompetitorAnalysis, CompetitorInput, CrawledPage } from '../../../lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

function sanitizeCompetitorInput(item: CompetitorInput): CompetitorInput | null {
  const safeUrl = toSafePublicHttpUrl(item.url || '');
  if (!safeUrl) return null;
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

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: '/api/analyze',
    aiConfigured: isAIExtractionConfigured(),
    urlValidation: 'enabled at request boundary and crawler boundary',
    message: isAIExtractionConfigured()
      ? 'Analyze API route is active with OpenAI extraction enabled.'
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
