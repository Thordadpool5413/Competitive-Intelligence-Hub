const { createServer } = require('http');
const { mkdir, readFile, writeFile } = require('fs/promises');
const path = require('path');
const next = require('next');

const port = Number.parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOST || '0.0.0.0';
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const dataDir = process.env.CIH_DATA_DIR || path.join(process.cwd(), '.data');
const storeFile = process.env.CIH_STORE_FILE || path.join(dataDir, 'competitive-intelligence-hub.json');

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.statusCode = statusCode;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });
  try {
    const raw = await readFile(storeFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    const initial = {
      version: 2,
      updatedAt: new Date().toISOString(),
      competitors: [],
      reports: [],
      reviews: [],
      catalogOverrides: []
    };
    await writeFile(storeFile, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
}

async function writeStore(store) {
  await mkdir(dataDir, { recursive: true });
  const next = { ...store, updatedAt: new Date().toISOString() };
  await writeFile(storeFile, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function normalizeUrl(url) {
  if (!url) return '';
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

function nameFromUrl(url) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '').split('.')[0].replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Competitor';
  }
}

function fallbackReport(competitors, crawlErrors = []) {
  const now = new Date().toISOString();
  const analyses = competitors.map((competitor, index) => {
    const name = competitor.name || nameFromUrl(competitor.url);
    return {
      id: `fallback_competitor_${Date.now()}_${index}`,
      name,
      url: normalizeUrl(competitor.url),
      market: competitor.market || 'Not provided',
      analyzedAt: now,
      pagesReviewed: [{
        url: normalizeUrl(competitor.url),
        title: 'Server fallback analysis notice',
        text: '',
        excerpt: 'The direct Node fallback responded with JSON. If this appears instead of full findings, redeploy the Next.js app and confirm Hostinger is running npm start against server.js.'
      }],
      findings: [],
      subserviceFindings: [],
      score: {
        competitorId: `fallback_competitor_${Date.now()}_${index}`,
        competitorName: name,
        serviceLineMatchScore: 0,
        subserviceDepthScore: 0,
        andwellDifferentiationScore: 0,
        competitorVisibilityScore: 0,
        evidenceStrengthScore: 0,
        reviewRiskScore: 100,
        threatLevel: 'Low overlap',
        strongestMatches: [],
        strongestAndwellAdvantages: [],
        needsReview: ['Next.js analyze route needs redeploy or routing verification'],
        leadWith: ['Verify deployment routing before sales use'],
        executiveReadout: `${name} was not fully analyzed because the direct Node fallback handled /api/analyze. Redeploy the Next.js app and confirm API routes return JSON.`
      }
    };
  });

  return {
    id: `fallback_report_${Date.now()}`,
    generatedAt: now,
    baselineProvider: 'Andwell Health Partners',
    competitorsAnalyzed: competitors.length,
    pagesReviewed: competitors.length,
    serviceLinesMapped: 0,
    subservicesMapped: 0,
    matchedServiceFindings: 0,
    potentialAndwellAdvantages: 0,
    humanReviewItems: competitors.length,
    executiveSummary: 'The direct Node fallback returned JSON successfully, which prevents the browser from receiving an HTML error page. Full intelligence findings require the Next.js API routes to be served by Hostinger after redeploy.',
    executiveInsights: [{
      title: 'Deployment routing check needed',
      priority: 'High',
      audience: 'Admin',
      summary: 'The server fallback handled the request. This confirms Node is responding with JSON, but the full Next.js analysis route should be verified.',
      action: 'Redeploy from GitHub, run npm install && npm run build, start with npm start, then test /api/diagnostics and /api/analyze.'
    }],
    competitorScores: analyses.map((analysis) => analysis.score),
    analyses,
    allFindings: [],
    allSubserviceFindings: [],
    crawlErrors
  };
}

async function handleFallbackApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (pathname === '/api/health' || pathname === '/api/diagnostics' || pathname === '/api/analyze/status') {
    return sendJson(res, 200, {
      ok: true,
      route: pathname,
      servedBy: 'server.js direct JSON fallback',
      message: 'Node server is running and returning JSON.',
      checkedAt: new Date().toISOString()
    });
  }

  if (pathname === '/api/analyze' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      route: '/api/analyze',
      servedBy: 'server.js direct JSON fallback',
      message: 'Analyze endpoint is reachable. POST competitor URLs to run analysis. If fallback handles POST, redeploy Next.js API routes for full findings.',
      checkedAt: new Date().toISOString()
    });
  }

  if (pathname === '/api/competitors') {
    const store = await ensureStore();
    if (req.method === 'POST') {
      const body = await readBody(req);
      const competitors = (body.competitors || [])
        .filter((competitor) => competitor.url)
        .map((competitor) => ({ ...competitor, url: normalizeUrl(competitor.url) }));
      const byUrl = new Map();
      [...(store.competitors || []), ...competitors].forEach((competitor) => byUrl.set(competitor.url, competitor));
      store.competitors = [...byUrl.values()].slice(0, 500);
      await writeStore(store);
    }
    return sendJson(res, 200, { competitors: store.competitors || [] });
  }

  if (pathname === '/api/reports') {
    const store = await ensureStore();
    const id = url.searchParams.get('id');
    if (id) {
      const report = (store.reports || []).find((item) => item.id === id);
      if (!report) return sendJson(res, 404, { error: 'Report not found.' });
      return sendJson(res, 200, { report });
    }
    return sendJson(res, 200, {
      reports: (store.reports || []).map((report) => ({
        id: report.id,
        generatedAt: report.generatedAt,
        competitorsAnalyzed: report.competitorsAnalyzed,
        pagesReviewed: report.pagesReviewed,
        serviceLinesMapped: report.serviceLinesMapped,
        subservicesMapped: report.subservicesMapped,
        matchedServiceFindings: report.matchedServiceFindings,
        potentialAndwellAdvantages: report.potentialAndwellAdvantages,
        humanReviewItems: report.humanReviewItems,
        competitors: (report.analyses || []).map((analysis) => analysis.name),
        executiveSummary: report.executiveSummary
      }))
    });
  }

  if (pathname === '/api/reviews') {
    const store = await ensureStore();
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body.findingId || !body.status) return sendJson(res, 400, { error: 'findingId and status are required.' });
      const review = {
        id: body.id || `review_${Date.now()}`,
        findingId: body.findingId,
        status: body.status,
        note: body.note,
        reviewer: body.reviewer || 'User',
        updatedAt: new Date().toISOString()
      };
      store.reviews = [review, ...(store.reviews || []).filter((item) => item.findingId !== review.findingId)].slice(0, 10000);
      await writeStore(store);
      return sendJson(res, 200, { review });
    }
    return sendJson(res, 200, { reviews: store.reviews || [] });
  }

  if (pathname === '/api/catalog') {
    const store = await ensureStore();
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!body.serviceLine) return sendJson(res, 400, { error: 'serviceLine is required.' });
      const override = { ...body, updatedAt: new Date().toISOString() };
      store.catalogOverrides = [override, ...(store.catalogOverrides || []).filter((item) => item.serviceLine !== body.serviceLine)];
      await writeStore(store);
      return sendJson(res, 200, { override });
    }
    return sendJson(res, 200, { catalog: [], overrides: store.catalogOverrides || [], servedBy: 'server.js direct JSON fallback' });
  }

  if (pathname === '/api/ask') {
    if (req.method === 'GET') return sendJson(res, 200, { ok: true, route: '/api/ask', message: 'Ask the Hub endpoint is reachable.' });
    const store = await ensureStore();
    const latest = (store.reports || [])[0];
    if (!latest) return sendJson(res, 200, { answer: 'No stored intelligence report was found yet. Run an analysis first.', evidence: [], confidence: 'Needs review' });
    return sendJson(res, 200, {
      answer: latest.executiveSummary || 'Stored report found. Use Reports to load the full report.',
      confidence: 'Evidence backed from stored report',
      reportId: latest.id,
      evidence: []
    });
  }

  if (pathname === '/api/analyze' && req.method === 'POST') {
    const store = await ensureStore();
    const body = await readBody(req);
    const competitors = (body.competitors || [])
      .filter((competitor) => competitor.url)
      .slice(0, 25)
      .map((competitor) => ({ ...competitor, url: normalizeUrl(competitor.url) }));
    if (!competitors.length) return sendJson(res, 400, { error: 'Add at least one competitor URL.' });
    const report = fallbackReport(competitors, [{ url: '/api/analyze', error: 'server.js fallback handled analysis request. Full Next route did not handle this request before fallback.' }]);
    store.reports = [report, ...(store.reports || []).filter((item) => item.id !== report.id)].slice(0, 100);
    const byUrl = new Map();
    [...(store.competitors || []), ...competitors].forEach((competitor) => byUrl.set(competitor.url, competitor));
    store.competitors = [...byUrl.values()].slice(0, 500);
    await writeStore(store);
    return sendJson(res, 200, report);
  }

  return false;
}

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      if (req.url && req.url.startsWith('/api/')) {
        const handled = await handleFallbackApi(req, res);
        if (handled !== false) return;
      }
      return handle(req, res);
    } catch (error) {
      if (req.url && req.url.startsWith('/api/')) {
        return sendJson(res, 500, {
          error: error instanceof Error ? error.message : 'Unknown server error',
          servedBy: 'server.js direct JSON error handler'
        });
      }
      res.statusCode = 500;
      res.end('Server error');
    }
  }).listen(port, hostname, () => {
    console.log(`Competitive Intelligence Hub running on ${hostname}:${port}`);
  });
});
