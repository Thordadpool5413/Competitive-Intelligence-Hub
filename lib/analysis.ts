import { andwellCatalog } from './andwell';
import { buildExpertBrief } from './expert-engine';
import type { CompetitorAnalysis, CompetitorInput, Confidence, CrawledPage, ExecutiveInsight, Finding, IntelligenceReport, Status, SubserviceFinding, CompetitorScore, ThreatLevel } from './types';

function norm(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(text: string) {
  return norm(text).split(/\s+/).filter((word) => word.length > 2);
}

function phraseScore(text: string, term: string) {
  const n = ` ${norm(text)} `;
  const t = ` ${norm(term)} `;
  if (n.includes(t)) return term.includes(' ') ? 8 : 4;
  const pieces = words(term);
  if (!pieces.length) return 0;
  const hits = pieces.filter((piece) => n.includes(` ${piece} `) || n.includes(piece)).length;
  const ratio = hits / pieces.length;
  if (ratio >= 0.85) return 3;
  if (ratio >= 0.65) return 1;
  return 0;
}

function score(text: string, terms: string[]) {
  return terms.reduce((sum, term) => sum + phraseScore(text, term), 0);
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
  'Home Healthcare': ['home health','home healthcare','skilled nursing','therapy at home','medical social work','home health aide','medicare certified home health','post hospital','recover at home'],
  'In Home Care Giving': ['home care','in home care','caregiver','caregiving','personal care','companion care','homemaker','respite','bathing assistance','private duty'],
  'Mobile Wound Care': ['mobile wound','in home wound','wound care','advanced wound','ostomy','continence','skin care','wound prevention','wound clinic'],
  'Dementia Care Management through GUIDE': ['guide model','medicare guide','dementia care management','dementia care','caregiver education','respite allowance','memory care','alzheimers'],
  'Hospice Home Care': ['hospice','home hospice','end of life','comfort care','terminal illness','bereavement','chaplain','symptom management'],
  'Hospice House Care': ['hospice house','inpatient hospice','general inpatient hospice','hospice facility','symptom management facility','residential hospice'],
  'Palliative Medicine': ['palliative care','palliative medicine','serious illness','goals of care','symptom management','quality of life'],
  'Caring Comfort Program': ['serious illness support','pre hospice','not ready for hospice','volunteer support','curative treatment','comfort program','bridge program'],
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

function classifyTerms(terms: string[], pages: CrawledPage[]): { status: Status; confidence: Confidence; page?: CrawledPage; matched: string[]; rawScore: number } {
  const all = pages.map((p) => p.text).join(' ');
  const rawScore = score(all, terms);
  const matched = terms.filter((term) => score(all, [term]) > 0).slice(0, 10);
  const page = rawScore > 0 ? evidence(pages, matched.length ? matched : terms) : undefined;
  if (rawScore >= 12 && matched.length >= 2) return { status: 'Clearly offered', confidence: 'High', page, matched, rawScore };
  if (rawScore >= 7) return { status: 'Mentioned only', confidence: 'Moderate', page, matched, rawScore };
  if (rawScore >= 3) return { status: 'Related but not equivalent', confidence: 'Moderate', page, matched, rawScore };
  if (rawScore > 0) return { status: 'Unclear', confidence: 'Low', page, matched, rawScore };
  return { status: 'Not found publicly', confidence: 'Not found', matched: [], rawScore };
}

function relatedTerms(serviceLine: string, subservice: string) {
  const base = [subservice, ...words(subservice)];
  const serviceHints = hints[serviceLine] || [serviceLine];
  if (serviceLine === 'Dementia Care Management through GUIDE' && subservice.toLowerCase().includes('guide')) return ['guide model','medicare guide','guiding an improved dementia experience'];
  if (serviceLine === 'Hospice House Care' && subservice.toLowerCase().includes('hospice house')) return ['hospice house','inpatient hospice','residential hospice','general inpatient hospice'];
  if (subservice.toLowerCase().includes('ostomy')) return ['ostomy','ostomy care','ostomy education'];
  if (subservice.toLowerCase().includes('continence')) return ['continence','incontinence','continence care'];
  if (subservice.toLowerCase().includes('pediatric')) return ['pediatric','children','child'];
  if (subservice.toLowerCase().includes('telehealth')) return ['telehealth','virtual visit','remote monitoring'];
  return [...base, ...serviceHints.slice(0, 3)];
}

function review(status: Status, confidence: Confidence): Finding['reviewStatus'] {
  if (status === 'Clearly offered' && confidence === 'High') return 'Sales usable with evidence';
  if (status === 'Not found publicly' || status === 'Unclear' || status === 'Needs human review') return 'Needs human review';
  return 'Manager review suggested';
}

function interpretation(name: string, status: Status, subject = 'this capability') {
  if (status === 'Clearly offered') return `${name} publicly appears to offer ${subject}. Review depth, geography, eligibility, and proof points before claiming competitive advantage.`;
  if (status === 'Mentioned only') return `${name} publicly mentions ${subject}, but reviewed pages do not show enough detail to treat it as fully equivalent.`;
  if (status === 'Related but not equivalent') return `${name} uses related public language for ${subject}, but the public description does not clearly match Andwell's full capability.`;
  if (status === 'Not found publicly') return `${subject} was not clearly found for ${name} in the reviewed public pages.`;
  return `${subject} needs human review before it is used in sales language.`;
}

function buildSubserviceFinding(input: CompetitorInput, competitorId: string, serviceLine: string, subservice: string, pages: CrawledPage[]): SubserviceFinding {
  const name = providerName(input);
  const terms = relatedTerms(serviceLine, subservice);
  const c = classifyTerms(terms, pages);
  const subject = `${serviceLine}: ${subservice}`;
  return {
    id: `${competitorId}:${serviceLine}:${subservice}`,
    competitorId,
    competitorName: name,
    serviceLine,
    subservice,
    andwellStatus: 'Clearly offered',
    competitorStatus: c.status,
    confidence: c.confidence,
    sourceUrl: c.page?.url,
    sourceTitle: c.page?.title,
    evidenceExcerpt: c.page?.excerpt || `No explicit public evidence for ${subservice} was found in ${pages.length} reviewed pages.`,
    matchedTerms: c.matched,
    aiInterpretation: interpretation(name, c.status, subject),
    safeSalesWording: c.status === 'Not found publicly'
      ? `Based on reviewed public pages, ${subservice} inside ${serviceLine} was not clearly found for ${name}. Andwell publicly lists this capability, so it may be a useful differentiator when appropriate.`
      : `${interpretation(name, c.status, subject)} Use evidence based language and do not overstate the difference.`,
    avoidSaying: `Do not say ${name} does not provide ${subservice} unless that is confirmed by an approved source. Use not found publicly when this comes from website review.`,
    reviewStatus: review(c.status, c.confidence)
  };
}

function summarizeServiceStatus(subs: SubserviceFinding[]): { status: Status; confidence: Confidence; matched: number; depth: number } {
  const matched = subs.filter((s) => s.competitorStatus === 'Clearly offered').length;
  const mentioned = subs.filter((s) => s.competitorStatus === 'Mentioned only' || s.competitorStatus === 'Related but not equivalent').length;
  const total = Math.max(subs.length, 1);
  const depth = Math.round((matched / total) * 100);
  if (matched >= 4 || depth >= 35) return { status: 'Clearly offered', confidence: 'High', matched, depth };
  if (matched >= 1 || mentioned >= 4) return { status: 'Mentioned only', confidence: 'Moderate', matched, depth };
  if (mentioned >= 2) return { status: 'Related but not equivalent', confidence: 'Moderate', matched, depth };
  if (mentioned === 1) return { status: 'Unclear', confidence: 'Low', matched, depth };
  return { status: 'Not found publicly', confidence: 'Not found', matched, depth };
}

function buildFinding(input: CompetitorInput, competitorId: string, service: typeof andwellCatalog[number], pages: CrawledPage[]): Finding {
  const name = providerName(input);
  const subserviceFindings = service.subservices.map((subservice) => buildSubserviceFinding(input, competitorId, service.serviceLine, subservice, pages));
  const serviceHints = hints[service.serviceLine] || [service.serviceLine];
  const c = classifyTerms(serviceHints, pages);
  const summary = summarizeServiceStatus(subserviceFindings);
  const status = c.status === 'Clearly offered' || summary.status === 'Clearly offered' ? 'Clearly offered' : summary.status;
  const confidence = status === 'Clearly offered' ? (c.confidence === 'High' || summary.confidence === 'High' ? 'High' : 'Moderate') : summary.confidence;
  const bestPage = c.page || evidence(pages, serviceHints);
  const clearlyMatchedSubservices = summary.matched;
  return {
    id: `${competitorId}:${service.serviceLine}`,
    competitorId,
    competitorName: name,
    serviceLine: service.serviceLine,
    andwellStatus: 'Clearly offered',
    competitorStatus: status,
    confidence,
    sourceUrl: bestPage?.url,
    sourceTitle: bestPage?.title,
    evidenceExcerpt: bestPage?.excerpt || `No explicit public evidence was found in ${pages.length} reviewed pages.`,
    aiInterpretation: `${interpretation(name, status, service.serviceLine)} ${clearlyMatchedSubservices} of ${service.subservices.length} Andwell subservices were clearly matched from public pages.`,
    matchLevel: status === 'Clearly offered' ? 'Main service line match. Subservice depth determines positioning strength.' : status === 'Not found publicly' ? 'Potential Andwell advantage based on reviewed public pages.' : 'Partial, related, or unclear public match. Review before using in sales materials.',
    andwellAdvantage: status === 'Clearly offered'
      ? `${service.serviceLine} appears to be a shared public service area. Andwell differentiation should come from subservice depth and evidence, especially capabilities not clearly found for ${name}.`
      : `Andwell publicly promotes ${service.serviceLine} with detailed capabilities including ${service.subservices.slice(0, 8).join(', ')}.`,
    competitorAdvantage: status === 'Clearly offered'
      ? `${name} publicly promotes ${service.serviceLine}. Review proof points, response time language, referral simplicity, and geography for possible competitor advantage.`
      : 'No clear competitor advantage was identified from reviewed public pages for this service line.',
    safeSalesWording: status === 'Not found publicly'
      ? `Based on reviewed public pages, ${service.serviceLine} was not clearly found for ${name}. Andwell publicly promotes this service line, so it may be a useful differentiator when appropriate.`
      : `${interpretation(name, status, service.serviceLine)} Compare individual subservices before claiming advantage.`,
    avoidSaying: `Do not say ${name} does not offer ${service.serviceLine} unless confirmed by an approved source. Use not found publicly when the finding comes only from website review.`,
    reviewStatus: review(status, confidence),
    subserviceFindings,
    clearlyMatchedSubservices,
    totalSubservices: service.subservices.length,
    subserviceDepthScore: summary.depth
  };
}

function threatLevel(overlap: number, depth: number): ThreatLevel {
  const blended = Math.round((overlap * 0.55) + (depth * 0.45));
  if (blended >= 75) return 'Strategic threat';
  if (blended >= 55) return 'High overlap';
  if (blended >= 30) return 'Moderate overlap';
  return 'Low overlap';
}

function buildScore(analysis: Omit<CompetitorAnalysis, 'score'>): CompetitorScore {
  const total = Math.max(analysis.findings.length, 1);
  const matched = analysis.findings.filter((f) => f.competitorStatus === 'Clearly offered');
  const notMatched = analysis.findings.filter((f) => f.competitorStatus !== 'Clearly offered');
  const reviewItems = analysis.findings.filter((f) => f.reviewStatus !== 'Sales usable with evidence');
  const serviceLineMatchScore = Math.round((matched.length / total) * 100);
  const subserviceDepthScore = Math.round(analysis.findings.reduce((sum, f) => sum + f.subserviceDepthScore, 0) / total);
  const andwellDifferentiationScore = Math.round((notMatched.length / total) * 100);
  const competitorVisibilityScore = Math.min(100, Math.round((analysis.pagesReviewed.length / 24) * 100));
  const evidenceStrengthScore = Math.round((analysis.findings.filter((f) => f.confidence === 'High').length / total) * 100);
  const reviewRiskScore = Math.round((reviewItems.length / total) * 100);
  const strongestMatches = matched.sort((a, b) => b.subserviceDepthScore - a.subserviceDepthScore).slice(0, 5).map((f) => f.serviceLine);
  const strongestAndwellAdvantages = notMatched.slice(0, 6).map((f) => f.serviceLine);
  const needsReview = reviewItems.slice(0, 6).map((f) => f.serviceLine);
  const leadWith = [...new Set(['Continuum depth', ...strongestAndwellAdvantages.slice(0, 5)])];
  const level = threatLevel(serviceLineMatchScore, subserviceDepthScore);
  return {
    competitorId: analysis.id,
    competitorName: analysis.name,
    serviceLineMatchScore,
    subserviceDepthScore,
    andwellDifferentiationScore,
    competitorVisibilityScore,
    evidenceStrengthScore,
    reviewRiskScore,
    threatLevel: level,
    strongestMatches,
    strongestAndwellAdvantages,
    needsReview,
    leadWith,
    executiveReadout: `${analysis.name} shows ${serviceLineMatchScore}% service line overlap and ${subserviceDepthScore}% subservice depth against the Andwell taxonomy. Threat level: ${level}. Lead with ${leadWith.slice(0, 4).join(', ')} and verify review items before sales use.`
  };
}

export function analyzeCompetitor(input: CompetitorInput, pages: CrawledPage[], index: number): CompetitorAnalysis {
  const id = `competitor_${Date.now()}_${index}`;
  const partial = {
    id,
    name: providerName(input),
    url: input.url,
    market: input.market || 'Not provided',
    analyzedAt: new Date().toISOString(),
    pagesReviewed: pages,
    findings: andwellCatalog.map((service) => buildFinding(input, id, service, pages))
  };
  const subserviceFindings = partial.findings.flatMap((f) => f.subserviceFindings);
  const analysisWithoutScore = { ...partial, subserviceFindings };
  return { ...analysisWithoutScore, score: buildScore(analysisWithoutScore) };
}

function executiveInsights(scores: CompetitorScore[], humanReviewItems: number): ExecutiveInsight[] {
  const topThreat = [...scores].sort((a, b) => (b.serviceLineMatchScore + b.subserviceDepthScore) - (a.serviceLineMatchScore + a.subserviceDepthScore))[0];
  const biggestDifferentiation = [...scores].sort((a, b) => b.andwellDifferentiationScore - a.andwellDifferentiationScore)[0];
  const insights: ExecutiveInsight[] = [];
  if (topThreat) insights.push({
    title: 'Highest competitive overlap',
    priority: topThreat.threatLevel === 'Strategic threat' ? 'High' : 'Medium',
    audience: 'CEO',
    summary: `${topThreat.competitorName} has the highest overlap with Andwell based on public service line and subservice signals.`,
    action: `Review this competitor first. Focus leadership discussion on ${topThreat.strongestMatches.slice(0, 4).join(', ') || 'shared service lines'} and where Andwell can prove deeper value.`
  });
  if (biggestDifferentiation) insights.push({
    title: 'Best Andwell differentiation opportunity',
    priority: 'High',
    audience: 'Sales Leader',
    summary: `${biggestDifferentiation.competitorName} has the largest set of Andwell service areas not clearly matched in public pages.`,
    action: `Build sales coaching around ${biggestDifferentiation.strongestAndwellAdvantages.slice(0, 5).join(', ')} using safe public evidence language.`
  });
  insights.push({
    title: 'Review before sales use',
    priority: humanReviewItems > 20 ? 'High' : 'Medium',
    audience: 'Admin',
    summary: `${humanReviewItems} findings need human review or manager review before they should be treated as approved sales language.`,
    action: 'Use the Review Center to approve, edit, or reject findings before publishing battlecards to the field.'
  });
  insights.push({
    title: 'Rep coaching priority',
    priority: 'High',
    audience: 'Sales Rep',
    summary: 'The strongest selling points are usually inside subservices, not broad service categories.',
    action: 'Coach reps to lead with specific capabilities, patient situations, and referral source problems rather than saying only hospice, home health, or behavioral health.'
  });
  return insights;
}

export function buildReport(analyses: CompetitorAnalysis[], crawlErrors: { url: string; error: string }[]): IntelligenceReport {
  const allFindings = analyses.flatMap((a) => a.findings);
  const allSubserviceFindings = analyses.flatMap((a) => a.subserviceFindings);
  const competitorScores = analyses.map((a) => a.score);
  const matchedServiceFindings = allFindings.filter((f) => f.competitorStatus === 'Clearly offered').length;
  const potentialAndwellAdvantages = allFindings.filter((f) => f.competitorStatus !== 'Clearly offered').length;
  const humanReviewItems = allFindings.filter((f) => f.reviewStatus !== 'Sales usable with evidence').length + allSubserviceFindings.filter((f) => f.reviewStatus !== 'Sales usable with evidence').length;
  const topScore = [...competitorScores].sort((a, b) => b.andwellDifferentiationScore - a.andwellDifferentiationScore)[0];
  const expertBrief = buildExpertBrief(analyses, competitorScores, allFindings, allSubserviceFindings, humanReviewItems);
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
    executiveSummary: `This analysis compared Andwell Health Partners against ${analyses.length} competitor website${analyses.length === 1 ? '' : 's'} using public website evidence. The system created ${allSubserviceFindings.length} subservice level findings, found ${matchedServiceFindings} clearly matched service line findings, and identified ${potentialAndwellAdvantages} potential Andwell advantage findings. ${topScore ? `The strongest differentiation opportunity appears to be against ${topScore.competitorName}.` : ''} Not found publicly means the service was not clearly found in reviewed public pages, not that the competitor definitively does not provide it. Expert score: ${expertBrief.expertScore}.`,
    executiveInsights: executiveInsights(competitorScores, humanReviewItems),
    competitorScores,
    analyses,
    allFindings,
    allSubserviceFindings,
    crawlErrors,
    expertBrief
  };
}