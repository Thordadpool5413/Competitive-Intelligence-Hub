import https from 'node:https';
import { andwellCatalog } from './andwell';
import { selectBestPromptPages } from './smart-ranking';
import type { AICompetitorExtraction, CompetitorInput, CrawledPage } from './types';

const defaultModel = process.env.OPENAI_MODEL || 'gpt-4.1-nano';
const openAIBaseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
const openAITimeoutMs = Number(process.env.OPENAI_TIMEOUT_MS || 60000);
const maxPagesForPrompt = Math.max(3, Math.min(10, Number(process.env.OPENAI_MAX_PROMPT_PAGES || 4)));
const maxCharsPerPage = Math.max(900, Math.min(2400, Number(process.env.OPENAI_MAX_CHARS_PER_PAGE || 1000)));
const maxOutputTokens = Math.max(1800, Math.min(5000, Number(process.env.OPENAI_MAX_OUTPUT_TOKENS || 1800)));

type OpenAIRequestBody = {
  model: string;
  input: string;
  temperature: number;
  max_output_tokens: number;
};

function providerName(input: CompetitorInput) {
  if (input.name?.trim()) return input.name.trim();
  try {
    return new URL(input.url).hostname.replace(/^www\./, '').split('.')[0].replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Competitor';
  }
}

function safeText(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 30) : [];
}

function status(value: unknown) {
  const allowed = ['Clearly offered', 'Mentioned only', 'Related but not equivalent', 'Not found publicly', 'Unclear', 'Needs human review'];
  const text = String(value || '').trim();
  return allowed.includes(text) ? text as AICompetitorExtraction['subserviceDepth'][number]['status'] : 'Needs human review';
}

function confidence(value: unknown) {
  const allowed = ['High', 'Moderate', 'Low', 'Not found', 'Needs review'];
  const text = String(value || '').trim();
  return allowed.includes(text) ? text as AICompetitorExtraction['subserviceDepth'][number]['confidence'] : 'Needs review';
}

function evidenceStrength(value: unknown) {
  const allowed = ['Strong', 'Moderate', 'Weak', 'Not found'];
  const text = String(value || '').trim();
  return allowed.includes(text) ? text as AICompetitorExtraction['serviceLineDepth'][number]['evidenceStrength'] : 'Weak';
}

function reviewRisk(value: unknown) {
  const allowed = ['Low', 'Medium', 'High'];
  const text = String(value || '').trim();
  return allowed.includes(text) ? text as AICompetitorExtraction['serviceLineDepth'][number]['reviewRisk'] : 'High';
}

function clampScore(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeExtraction(raw: any, input: CompetitorInput): AICompetitorExtraction {
  return {
    providerName: safeText(raw?.providerName, providerName(input)),
    aiModel: safeText(raw?.aiModel, defaultModel),
    generatedAt: new Date().toISOString(),
    servicesMentioned: arrayOfStrings(raw?.servicesMentioned),
    benefitsMentioned: arrayOfStrings(raw?.benefitsMentioned),
    claimsMade: arrayOfStrings(raw?.claimsMade),
    programsOffered: arrayOfStrings(raw?.programsOffered),
    proofPoints: arrayOfStrings(raw?.proofPoints),
    referralCallsToAction: arrayOfStrings(raw?.referralCallsToAction),
    serviceLineDepth: Array.isArray(raw?.serviceLineDepth) ? raw.serviceLineDepth.slice(0, 30).map((item: any) => ({
      serviceLine: safeText(item?.serviceLine, 'Needs review'),
      depthScore: clampScore(item?.depthScore),
      evidenceStrength: evidenceStrength(item?.evidenceStrength),
      summary: safeText(item?.summary, 'Needs review.'),
      competitorAdvantages: arrayOfStrings(item?.competitorAdvantages),
      andwellAdvantages: arrayOfStrings(item?.andwellAdvantages),
      proofPoints: arrayOfStrings(item?.proofPoints),
      referralCallsToAction: arrayOfStrings(item?.referralCallsToAction),
      reviewRisk: reviewRisk(item?.reviewRisk)
    })) : [],
    subserviceDepth: Array.isArray(raw?.subserviceDepth) ? raw.subserviceDepth.slice(0, 300).map((item: any) => ({
      serviceLine: safeText(item?.serviceLine, 'Needs review'),
      subservice: safeText(item?.subservice, 'Needs review'),
      status: status(item?.status),
      confidence: confidence(item?.confidence),
      evidenceExcerpt: safeText(item?.evidenceExcerpt, 'No evidence excerpt returned by AI.'),
      sourceUrl: optionalText(item?.sourceUrl),
      safeSalesLanguage: safeText(item?.safeSalesLanguage, 'Use evidence based language and verify before sales use.'),
      doNotSayLanguage: safeText(item?.doNotSayLanguage, 'Do not overstate competitor differences without approved evidence.')
    })) : [],
    competitorAdvantages: arrayOfStrings(raw?.competitorAdvantages),
    andwellAdvantages: arrayOfStrings(raw?.andwellAdvantages),
    safeSalesLanguage: arrayOfStrings(raw?.safeSalesLanguage),
    doNotSayLanguage: arrayOfStrings(raw?.doNotSayLanguage),
    reviewRisks: arrayOfStrings(raw?.reviewRisks),
    leadershipSummary: safeText(raw?.leadershipSummary, 'AI leadership summary was not returned.'),
    salesBattlecards: Array.isArray(raw?.salesBattlecards) ? raw.salesBattlecards.slice(0, 30).map((item: any) => ({
      serviceLine: safeText(item?.serviceLine, 'Needs review'),
      leadWith: safeText(item?.leadWith, 'Lead with Andwell service depth.'),
      referralQuestion: safeText(item?.referralQuestion, 'What specific patient need are you trying to solve?'),
      objectionResponse: safeText(item?.objectionResponse, 'Acknowledge the relationship and pivot to the specific patient need.'),
      proofPoint: safeText(item?.proofPoint, 'Use approved evidence.'),
      safeSalesLanguage: safeText(item?.safeSalesLanguage, 'Use evidence based language.'),
      doNotSayLanguage: safeText(item?.doNotSayLanguage, 'Do not say the competitor does not offer a service unless confirmed by approved evidence.')
    })) : [],
    rawConfidence: ['High', 'Medium', 'Low'].includes(String(raw?.rawConfidence)) ? raw.rawConfidence : 'Low'
  };
}

function promptFor(input: CompetitorInput, pages: CrawledPage[]) {
  const catalog = andwellCatalog.map((service) => ({
    serviceLine: service.serviceLine,
    category: service.category,
    description: service.description,
    subservices: service.subservices,
    safeLanguage: service.safeLanguage,
    avoid: service.avoid
  }));

  const pageBundle = selectBestPromptPages(pages, maxPagesForPrompt, maxCharsPerPage);

  return `You are an expert healthcare competitive intelligence analyst for Andwell Health Partners.

Analyze the competitor's public website evidence and return ONLY valid compact JSON. Do not include markdown. Do not make unsupported claims. Keep every string concise.

Safety and compliance rules:
1. Use only the provided public website evidence.
2. Never say a competitor does not offer a service only because it was not found. Use "Not found publicly".
3. Separate clearly offered services from vague mentions, related but not equivalent language, and unclear evidence.
4. Create sales language that is safe, evidence based, and manager review friendly.
5. Compare at both service line and subservice level.
6. Prioritize pages with higher intelligenceScore when evidence conflicts.

Required JSON keys:
providerName, servicesMentioned, benefitsMentioned, claimsMade, programsOffered, proofPoints, referralCallsToAction, serviceLineDepth, subserviceDepth, competitorAdvantages, andwellAdvantages, safeSalesLanguage, doNotSayLanguage, reviewRisks, leadershipSummary, salesBattlecards, rawConfidence.

Competitor input:
${JSON.stringify({ name: providerName(input), url: input.url, market: input.market || 'Not provided', notes: input.notes || '' })}

Andwell service catalog:
${JSON.stringify(catalog)}

Competitor crawled pages, pre ranked by relevance:
${JSON.stringify(pageBundle)}

Return JSON in this exact shape:
{
  "providerName": "string",
  "servicesMentioned": ["string"],
  "benefitsMentioned": ["string"],
  "claimsMade": ["string"],
  "programsOffered": ["string"],
  "proofPoints": ["string"],
  "referralCallsToAction": ["string"],
  "serviceLineDepth": [
    {
      "serviceLine": "string",
      "depthScore": 0,
      "evidenceStrength": "Strong | Moderate | Weak | Not found",
      "summary": "string",
      "competitorAdvantages": ["string"],
      "andwellAdvantages": ["string"],
      "proofPoints": ["string"],
      "referralCallsToAction": ["string"],
      "reviewRisk": "Low | Medium | High"
    }
  ],
  "subserviceDepth": [
    {
      "serviceLine": "string",
      "subservice": "string",
      "status": "Clearly offered | Mentioned only | Related but not equivalent | Not found publicly | Unclear | Needs human review",
      "confidence": "High | Moderate | Low | Not found | Needs review",
      "evidenceExcerpt": "string",
      "sourceUrl": "string",
      "safeSalesLanguage": "string",
      "doNotSayLanguage": "string"
    }
  ],
  "competitorAdvantages": ["string"],
  "andwellAdvantages": ["string"],
  "safeSalesLanguage": ["string"],
  "doNotSayLanguage": ["string"],
  "reviewRisks": ["string"],
  "leadershipSummary": "string",
  "salesBattlecards": [
    {
      "serviceLine": "string",
      "leadWith": "string",
      "referralQuestion": "string",
      "objectionResponse": "string",
      "proofPoint": "string",
      "safeSalesLanguage": "string",
      "doNotSayLanguage": "string"
    }
  ],
  "rawConfidence": "High | Medium | Low"
}`;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error('OpenAI did not return parseable JSON.');
}

function compactError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error || 'Unknown error');
}

function isTlsTransportError(error: unknown) {
  const message = compactError(error).toLowerCase();
  return message.includes('ssl') || message.includes('tls') || message.includes('ssl3_read_bytes') || message.includes('alert internal error') || message.includes('econnreset') || message.includes('socket hang up');
}

async function callOpenAIWithFetch(apiKey: string, requestBody: OpenAIRequestBody) {
  const response = await fetch(`${openAIBaseUrl}/v1/responses`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI HTTP error through fetch: ${response.status} ${errorText.slice(0, 500)}`);
  }

  return response.json();
}

function callOpenAIWithNativeHttps(apiKey: string, requestBody: OpenAIRequestBody): Promise<any> {
  const endpoint = new URL(`${openAIBaseUrl}/v1/responses`);
  const body = JSON.stringify(requestBody);

  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: endpoint.protocol,
      hostname: endpoint.hostname,
      port: endpoint.port || 443,
      path: `${endpoint.pathname}${endpoint.search}`,
      method: 'POST',
      servername: endpoint.hostname,
      minVersion: 'TLSv1.2',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        accept: 'application/json'
      },
      timeout: openAITimeoutMs
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const statusCode = res.statusCode || 0;
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`OpenAI HTTP error through native HTTPS: ${statusCode} ${text.slice(0, 500)}`));
          return;
        }
        try {
          resolve(JSON.parse(text));
        } catch {
          reject(new Error(`OpenAI native HTTPS returned non JSON response: ${text.slice(0, 500)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error(`OpenAI request timed out after ${openAITimeoutMs}ms.`));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callOpenAI(apiKey: string, requestBody: OpenAIRequestBody) {
  try {
    return await callOpenAIWithFetch(apiKey, requestBody);
  } catch (fetchError) {
    if (!isTlsTransportError(fetchError)) throw fetchError;
    try {
      return await callOpenAIWithNativeHttps(apiKey, requestBody);
    } catch (nativeError) {
      throw new Error(`OpenAI TLS connection failed through fetch and native HTTPS fallback. Fetch error: ${compactError(fetchError)}. Native HTTPS error: ${compactError(nativeError)}. This usually means the hosting environment cannot complete an outbound TLS handshake to api.openai.com, or a proxy/firewall is interrupting TLS.`);
    }
  }
}

function outputTextFromPayload(payload: any) {
  return payload.output_text || payload.output?.flatMap((item: any) => item.content || []).map((content: any) => content.text || '').join('\n') || '';
}

export function isAIExtractionConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getAITransportDiagnostics() {
  return {
    configured: isAIExtractionConfigured(),
    model: defaultModel,
    baseUrlHost: (() => {
      try { return new URL(openAIBaseUrl).hostname; } catch { return 'invalid'; }
    })(),
    timeoutMs: openAITimeoutMs,
    maxPagesForPrompt,
    maxCharsPerPage,
    maxOutputTokens,
    promptPageSelection: 'smart relevance ranking',
    transport: 'fetch with native Node HTTPS TLS fallback'
  };
}

export async function extractCompetitorIntelligence(input: CompetitorInput, pages: CrawledPage[]): Promise<AICompetitorExtraction | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const payload = await callOpenAI(apiKey, {
    model: defaultModel,
    input: promptFor(input, pages),
    temperature: 0.2,
    max_output_tokens: maxOutputTokens
  });

  const outputText = outputTextFromPayload(payload);
  const parsed = extractJson(outputText);
  return normalizeExtraction({ ...parsed, aiModel: defaultModel }, input);
}
