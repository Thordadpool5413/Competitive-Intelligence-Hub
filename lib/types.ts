export type Status = 'Clearly offered' | 'Mentioned only' | 'Related but not equivalent' | 'Not found publicly' | 'Unclear' | 'Needs human review';
export type Confidence = 'High' | 'Moderate' | 'Low' | 'Not found' | 'Needs review';

export type CrawledPage = {
  url: string;
  title: string;
  text: string;
  excerpt: string;
};

export type CompetitorInput = {
  name?: string;
  url: string;
  market?: string;
  notes?: string;
};

export type Finding = {
  id: string;
  competitorId: string;
  competitorName: string;
  serviceLine: string;
  andwellStatus: Status;
  competitorStatus: Status;
  confidence: Confidence;
  sourceUrl?: string;
  sourceTitle?: string;
  evidenceExcerpt: string;
  aiInterpretation: string;
  matchLevel: string;
  andwellAdvantage: string;
  competitorAdvantage: string;
  safeSalesWording: string;
  avoidSaying: string;
  reviewStatus: 'Sales usable with evidence' | 'Manager review suggested' | 'Needs human review' | 'Approved for sales use' | 'Rejected';
};

export type CompetitorAnalysis = {
  id: string;
  name: string;
  url: string;
  market: string;
  analyzedAt: string;
  pagesReviewed: CrawledPage[];
  findings: Finding[];
};

export type IntelligenceReport = {
  id: string;
  generatedAt: string;
  baselineProvider: 'Andwell Health Partners';
  competitorsAnalyzed: number;
  pagesReviewed: number;
  serviceLinesMapped: number;
  subservicesMapped: number;
  matchedServiceFindings: number;
  potentialAndwellAdvantages: number;
  humanReviewItems: number;
  executiveSummary: string;
  analyses: CompetitorAnalysis[];
  allFindings: Finding[];
  crawlErrors: { url: string; error: string }[];
};
