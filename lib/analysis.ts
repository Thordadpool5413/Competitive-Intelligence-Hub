import { andwellCatalog } from './andwell';
import type { CompetitorAnalysis, CompetitorInput, Confidence, CrawledPage, Finding, IntelligenceReport, Status } from './types';

function norm(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function includes(text: string, phrase: string) {
  return ` ${norm(text)} `.includes(` ${norm(phrase)} `);
}

function words(text: string) {
  return norm(text).split(/\s+/).filter((word) => word.length > 2);
}

function score(text: string, terms: string[]) {
  const n = norm(text);
  let total = 0;
  for (const term of terms) {
    if (includes(n, term)) total += term.includes(' ') ? 5 : 2;
    else {
      const w = words(term);
      if (!w.length) continue;
      const hits = w.filter((x) => n.includes(x)).length;
      if (hits / w.length >= 0.75) total += 1;
    }
  }
  return total;
}

function providerName(input: CompetitorInput) {
  if (input.name?.trim()) return input.name.trim();
  try {
    return new URL(input.url).hostname.replace(/^www\./, '').split('.')[0].replace(/\b\w/g, (l) => l.toUpperCase());
  } catch {
    return 'Competitor';
  }
}

const hints: Record<string, string[]> = {
  'Home Healthcare': ['home health','home healthcare','skilled nursing','therapy at home','medical social work','home health aide','medicare certified home health','post hospital'],
  'In Home Care Giving': ['home care','in home care','caregiver','caregiving','personal care','companion care','homemaker','respite','bathing assistance'],
  'Mobile Wound Care': ['mobile wound','in home wound','wound care','advanced wound','ostomy','continence','skin care','wound prevention'],
  'Dementia Care Management through GUIDE': ['guide model','medicare guide','dementia care management','dementia care','caregiver education','respite allowance','memory care'],
  'Hospice Home Care': ['hospice','home hospice','end of life','comfort care','terminal illness','bereavement','chaplain','symptom management'],
  'Hospice House Care': ['hospice house','inpatient hospice','general inpatient hospice','hospice facility','symptom management facility'],
  'Palliative Medicine': ['palliative care','palliative medicine','serious illness','goals of care','symptom management','quality of life'],
  'Caring Comfort Program': ['serious illness support','pre hospice','not ready for hospice','volunteer support','curative treatment','comfort program'],
  'Bereavement Support': ['bereavement','grief support','grief counseling','grief group','loss support','grief education'],
  'Community and Behavioral Health': ['behavioral health','mental health','counseling','therapy','psychological evaluation','case management','substance use','community support'],
  'Pediatric Therapy': ['pediatric therapy','occupational therapy','physical therapy','speech therapy','speech language','children therapy','school based therapy'],
  'Adult Therapy': ['physical therapy','occupational therapy','speech language pathology','adult therapy','pelvic floor','wheelchair clinic','neuro rehab','stroke recovery'],
  'Audiology': ['audiology','hearing','hearing loss','hearing aid'],
  'Maternal and Child Health': ['maternal','pediatric home health','children home health','medically fragile','postpartum','high risk pregnancy','g tube','feeding tube','perinatal hospice']
};

function evidence(pages: CrawledPage[], terms: string[]) {
  return [...pages].sort((a, b) => score(b.text, terms) - score(a.text, terms))[0];
}

function classify(serviceLine: string, subservices: string[], pages: CrawledPage[]): { status: Status; confidence: Confidence; page?: CrawledPage; matched: string[] } {
  const all = pages.map((p) => p.text).join(' ');
  const serviceHints = hints[serviceLine] || [serviceLine];
  const serviceScore = score(all, serviceHints);
  const matchedSubs = subservices.filter((s) => score(all, [s]) > 0);
  const matched = [...serviceHints.filter((h) => score(all, [h]) > 0), ...matchedSubs].slice(0, 12);
  const page = evidence(pages, [...serviceHints, ...matchedSubs.slice(0, 8)]);
  if (serviceScore >= 7 && matchedSubs.length >= 3) return { status: 'Clearly offered', confidence: 'High', page, matched };
  if (serviceScore >= 4) return { status: 'Mentioned only', confidence: 'Moderate', page, matched };
  if (serviceScore >= 2 || matchedSubs.length >= 2) return { status: 'Related but not equivalent', confidence: 'Moderate', page, matched };
  if (matchedSubs.length === 1) return { status: 'Unclear', confidence: 'Low', page, matched };
  return { status: 'Not found publicly', confidence: 'Not found', matched: [] };
}

function review(status: Status, confidence: Confidence): Finding['reviewStatus'] {
  if (status === 'Clearly offered' && confidence === 'High') return 'Sales usable with evidence';
  if (status === 'Not found publicly' || status === 'Unclear' || status === 'Needs human review') return 'Needs human review';
  return 'Manager review suggested';
}

function interpretation(name: string, status: Status) {
  if (status === 'Clearly offered') return `${name} publicly appears to match this service line. Subservice depth still needs comparison before a sales advantage is claimed.`;
  if (status === 'Mentioned only') return `${name} mentions this area publicly, but reviewed pages do not provide enough detail to treat it as fully equivalent.`;
  if (status === 'Related but not equivalent') return `${name} uses related public language, but it should not be treated as equivalent without review.`;
  if (status === 'Not found publicly') return `${name} did not clearly show this service in the public pages reviewed.`;
  return `${name} needs human review before this finding is used in sales language.`;
}

function buildFinding(input: CompetitorInput, competitorId: string, service: typeof andwellCatalog[number], pages: CrawledPage[]): Finding {
  const name = providerName(input);
  const c = classify(service.serviceLine, service.subservices, pages);
  const excerpt = c.page?.excerpt || `No explicit public evidence was found in ${pages.length} reviewed pages.`;
  const matched = c.matched.length ? c.matched.join(', ') : 'none found';
  return {
    id: `${competitorId}:${service.serviceLine}`,
    competitorId,
    competitorName: name,
    serviceLine: service.serviceLine,
    andwellStatus: 'Clearly offered',
    competitorStatus: c.status,
    confidence: c.confidence,
    sourceUrl: c.page?.url,
    sourceTitle: c.page?.title,
    evidenceExcerpt: excerpt,
    aiInterpretation: `${interpretation(name, c.status)} Matched public terms: ${matched}.`,
    matchLevel: c.status === 'Clearly offered' ? 'Main service line match. Review subservice detail before positioning advantage.' : c.status === 'Not found publicly' ? 'Potential Andwell advantage based on reviewed public pages.' : 'Partial, related, or unclear public match. Review before using in sales materials.',
    andwellAdvantage: c.status === 'Clearly offered' ? `${service.serviceLine} appears to be a shared public service area. Andwell differentiation should come from detailed capabilities including ${service.subservices.slice(0, 8).join(', ')}.` : `Andwell publicly promotes ${service.serviceLine} with detailed capabilities including ${service.subservices.slice(0, 8).join(', ')}.`,
    competitorAdvantage: c.status === 'Clearly offered' ? `${name} publicly promotes ${service.serviceLine}. Review the source wording for stronger claims, proof points, response time language, referral simplicity, or geography.` : 'No clear competitor advantage was identified from the reviewed public pages for this service line.',
    safeSalesWording: c.status === 'Not found publicly' ? `Based on reviewed public pages, ${service.serviceLine} was not clearly found for ${name}. Andwell publicly promotes this service line, so it may be a useful differentiator when appropriate.` : `${interpretation(name, c.status)} Compare at the subservice level before claiming advantage.`,
    avoidSaying: `Do not say ${name} does not offer ${service.serviceLine} unless confirmed by an approved source. Use not found publicly when the finding comes only from website review.`,
    reviewStatus: review(c.status, c.confidence)
  };
}

export function analyzeCompetitor(input: CompetitorInput, pages: CrawledPage[], index: number): CompetitorAnalysis {
  const id = `competitor_${Date.now()}_${index}`;
  return {
    id,
    name: providerName(input),
    url: input.url,
    market: input.market || 'Not provided',
    analyzedAt: new Date().toISOString(),
    pagesReviewed: pages,
    findings: andwellCatalog.map((service) => buildFinding(input, id, service, pages))
  };
}

export function buildReport(analyses: CompetitorAnalysis[], crawlErrors: { url: string; error: string }[]): IntelligenceReport {
  const allFindings = analyses.flatMap((a) => a.findings);
  const matchedServiceFindings = allFindings.filter((f) => f.competitorStatus === 'Clearly offered').length;
  const potentialAndwellAdvantages = allFindings.filter((f) => f.competitorStatus !== 'Clearly offered').length;
  const humanReviewItems = allFindings.filter((f) => f.reviewStatus !== 'Sales usable with evidence').length;
  return {
    id: `report_${Date.now()}`,
    generatedAt: new Date().toISOString(),
    baselineProvider: 'Andwell Health Partners',
    competitorsAnalyzed: analyses.length,
    pagesReviewed: analyses.reduce((sum, a) => sum + a.pagesReviewed.length, 0),
    serviceLinesMapped: andwellCatalog.length,
    subservicesMapped: andwellCatalog.reduce((sum, s) => sum + s.subservices.length, 0),
    matchedServiceFindings,
    potentialAndwellAdvantages,
    humanReviewItems,
    executiveSummary: `This analysis compared Andwell Health Partners against ${analyses.length} competitor website${analyses.length === 1 ? '' : 's'} using public website evidence. The system found ${matchedServiceFindings} clearly matched service findings and ${potentialAndwellAdvantages} potential Andwell advantage findings. Not found publicly means the service was not clearly found in reviewed public pages, not that the competitor definitively does not provide it.`,
    analyses,
    allFindings,
    crawlErrors
  };
}
