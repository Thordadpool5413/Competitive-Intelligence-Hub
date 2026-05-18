import type { Confidence, CrawledPage, ReviewStatus, Status } from './types';

export type EvidenceLike = {
  type?: string;
  competitorName: string;
  serviceLine: string;
  subservice?: string;
  competitorStatus: Status;
  confidence: Confidence;
  sourceUrl?: string;
  sourceTitle?: string;
  evidenceExcerpt: string;
  matchedTerms?: string[];
  safeSalesWording: string;
  avoidSaying?: string;
  reviewStatus: ReviewStatus;
};

const stopWords = new Set([
  'what', 'where', 'when', 'which', 'with', 'that', 'this', 'they', 'them', 'does', 'andwell', 'competitor', 'competitors',
  'compare', 'offer', 'offers', 'service', 'services', 'about', 'from', 'have', 'their', 'there', 'show', 'shows', 'best', 'tell',
  'give', 'need', 'needs', 'find', 'found', 'public', 'publicly', 'website', 'websites', 'report', 'reports', 'analysis'
]);

const businessTerms = [
  'hospice', 'palliative', 'home health', 'home care', 'wound', 'dementia', 'guide', 'therapy', 'behavioral', 'audiology',
  'maternal', 'pediatric', 'bereavement', 'referral', 'same day', '24/7', 'inpatient', 'caregiver', 'private duty', 'comfort'
];

const pagePriorityTerms = [
  ...businessTerms,
  'services', 'programs', 'specialty', 'referrals', 'eligibility', 'insurance', 'medicare', 'quality', 'outcomes', 'team', 'locations'
];

function norm(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(value: string) {
  return norm(value).split(' ').filter((word) => word.length > 2);
}

export function questionTerms(question: string) {
  const raw = words(question).filter((word) => word.length > 3 && !stopWords.has(word));
  return [...new Set(raw)].slice(0, 18);
}

function phraseScore(text: string, phrase: string) {
  const normalizedText = ` ${norm(text)} `;
  const normalizedPhrase = ` ${norm(phrase)} `;
  if (!normalizedPhrase.trim()) return 0;
  if (normalizedText.includes(normalizedPhrase)) return phrase.includes(' ') ? 8 : 4;
  const parts = words(phrase);
  if (!parts.length) return 0;
  const hits = parts.filter((part) => normalizedText.includes(` ${part} `)).length;
  const ratio = hits / parts.length;
  if (ratio >= 0.8) return 3;
  if (ratio >= 0.5) return 1;
  return 0;
}

export function weightedTextScore(text: string, terms: string[]) {
  return terms.reduce((sum, term) => sum + phraseScore(text, term), 0);
}

function statusWeight(status: Status) {
  if (status === 'Clearly offered') return 26;
  if (status === 'Mentioned only') return 18;
  if (status === 'Related but not equivalent') return 14;
  if (status === 'Unclear') return 8;
  if (status === 'Needs human review') return 6;
  return 4;
}

function confidenceWeight(confidence: Confidence) {
  if (confidence === 'High') return 20;
  if (confidence === 'Moderate') return 13;
  if (confidence === 'Low') return 7;
  if (confidence === 'Needs review') return 4;
  return 2;
}

function reviewWeight(reviewStatus: ReviewStatus) {
  if (reviewStatus === 'Sales usable with evidence' || reviewStatus === 'Approved for sales use') return 12;
  if (reviewStatus === 'Manager review suggested') return 4;
  if (reviewStatus === 'Needs human review') return -6;
  return -10;
}

export function scoreEvidenceItem(item: EvidenceLike, terms: string[]) {
  const searchable = [
    item.competitorName,
    item.serviceLine,
    item.subservice || '',
    item.evidenceExcerpt,
    item.safeSalesWording,
    item.sourceTitle || '',
    item.matchedTerms?.join(' ') || ''
  ].join(' ');

  const questionFit = terms.length ? weightedTextScore(searchable, terms) : 12;
  const specificity = item.subservice ? 10 : 4;
  const sourceBonus = item.sourceUrl ? 8 : 0;
  const businessFit = weightedTextScore(searchable, businessTerms);

  return questionFit + specificity + sourceBonus + statusWeight(item.competitorStatus) + confidenceWeight(item.confidence) + reviewWeight(item.reviewStatus) + Math.min(20, businessFit);
}

export function rankEvidenceForQuestion<T extends EvidenceLike>(items: T[], question: string) {
  const terms = questionTerms(question);
  return [...items]
    .map((item) => ({ item, score: scoreEvidenceItem(item, terms) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => ({ ...entry.item, smartScore: entry.score }));
}

export function pageIntelligenceScore(page: CrawledPage) {
  const searchable = `${page.url} ${page.title} ${page.excerpt} ${page.text.slice(0, 5000)}`;
  const priority = weightedTextScore(searchable, pagePriorityTerms);
  const evidence = weightedTextScore(searchable, ['medicare', 'certified', 'referral', 'eligibility', 'quality', 'outcome', 'same day', '24/7', 'team', 'specialist']);
  const bodyValue = Math.min(20, Math.round(page.text.length / 1000));
  const lowValuePenalty = weightedTextScore(page.url, ['career', 'privacy', 'terms', 'donate', 'event', 'login']) * 3;
  return priority + evidence + bodyValue - lowValuePenalty;
}

export function selectBestPromptPages(pages: CrawledPage[], maxPages: number, maxCharsPerPage: number) {
  const seen = new Set<string>();
  const ranked = [...pages]
    .filter((page) => {
      const key = norm(`${page.title} ${page.text.slice(0, 600)}`);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return page.text.trim().length > 160;
    })
    .map((page) => ({ page, score: pageIntelligenceScore(page) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPages)
    .map(({ page, score }, index) => ({
      index: index + 1,
      url: page.url,
      title: page.title,
      intelligenceScore: score,
      excerpt: page.text.slice(0, maxCharsPerPage)
    }));

  return ranked.length ? ranked : pages.slice(0, maxPages).map((page, index) => ({
    index: index + 1,
    url: page.url,
    title: page.title,
    intelligenceScore: pageIntelligenceScore(page),
    excerpt: page.text.slice(0, maxCharsPerPage)
  }));
}

export function fieldActionFromEvidence(item: EvidenceLike) {
  if (item.competitorStatus === 'Clearly offered') {
    return `Treat ${item.competitorName} as visibly active in ${item.serviceLine}${item.subservice ? `, especially ${item.subservice}` : ''}. Lead with Andwell depth, response clarity, and proof points instead of claiming absence.`;
  }
  if (item.competitorStatus === 'Not found publicly') {
    return `Position this as a public visibility gap, not a definitive absence. Use Andwell's clearly promoted capability as the safer sales angle.`;
  }
  return `Use this as a coaching opportunity. The public language is partial, so confirm the claim before turning it into a field battlecard.`;
}
