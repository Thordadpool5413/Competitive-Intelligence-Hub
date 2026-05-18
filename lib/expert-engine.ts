import type { CompetitorAnalysis, CompetitorScore, ExpertBrief, ExpertFieldPlay, ExpertPriority, ExpertRecommendation, ExpertWatchItem, Finding, SubserviceFinding } from './types';

const expertVersion = 'foremost-expert-2026.05.18';

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function priorityFromScore(score: number): ExpertPriority {
  if (score >= 85) return 'Critical';
  if (score >= 68) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

function serviceLabel(finding: Finding | SubserviceFinding) {
  return 'subservice' in finding ? `${finding.serviceLine}: ${finding.subservice}` : finding.serviceLine;
}

function evidenceScore(finding: Finding | SubserviceFinding) {
  const confidence = finding.confidence === 'High' ? 34 : finding.confidence === 'Moderate' ? 22 : finding.confidence === 'Low' ? 12 : 4;
  const status = finding.competitorStatus === 'Clearly offered' ? 28 : finding.competitorStatus === 'Mentioned only' ? 20 : finding.competitorStatus === 'Related but not equivalent' ? 15 : finding.competitorStatus === 'Unclear' ? 8 : 5;
  const source = finding.sourceUrl ? 16 : 0;
  const review = finding.reviewStatus === 'Sales usable with evidence' || finding.reviewStatus === 'Approved for sales use' ? 14 : finding.reviewStatus === 'Manager review suggested' ? 6 : 0;
  return clamp(confidence + status + source + review);
}

function recommendation(id: string, input: Omit<ExpertRecommendation, 'id'>): ExpertRecommendation {
  return { id, ...input };
}

function fieldPlay(id: string, input: Omit<ExpertFieldPlay, 'id'>): ExpertFieldPlay {
  return { id, ...input };
}

function watchItem(id: string, input: Omit<ExpertWatchItem, 'id'>): ExpertWatchItem {
  return { id, ...input };
}

function topThreats(scores: CompetitorScore[]) {
  return [...scores]
    .sort((a, b) => (b.serviceLineMatchScore + b.subserviceDepthScore + b.evidenceStrengthScore) - (a.serviceLineMatchScore + a.subserviceDepthScore + a.evidenceStrengthScore))
    .slice(0, 3);
}

function topOpportunities(scores: CompetitorScore[]) {
  return [...scores]
    .sort((a, b) => b.andwellDifferentiationScore - a.andwellDifferentiationScore)
    .slice(0, 3);
}

function bestEvidence(findings: Finding[]) {
  return [...findings]
    .map((finding) => ({ finding, score: evidenceScore(finding) + finding.subserviceDepthScore }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.finding);
}

function bestGaps(findings: Finding[]) {
  return [...findings]
    .filter((finding) => finding.competitorStatus !== 'Clearly offered')
    .map((finding) => ({ finding, score: evidenceScore(finding) + (100 - finding.subserviceDepthScore) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.finding);
}

function buildRecommendations(analyses: CompetitorAnalysis[], scores: CompetitorScore[], humanReviewItems: number): ExpertRecommendation[] {
  const threats = topThreats(scores);
  const opportunities = topOpportunities(scores);
  const recommendations: ExpertRecommendation[] = [];

  if (threats[0]) {
    const score = threats[0];
    recommendations.push(recommendation('leadership-threat-review', {
      priority: priorityFromScore(score.serviceLineMatchScore + score.subserviceDepthScore / 2),
      audience: 'CEO',
      title: `Review ${score.competitorName} as the highest visible competitive threat`,
      reasoning: `${score.competitorName} has ${score.serviceLineMatchScore}% service line overlap and ${score.subserviceDepthScore}% subservice depth against the Andwell taxonomy.`,
      action: `Hold a focused leadership review on ${score.strongestMatches.slice(0, 4).join(', ') || 'the strongest overlap areas'} and decide whether field messaging or public Andwell positioning needs reinforcement.`,
      safeLanguage: 'Treat public overlap as a visibility signal, not a complete operating comparison. Validate operational claims before field use.',
      reviewRequired: true
    }));
  }

  if (opportunities[0]) {
    const score = opportunities[0];
    recommendations.push(recommendation('sales-differentiation-focus', {
      priority: 'High',
      audience: 'Sales Leader',
      title: `Turn ${score.competitorName} gaps into coached Andwell differentiation`,
      reasoning: `${score.competitorName} has a ${score.andwellDifferentiationScore}% Andwell differentiation score based on reviewed public evidence.`,
      action: `Build a coaching huddle around ${score.strongestAndwellAdvantages.slice(0, 5).join(', ') || 'the strongest Andwell advantages'} and require reps to use not found publicly language when discussing competitor gaps.`,
      safeLanguage: 'Based on reviewed public pages, Andwell publicly promotes these capabilities more clearly. Confirm before saying the competitor does not provide them.',
      reviewRequired: true
    }));
  }

  if (humanReviewItems > 0) {
    recommendations.push(recommendation('governance-review-queue', {
      priority: humanReviewItems > 40 ? 'Critical' : 'High',
      audience: 'Admin',
      title: 'Clear the review queue before publishing field language',
      reasoning: `${humanReviewItems} findings require manager review, human review, approval, or rejection before being treated as approved sales language.`,
      action: 'Approve, edit, or reject the highest value findings first, especially any findings tied to strategic threat competitors or high opportunity service lines.',
      safeLanguage: 'Use reviewed evidence and approved wording only. Not found publicly must never become does not offer.',
      reviewRequired: true
    }));
  }

  const messagingCandidates = analyses.flatMap((analysis) => bestGaps(analysis.findings).slice(0, 2));
  if (messagingCandidates.length) {
    recommendations.push(recommendation('marketing-public-positioning', {
      priority: 'Medium',
      audience: 'Marketing',
      title: 'Strengthen public Andwell positioning where competitor visibility is weak or unclear',
      reasoning: `The scan found ${messagingCandidates.length} high value service line opportunities where Andwell can lead with clearer public messaging and safer field positioning.`,
      action: `Prioritize content around ${unique(messagingCandidates.map((finding) => finding.serviceLine)).slice(0, 6).join(', ')} with clear referral pathways, proof points, eligibility language, and safe claims.`,
      safeLanguage: 'Lead with what Andwell clearly provides and avoid unsupported competitor comparisons.',
      reviewRequired: false
    }));
  }

  return recommendations;
}

function buildFieldPlays(analyses: CompetitorAnalysis[]): ExpertFieldPlay[] {
  return analyses.flatMap((analysis) => {
    const opportunities = bestGaps(analysis.findings).slice(0, 3);
    const matches = bestEvidence(analysis.findings).filter((finding) => finding.competitorStatus === 'Clearly offered').slice(0, 2);
    const selected = [...opportunities, ...matches].slice(0, 4);

    return selected.map((finding, index) => fieldPlay(`${analysis.id}-play-${index}`, {
      competitorName: analysis.name,
      serviceLine: finding.serviceLine,
      scenario: finding.competitorStatus === 'Clearly offered'
        ? `Referral source already knows ${analysis.name} in ${finding.serviceLine}.`
        : `Referral source is evaluating options for ${finding.serviceLine} and public competitor evidence is limited or unclear.`,
      leadWith: finding.competitorStatus === 'Clearly offered'
        ? `Lead with Andwell's depth inside ${finding.serviceLine}, not a claim that ${analysis.name} lacks the service.`
        : `Lead with Andwell's clearly promoted ${finding.serviceLine} capabilities and the patient situations where that depth matters.`,
      referralQuestion: `When you are thinking about ${finding.serviceLine}, what patient situation creates the most friction for your team right now?`,
      objectionResponse: finding.competitorStatus === 'Clearly offered'
        ? `That relationship makes sense. The question is whether this patient needs the specific depth Andwell can support inside ${finding.serviceLine}.`
        : `I would not assume what another provider does or does not offer. What I can show you is where Andwell publicly and operationally supports ${finding.serviceLine}.`,
      proofNeeded: finding.sourceUrl ? `Use this source before field use: ${finding.sourceUrl}` : 'Confirm with approved internal proof or manager review before using as a competitive claim.',
      avoidSaying: finding.avoidSaying
    }));
  }).slice(0, 12);
}

function buildWatchlist(scores: CompetitorScore[], analyses: CompetitorAnalysis[]): ExpertWatchItem[] {
  const items: ExpertWatchItem[] = [];
  topThreats(scores).forEach((score, index) => {
    items.push(watchItem(`threat-watch-${index}`, {
      competitorName: score.competitorName,
      signal: `${score.threatLevel} with ${score.serviceLineMatchScore}% visible service line overlap`,
      whyItMatters: 'High overlap competitors can weaken field differentiation unless reps lead with specific patient situations, proof points, and Andwell depth.',
      nextCheck: 'Re scan monthly and after any known market campaign or referral source push.',
      priority: priorityFromScore(score.serviceLineMatchScore + score.subserviceDepthScore / 2)
    }));
  });

  analyses.forEach((analysis) => {
    const aiRisks = analysis.aiExtraction?.reviewRisks || [];
    if (aiRisks.length) {
      items.push(watchItem(`${analysis.id}-ai-risk`, {
        competitorName: analysis.name,
        signal: aiRisks.slice(0, 3).join('; '),
        whyItMatters: 'AI extracted review risks should be checked before they become coaching language or leadership talking points.',
        nextCheck: 'Review source evidence and approve, edit, or reject before battlecard use.',
        priority: 'High'
      }));
    }
  });

  return items.slice(0, 10);
}

export function buildExpertBrief(analyses: CompetitorAnalysis[], scores: CompetitorScore[], allFindings: Finding[], allSubserviceFindings: SubserviceFinding[], humanReviewItems: number): ExpertBrief {
  const threats = topThreats(scores);
  const opportunities = topOpportunities(scores);
  const averageThreat = scores.length
    ? scores.reduce((sum, score) => sum + score.serviceLineMatchScore + score.subserviceDepthScore + score.evidenceStrengthScore - score.reviewRiskScore, 0) / scores.length
    : 0;
  const expertScore = clamp(55 + averageThreat / 5 + Math.min(18, allFindings.length / 10) - Math.min(18, humanReviewItems / 10));
  const bestOpportunity = opportunities[0];
  const topThreat = threats[0];
  const salesReady = allFindings.filter((finding) => finding.reviewStatus === 'Sales usable with evidence' || finding.reviewStatus === 'Approved for sales use').length;
  const topGaps = bestGaps(allFindings).slice(0, 5);
  const reviewRatio = allFindings.length + allSubserviceFindings.length
    ? humanReviewItems / (allFindings.length + allSubserviceFindings.length)
    : 0;

  return {
    expertVersion,
    generatedAt: new Date().toISOString(),
    expertScore,
    marketPosture: topThreat ? `${topThreat.threatLevel}: ${topThreat.competitorName} is the most visible overlap risk.` : 'No competitor threat posture available yet.',
    expertSummary: `The expert engine reviewed ${analyses.length} competitor analysis set${analyses.length === 1 ? '' : 's'}, ${allFindings.length} service line findings, and ${allSubserviceFindings.length} subservice findings. It identified ${salesReady} service findings that are closest to field usable and ${humanReviewItems} items that require review before being treated as approved language.`,
    leadershipDecision: topThreat
      ? `Decide whether ${topThreat.competitorName} requires a targeted leadership response, field coaching focus, or Andwell public messaging reinforcement.`
      : 'Run a competitor scan before making a leadership decision.',
    salesCoachingPriority: bestOpportunity
      ? `Coach reps to lead with ${bestOpportunity.strongestAndwellAdvantages.slice(0, 5).join(', ') || 'specific Andwell capabilities'} against ${bestOpportunity.competitorName}, using safe public evidence language.`
      : 'Coach reps to ask specific patient need questions and avoid unsupported competitor claims.',
    fastestFieldMove: topGaps[0]
      ? `Use ${topGaps[0].serviceLine} as the fastest field positioning opportunity, but keep the wording grounded in reviewed public evidence.`
      : 'Use the highest confidence shared service lines as coaching anchors until more competitor gaps are reviewed.',
    governanceWarning: reviewRatio > 0.35
      ? 'High review load detected. Do not publish broad battlecards until the highest value claims are approved, edited, or rejected.'
      : 'Governance load is manageable, but every not found publicly statement still requires careful wording.',
    strongestThreats: threats.map((score) => `${score.competitorName}: ${score.threatLevel}, ${score.serviceLineMatchScore}% service overlap, ${score.subserviceDepthScore}% depth`),
    bestOpportunities: opportunities.map((score) => `${score.competitorName}: ${score.andwellDifferentiationScore}% Andwell differentiation, lead with ${score.leadWith.slice(0, 4).join(', ')}`),
    recommendations: buildRecommendations(analyses, scores, humanReviewItems),
    fieldPlays: buildFieldPlays(analyses),
    watchlist: buildWatchlist(scores, analyses)
  };
}
