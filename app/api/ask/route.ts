import { NextRequest, NextResponse } from 'next/server';
import { readStore } from '../../../lib/store';
import { fieldActionFromEvidence, questionTerms, rankEvidenceForQuestion, type EvidenceLike } from '../../../lib/smart-ranking';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type HubEvidenceItem = EvidenceLike & {
  type: 'service' | 'subservice';
};

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function includesAny(text: string, terms: string[]) {
  const normalized = norm(text);
  return terms.some((term) => normalized.includes(norm(term)));
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
      confidence: 'Needs review',
      nextBestActions: []
    });
  }

  const terms = questionTerms(question);
  const serviceItems: HubEvidenceItem[] = latest.allFindings.map((finding) => ({ type: 'service', ...finding }));
  const subserviceItems: HubEvidenceItem[] = latest.allSubserviceFindings.map((finding) => ({ type: 'subservice', ...finding }));
  const allItems: HubEvidenceItem[] = [...serviceItems, ...subserviceItems];

  const candidateItems = allItems
    .filter((item) => !body.competitorName || item.competitorName.toLowerCase().includes(body.competitorName.toLowerCase()))
    .filter((item) => !body.serviceLine || item.serviceLine.toLowerCase().includes(body.serviceLine.toLowerCase()))
    .filter((item) => {
      if (!terms.length) return true;
      return includesAny(`${item.competitorName} ${item.serviceLine} ${item.subservice || ''} ${item.safeSalesWording} ${item.evidenceExcerpt} ${item.sourceTitle || ''}`, terms);
    });

  const ranked = rankEvidenceForQuestion(candidateItems, question).slice(0, 12);
  const potentialAdvantages = ranked.filter((item) => item.competitorStatus !== 'Clearly offered').slice(0, 5);
  const matches = ranked.filter((item) => item.competitorStatus === 'Clearly offered').slice(0, 5);
  const reviewItems = ranked.filter((item) => item.reviewStatus !== 'Sales usable with evidence' && item.reviewStatus !== 'Approved for sales use').slice(0, 5);
  const topEvidence = ranked.slice(0, 3);
  const nextBestActions = topEvidence.map(fieldActionFromEvidence);

  const answerParts = [];
  answerParts.push(`Based on the latest stored report from ${new Date(latest.generatedAt).toLocaleString()}, I found ${ranked.length} relevant finding${ranked.length === 1 ? '' : 's'} and ranked them by question fit, evidence strength, confidence, source quality, and sales usability.`);
  if (topEvidence.length) {
    answerParts.push(`Top evidence: ${topEvidence.map((item) => `${item.competitorName} | ${item.serviceLine}${item.subservice ? ` | ${item.subservice}` : ''} | ${item.competitorStatus}`).join('; ')}.`);
  }
  if (potentialAdvantages.length) answerParts.push(`Potential Andwell advantages: ${potentialAdvantages.map((item) => `${item.competitorName} | ${item.serviceLine}${item.subservice ? ` | ${item.subservice}` : ''}`).join('; ')}.`);
  if (matches.length) answerParts.push(`Public matches found: ${matches.map((item) => `${item.competitorName} | ${item.serviceLine}${item.subservice ? ` | ${item.subservice}` : ''}`).join('; ')}.`);
  if (reviewItems.length) answerParts.push(`Review needed before sales use: ${reviewItems.map((item) => `${item.competitorName} | ${item.serviceLine}${item.subservice ? ` | ${item.subservice}` : ''}`).join('; ')}.`);
  if (nextBestActions.length) answerParts.push(`Recommended next move: ${nextBestActions[0]}`);
  answerParts.push('Use safe language. Not found publicly means the service was not clearly found in reviewed public pages, not that the competitor does not provide it.');

  return NextResponse.json({
    answer: answerParts.join(' '),
    confidence: reviewItems.length ? 'Manager review suggested' : 'Evidence backed',
    reportId: latest.id,
    questionTerms: terms,
    nextBestActions,
    evidence: ranked.map((item) => ({
      type: item.type,
      smartScore: item.smartScore,
      competitorName: item.competitorName,
      serviceLine: item.serviceLine,
      subservice: item.subservice || null,
      status: item.competitorStatus,
      confidence: item.confidence,
      sourceUrl: item.sourceUrl,
      sourceTitle: item.sourceTitle,
      evidenceExcerpt: item.evidenceExcerpt,
      safeSalesWording: item.safeSalesWording,
      reviewStatus: item.reviewStatus,
      recommendedAction: fieldActionFromEvidence(item)
    }))
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/ask', message: 'Ask the Hub is active with smart evidence ranking. Use POST with a question.' });
}
