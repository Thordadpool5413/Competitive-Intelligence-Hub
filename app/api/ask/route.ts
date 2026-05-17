import { NextRequest, NextResponse } from 'next/server';
import { readStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function includesAny(text: string, terms: string[]) {
  const normalized = norm(text);
  return terms.some((term) => normalized.includes(norm(term)));
}

function keyTerms(question: string) {
  return norm(question)
    .split(' ')
    .filter((word) => word.length > 3 && !['what','where','when','which','with','that','this','they','them','does','andwell','competitor','compare','offer','offers','service','services'].includes(word));
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { question?: string; competitorName?: string; serviceLine?: string; reportId?: string };
  const question = body.question?.trim() || '';
  if (!question) return NextResponse.json({ error: 'question is required.' }, { status: 400 });

  const store = await readStore();
  const reports = body.reportId ? store.reports.filter((report) => report.id === body.reportId) : store.reports;
  const latest = reports[0];
  if (!latest) {
    return NextResponse.json({
      answer: 'No stored intelligence report was found yet. Run a competitor analysis first, then ask again.',
      evidence: [],
      confidence: 'Needs review'
    });
  }

  const terms = keyTerms(question);
  const allItems = [
    ...latest.allFindings.map((finding) => ({ type: 'service', ...finding })),
    ...latest.allSubserviceFindings.map((finding) => ({ type: 'subservice', ...finding }))
  ];

  const filtered = allItems
    .filter((item) => !body.competitorName || item.competitorName.toLowerCase().includes(body.competitorName.toLowerCase()))
    .filter((item) => !body.serviceLine || item.serviceLine.toLowerCase().includes(body.serviceLine.toLowerCase()))
    .filter((item) => {
      if (!terms.length) return true;
      return includesAny(`${item.competitorName} ${item.serviceLine} ${'subservice' in item ? item.subservice : ''} ${item.safeSalesWording} ${item.evidenceExcerpt}`, terms);
    })
    .slice(0, 12);

  const potentialAdvantages = filtered.filter((item) => item.competitorStatus !== 'Clearly offered').slice(0, 5);
  const matches = filtered.filter((item) => item.competitorStatus === 'Clearly offered').slice(0, 5);
  const reviewItems = filtered.filter((item) => item.reviewStatus !== 'Sales usable with evidence').slice(0, 5);

  const answerParts = [];
  answerParts.push(`Based on the latest stored report from ${new Date(latest.generatedAt).toLocaleString()}, I found ${filtered.length} relevant finding${filtered.length === 1 ? '' : 's'}.`);
  if (potentialAdvantages.length) answerParts.push(`Potential Andwell advantages: ${potentialAdvantages.map((item) => `${item.competitorName} | ${item.serviceLine}${'subservice' in item ? ` | ${item.subservice}` : ''}`).join('; ')}.`);
  if (matches.length) answerParts.push(`Public matches found: ${matches.map((item) => `${item.competitorName} | ${item.serviceLine}${'subservice' in item ? ` | ${item.subservice}` : ''}`).join('; ')}.`);
  if (reviewItems.length) answerParts.push(`Review needed before sales use: ${reviewItems.map((item) => `${item.competitorName} | ${item.serviceLine}${'subservice' in item ? ` | ${item.subservice}` : ''}`).join('; ')}.`);
  answerParts.push('Use safe language. Not found publicly means the service was not clearly found in reviewed public pages, not that the competitor does not provide it.');

  return NextResponse.json({
    answer: answerParts.join(' '),
    confidence: reviewItems.length ? 'Manager review suggested' : 'Evidence backed',
    reportId: latest.id,
    evidence: filtered.map((item) => ({
      type: item.type,
      competitorName: item.competitorName,
      serviceLine: item.serviceLine,
      subservice: 'subservice' in item ? item.subservice : null,
      status: item.competitorStatus,
      confidence: item.confidence,
      sourceUrl: item.sourceUrl,
      sourceTitle: item.sourceTitle,
      evidenceExcerpt: item.evidenceExcerpt,
      safeSalesWording: item.safeSalesWording,
      reviewStatus: item.reviewStatus
    }))
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/ask', message: 'Ask the Hub is active. Use POST with a question.' });
}
