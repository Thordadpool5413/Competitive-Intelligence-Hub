export type Status = 'Clearly offered' | 'Mentioned only' | 'Related but not equivalent' | 'Not found publicly' | 'Unclear' | 'Needs human review';
export type Confidence = 'High' | 'Moderate' | 'Low' | 'Not found' | 'Needs review';
export type ReviewStatus = 'Sales usable with evidence' | 'Manager review suggested' | 'Needs human review' | 'Approved for sales use' | 'Rejected';
export type ThreatLevel = 'Low overlap' | 'Moderate overlap' | 'High overlap' | 'Strategic threat';

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

export type SubserviceFinding = {
  id: string;
  competitorId: string;
  competitorName: string;
  serviceLine: string;
  subservice: string;
  andwellStatus: Status;
  competitorStatus: Status;
  confidence: Confidence;
  sourceUrl?: string;
  sourceTitle?: string;
  evidenceExcerpt: string;
  matchedTerms: string[];
  aiInterpretation: string;
  safeSalesWording: string;
  avoidSaying: string;
  reviewStatus: ReviewStatus;
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
  reviewStatus: ReviewStatus;
  subserviceFindings: SubserviceFinding[];
  clearlyMatchedSubservices: number;
  totalSubservices: number;
  subserviceDepthScore: number;
};

export type CompetitorScore = {
  competitorId: string;
  competitorName: string;
  serviceLineMatchScore: number;
  subserviceDepthScore: number;
  andwellDifferentiationScore: number;
  competitorVisibilityScore: number;
  evidenceStrengthScore: number;
  reviewRiskScore: number;
  threatLevel: ThreatLevel;
  strongestMatches: string[];
  strongestAndwellAdvantages: string[];
  needsReview: string[];
  leadWith: string[];
  executiveReadout: string;
};

export type CompetitorAnalysis = {
  id: string;
  name: string;
  url: string;
  market: string;
  analyzedAt: string;
  pagesReviewed: CrawledPage[];
  findings: Finding[];
  subserviceFindings: SubserviceFinding[];
  score: CompetitorScore;
};

export type ExecutiveInsight = {
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  audience: 'CEO' | 'COO' | 'Sales Leader' | 'Sales Rep' | 'Admin';
  summary: string;
  action: string;
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
  executiveInsights: ExecutiveInsight[];
  competitorScores: CompetitorScore[];
  analyses: CompetitorAnalysis[];
  allFindings: Finding[];
  allSubserviceFindings: SubserviceFinding[];
  crawlErrors: { url: string; error: string }[];
};
