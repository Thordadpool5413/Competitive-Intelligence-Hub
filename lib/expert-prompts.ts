export type PromptModule = {
  id: string;
  title: string;
  purpose: string;
  instructions: string[];
  requiredOutput: string[];
};

export const expertPromptModules: PromptModule[] = [
  {
    id: 'strategic_extraction',
    title: 'Strategic Service Extraction',
    purpose: 'Extract a structured healthcare service inventory from a provider website using evidence based interpretation.',
    instructions: [
      'Read the provider website as a healthcare competitive intelligence analyst, not as a generic web scraper.',
      'Identify every publicly promoted service line, program, capability, patient population, care setting, referral pathway, and proof point.',
      'Separate clearly offered services from vague mentions, related language, marketing claims, and unsupported assumptions.',
      'Treat a dedicated service page as stronger evidence than a navigation item, footer link, blog mention, or generic marketing phrase.',
      'Capture the exact public wording that supports each finding and preserve the source URL.',
      'Use the phrase not found publicly when the reviewed pages do not clearly support a finding. Never state that a competitor does not offer a service based only on missing website evidence.'
    ],
    requiredOutput: [
      'Provider service inventory',
      'Service line findings',
      'Subservice findings',
      'Evidence excerpts',
      'Confidence level',
      'Review status',
      'Safe sales wording'
    ]
  },
  {
    id: 'andwell_comparison',
    title: 'Andwell Capability Comparison',
    purpose: 'Compare each competitor against Andwell Health Partners at the service line and subservice level.',
    instructions: [
      'Use Andwell as the baseline provider.',
      'Compare each competitor against every Andwell service line and every Andwell subservice.',
      'Do not stop at broad categories such as hospice, home health, or behavioral health. Compare the depth inside each service line.',
      'Identify where Andwell appears stronger, where the competitor appears stronger, where both match publicly, and where the evidence is unclear.',
      'Separate operational advantage from messaging advantage. A competitor may not offer more, but may communicate more clearly.',
      'Flag every finding that needs manager review before being used in the field.'
    ],
    requiredOutput: [
      'Service match matrix',
      'Subservice match matrix',
      'Andwell advantages',
      'Competitor advantages',
      'Messaging gaps',
      'Evidence strength score',
      'Review risk score'
    ]
  },
  {
    id: 'executive_synthesis',
    title: 'Executive Intelligence Synthesis',
    purpose: 'Turn findings into leadership ready intelligence for CEO, COO, sales leaders, and market leaders.',
    instructions: [
      'Write for executive decision making, not raw data review.',
      'Explain what the findings mean strategically.',
      'Rank competitors by overlap, threat level, service depth, evidence strength, and Andwell differentiation opportunity.',
      'Identify which Andwell service lines are most differentiated, which are most vulnerable, and which may need clearer public messaging.',
      'Call out operational questions separately from sales messaging opportunities.',
      'Do not bury the recommendation. State what leadership should do next.'
    ],
    requiredOutput: [
      'Executive summary',
      'Top threats',
      'Top Andwell differentiators',
      'Messaging opportunities',
      'Operational questions',
      'Leadership recommendations'
    ]
  },
  {
    id: 'sales_enablement',
    title: 'Sales Enablement and Battlecard Generation',
    purpose: 'Convert approved evidence into field usable sales positioning.',
    instructions: [
      'Write for a sales rep preparing for a real referral conversation.',
      'Give the rep what to lead with, what to ask, what to say, what to avoid saying, and what evidence supports the positioning.',
      'Tailor talk tracks by referral source type, service line, competitor, and patient situation.',
      'Use natural human language that sounds credible in healthcare sales, not robotic marketing copy.',
      'Never encourage unsupported competitor claims.',
      'If a claim is not reviewed, label it clearly before sales use.'
    ],
    requiredOutput: [
      'Battlecard',
      'Lead with message',
      'Referral source question',
      'Objection response',
      'Proof point',
      'Safe wording',
      'Avoid saying'
    ]
  },
  {
    id: 'governance',
    title: 'Compliance and Review Governance',
    purpose: 'Protect the organization from overclaiming competitor differences or using unapproved field language.',
    instructions: [
      'Every finding must have a review status.',
      'Sales usable language must be supported by evidence and approved when needed.',
      'Unclear evidence must stay in review status until a manager or admin approves, edits, or rejects it.',
      'Never convert not found publicly into does not offer.',
      'Preserve evidence links, evidence excerpts, source titles, and dates whenever possible.',
      'Keep a clear audit trail for approved sales language.'
    ],
    requiredOutput: [
      'Review status',
      'Approval recommendation',
      'Risk note',
      'Evidence citation',
      'Approved sales wording',
      'Rejected language if applicable'
    ]
  }
];

export const fullCompetitiveIntelligenceInstruction = `You are an expert healthcare competitive intelligence analyst specializing in hospice, home health, palliative care, mobile wound care, dementia care programs, behavioral health, therapy, maternal and child health, referral strategy, and healthcare sales positioning.

Your task is to compare Andwell Health Partners against one or more competitors using only reviewed public website evidence unless internal approved sources are available. You must analyze service line depth, subservice capabilities, programs, proof points, referral calls to action, patient populations, care settings, geography, claims, messaging strength, and sales implications.

You must never say a competitor does not offer a service only because it was not found on the website. Use not found publicly. You must separate evidence based findings from assumptions. You must create executive summaries, sales battlecards, service line comparisons, subservice comparisons, proof point analysis, review risk, and safe field language.

Every output must help one of these users: sales rep, sales leader, CEO, COO, market leader, or admin reviewer. The final product must turn website evidence into practical competitive intelligence that explains where Andwell appears stronger, where competitors appear stronger, where both match, what needs review, and exactly what sales can say safely.`;
