'use client';

import { useEffect, useMemo, useState } from 'react';
import { andwellCatalog } from '@/lib/andwell';
import { expertPromptModules, fullCompetitiveIntelligenceInstruction } from '@/lib/expert-prompts';
import type { CompetitorInput, IntelligenceReport } from '@/lib/types';

type View = 'dashboard' | 'prompt' | 'intake' | 'matrix' | 'battlecards' | 'reports' | 'ask' | 'catalog' | 'diagnostics';
type ReportSummary = { id: string; generatedAt: string; competitorsAnalyzed: number; pagesReviewed: number; potentialAndwellAdvantages: number; humanReviewItems: number; competitors: string[]; executiveSummary: string };
type ApiCheck = { route: string; ok: boolean; status: number; message: string; preview?: string };

const nav: { key: View; label: string; note: string }[] = [
  { key: 'dashboard', label: 'Command Center', note: 'CEO and leader view' },
  { key: 'prompt', label: 'Prompt Engine', note: 'Expert instructions' },
  { key: 'intake', label: 'Competitor Intake', note: 'Add up to 25 URLs' },
  { key: 'matrix', label: 'Comparison Matrix', note: 'Service and subservice view' },
  { key: 'battlecards', label: 'Battlecards', note: 'Sales ready guidance' },
  { key: 'reports', label: 'Reports', note: 'Stored intelligence' },
  { key: 'ask', label: 'Ask the Hub', note: 'Ask against evidence' },
  { key: 'catalog', label: 'Andwell Catalog', note: 'Baseline service truth' },
  { key: 'diagnostics', label: 'Diagnostics', note: 'Deployment proof' }
];

function normalizeUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

function nameFromUrl(url: string) {
  try { return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '').split('.')[0].replace(/\b\w/g, (letter) => letter.toUpperCase()); } catch { return 'Competitor'; }
}

function parseJsonSafely<T>(text: string, url: string): T {
  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
    throw new Error(`The request to ${url} returned HTML instead of JSON. Hostinger is serving a fallback page, stale build, or static site instead of the Node.js server. Open /api/version directly. If it is not JSON, Hostinger is not running server.js.`);
  }
  try { return JSON.parse(text) as T; } catch { throw new Error(`The request to ${url} did not return valid JSON. Response started with: ${text.slice(0, 160).replace(/\s+/g, ' ')}`); }
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { accept: 'application/json', ...(options?.headers || {}) }, cache: 'no-store' });
  const text = await response.text();
  const data = parseJsonSafely<{ error?: string } & T>(text, url);
  if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}.`);
  return data;
}

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'red' | 'blue' | 'dark' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return <div className={`card ${className}`}><h3>{title}</h3>{children}</div>;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return <div className="metricCard"><p>{label}</p><strong>{value}</strong>{hint ? <span>{hint}</span> : null}</div>;
}

export default function Page() {
  const [view, setView] = useState<View>('dashboard');
  const [competitors, setCompetitors] = useState<CompetitorInput[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [currentReport, setCurrentReport] = useState<IntelligenceReport | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [diagnostics, setDiagnostics] = useState<ApiCheck[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const stats = useMemo(() => ({
    competitors: competitors.length,
    reports: reports.length,
    serviceLines: andwellCatalog.length,
    subservices: andwellCatalog.reduce((sum, service) => sum + service.subservices.length, 0),
    pages: currentReport?.pagesReviewed || 0,
    serviceFindings: currentReport?.allFindings?.length || 0,
    subserviceFindings: currentReport?.allSubserviceFindings?.length || 0,
    reviewItems: currentReport?.humanReviewItems || 0
  }), [competitors, reports, currentReport]);

  useEffect(() => {
    try { ['andwellReports', 'andwellReport', 'andwellCompetitiveReports', 'competitiveIntelligenceReports'].forEach((key) => { window.localStorage.removeItem(key); window.sessionStorage.removeItem(key); }); } catch {}
    void refreshServerState();
  }, []);

  async function refreshServerState() {
    setError('');
    try {
      const competitorResponse = await api<{ competitors: CompetitorInput[] }>('/api/competitors');
      const reportResponse = await api<{ reports: ReportSummary[] }>('/api/reports');
      setCompetitors(competitorResponse.competitors || []);
      setReports(reportResponse.reports || []);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load server state.'); }
  }

  function addUrls() {
    const urls = urlInput.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    const next = urls.slice(0, Math.max(0, 25 - competitors.length)).map((url) => ({ name: nameFromUrl(url), url: normalizeUrl(url), market: 'Needs review' }));
    setCompetitors((current) => [...current, ...next]);
    setUrlInput('');
  }

  async function saveCompetitors() {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api<{ competitors: CompetitorInput[] }>('/api/competitors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ competitors }) });
      setCompetitors(response.competitors || []);
      setNotice('Competitor library saved on the server.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save competitors.'); } finally { setBusy(false); }
  }

  async function runAnalysis() {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!competitors.length) throw new Error('Add at least one competitor URL first.');
      const report = await api<IntelligenceReport>('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ competitors, maxPagesPerSite: 24, save: true }) });
      setCurrentReport(report);
      setNotice('Analysis completed and saved on the server.');
      setView('dashboard');
      await refreshServerState();
    } catch (err) { setError(err instanceof Error ? err.message : 'Analysis failed.'); } finally { setBusy(false); }
  }

  async function loadReport(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api<{ report: IntelligenceReport }>(`/api/reports?id=${encodeURIComponent(id)}`);
      setCurrentReport(response.report);
      setNotice('Stored report loaded.');
      setView('dashboard');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load report.'); } finally { setBusy(false); }
  }

  async function askHub() {
    setBusy(true); setError(''); setAnswer('');
    try {
      const response = await api<{ answer: string }>('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, reportId: currentReport?.id }) });
      setAnswer(response.answer);
    } catch (err) { setError(err instanceof Error ? err.message : 'Ask the Hub failed.'); } finally { setBusy(false); }
  }

  async function runDiagnostics() {
    setBusy(true); setError(''); setDiagnostics([]);
    const routes = ['/api/version', '/api/health', '/api/diagnostics', '/api/analyze', '/api/competitors', '/api/reports', '/api/reviews', '/api/catalog', '/api/ask'];
    const results: ApiCheck[] = [];
    for (const route of routes) {
      try {
        const response = await fetch(route, { headers: { accept: 'application/json' }, cache: 'no-store' });
        const text = await response.text();
        const isHtml = text.trim().startsWith('<');
        results.push({ route, ok: response.ok && !isHtml, status: response.status, message: isHtml ? 'Returned HTML instead of JSON' : 'Returned JSON or text', preview: text.slice(0, 150).replace(/\s+/g, ' ') });
      } catch (err) { results.push({ route, ok: false, status: 0, message: err instanceof Error ? err.message : 'Request failed' }); }
    }
    setDiagnostics(results); setBusy(false);
  }

  function exportJson() {
    if (!currentReport) return;
    const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'andwell-competitive-intelligence-report.json'; link.click(); URL.revokeObjectURL(url);
  }

  return <div className="shell proShell">
    <aside className="side proSide">
      <div className="brand proBrand"><p>Andwell Advantage</p><h1>Competitive Intelligence Hub</h1><span>Professional healthcare service line intelligence</span></div>
      <nav className="nav proNav">{nav.map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}><strong>{item.label}</strong><small>{item.note}</small></button>)}</nav>
    </aside>
    <main className="main proMain">
      <header className="head proHead"><div><small>Production App</small><h2>{nav.find((item) => item.key === view)?.label || 'Competitive Intelligence Hub'}</h2></div><div className="row"><button className="btn" onClick={refreshServerState}>Refresh</button><button className="btn" onClick={() => setView('diagnostics')}>Diagnostics</button></div></header>
      <div className="content proContent">
        {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}
        {notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}
        {view === 'dashboard' && <Dashboard stats={stats} currentReport={currentReport} setView={setView} exportJson={exportJson} />}
        {view === 'prompt' && <PromptEngine />}
        {view === 'intake' && <Intake competitors={competitors} setCompetitors={setCompetitors} urlInput={urlInput} setUrlInput={setUrlInput} addUrls={addUrls} saveCompetitors={saveCompetitors} runAnalysis={runAnalysis} busy={busy} />}
        {view === 'matrix' && <Matrix currentReport={currentReport} />}
        {view === 'battlecards' && <Battlecards currentReport={currentReport} />}
        {view === 'reports' && <Reports reports={reports} currentReport={currentReport} loadReport={loadReport} exportJson={exportJson} busy={busy} />}
        {view === 'ask' && <AskHub question={question} setQuestion={setQuestion} askHub={askHub} answer={answer} busy={busy} currentReport={currentReport} />}
        {view === 'catalog' && <Catalog />}
        {view === 'diagnostics' && <Diagnostics diagnostics={diagnostics} runDiagnostics={runDiagnostics} busy={busy} />}
      </div>
    </main>
  </div>;
}

function Dashboard({ stats, currentReport, setView, exportJson }: { stats: Record<string, number>; currentReport: IntelligenceReport | null; setView: (view: View) => void; exportJson: () => void }) {
  return <>
    <section className="hero proHero"><Badge tone="dark">Executive ready</Badge><h1>See what Andwell does, what competitors publicly say they do, where Andwell appears stronger, and what sales can safely say.</h1><p>This hub is designed for CEOs, COOs, sales leaders, managers, and reps. It connects website evidence, Andwell service depth, competitor claims, review governance, and sales positioning in one workflow.</p><div className="row"><button className="btn primary" onClick={() => setView('intake')}>Run competitor analysis</button><button className="btn" onClick={() => setView('prompt')}>Review prompt engine</button></div></section>
    <div className="grid cols4"><Stat label="Competitors" value={stats.competitors} hint="Saved library" /><Stat label="Stored reports" value={stats.reports} hint="Server side" /><Stat label="Service lines" value={stats.serviceLines} hint="Andwell baseline" /><Stat label="Subservices" value={stats.subservices} hint="Capability depth" /></div>
    {currentReport ? <Panel title="Current Executive Summary" className="featurePanel"><p>{currentReport.executiveSummary}</p><div className="row"><Badge>{currentReport.pagesReviewed} pages reviewed</Badge><Badge>{stats.serviceFindings} service findings</Badge><Badge>{stats.subserviceFindings} subservice findings</Badge><Badge>{stats.reviewItems} review items</Badge><button className="btn" onClick={exportJson}>Export JSON</button></div></Panel> : <Panel title="No report loaded yet"><p>Load a stored report or run a new analysis. The app stores reports on the server, not in browser storage.</p></Panel>}
    {currentReport?.competitorScores?.length ? <Panel title="Competitor Intelligence Scoreboard"><div className="grid cols2">{currentReport.competitorScores.map((score) => <div className="scoreCard proScore" key={score.competitorId}><div className="row spread"><h3>{score.competitorName}</h3><Badge tone={score.threatLevel === 'Strategic threat' ? 'red' : 'amber'}>{score.threatLevel}</Badge></div><p>{score.executiveReadout}</p><div className="scoreGrid"><Stat label="Overlap" value={`${score.serviceLineMatchScore}%`} /><Stat label="Depth" value={`${score.subserviceDepthScore}%`} /><Stat label="Andwell advantage" value={`${score.andwellDifferentiationScore}%`} /><Stat label="Review risk" value={`${score.reviewRiskScore}%`} /></div></div>)}</div></Panel> : null}
  </>;
}

function PromptEngine() {
  return <>
    <section className="section"><div><h1>Expert Prompt Engine</h1><p>The full instruction layer that tells the app how to think like a healthcare competitive intelligence analyst, not a generic website scraper.</p></div><Badge tone="blue">Governed intelligence</Badge></section>
    <Panel title="Master Intelligence Instruction" className="featurePanel"><p>{fullCompetitiveIntelligenceInstruction}</p></Panel>
    <div className="grid cols2">{expertPromptModules.map((module) => <div className="promptCard" key={module.id}><Badge tone="dark">{module.id}</Badge><h3>{module.title}</h3><p>{module.purpose}</p><div className="promptBlock"><strong>Instructions</strong>{module.instructions.map((item) => <span key={item}>{item}</span>)}</div><div className="promptBlock output"><strong>Required output</strong>{module.requiredOutput.map((item) => <span key={item}>{item}</span>)}</div></div>)}</div>
  </>;
}

function Intake({ competitors, setCompetitors, urlInput, setUrlInput, addUrls, saveCompetitors, runAnalysis, busy }: { competitors: CompetitorInput[]; setCompetitors: (items: CompetitorInput[]) => void; urlInput: string; setUrlInput: (value: string) => void; addUrls: () => void; saveCompetitors: () => void; runAnalysis: () => void; busy: boolean }) {
  return <><section className="section"><div><h1>Competitor Intake</h1><p>Paste up to 25 competitor websites. The app saves the competitor library, crawls public pages, and creates service line and subservice findings.</p></div><Badge>{competitors.length} of 25 selected</Badge></section><Panel title="Add Competitor URLs"><textarea className="textarea largeInput" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="https://competitorone.org\nhttps://competitortwo.org" /><div className="row"><button className="btn" onClick={addUrls}>Add URLs</button><button className="btn" disabled={busy} onClick={saveCompetitors}>Save library</button><button className="btn primary" disabled={busy} onClick={runAnalysis}>{busy ? 'Working' : 'Run and save intelligence report'}</button></div></Panel><div className="grid cols2">{competitors.map((competitor, index) => <Panel key={`${competitor.url}${index}`} title={competitor.name || 'Competitor'}><p>{competitor.url}</p><Badge>{competitor.market || 'Needs review'}</Badge><br /><button className="btn danger" onClick={() => setCompetitors(competitors.filter((_, i) => i !== index))}>Remove</button></Panel>)}</div></>;
}

function Matrix({ currentReport }: { currentReport: IntelligenceReport | null }) {
  const findings = currentReport?.allFindings || [];
  return <><section className="section"><div><h1>Comparison Matrix</h1><p>Service line and subservice level comparison using public evidence language and review safeguards.</p></div></section>{!currentReport ? <Panel title="No report loaded"><p>Run or load a report to populate the matrix.</p></Panel> : <div className="tableWrap proTable"><table><thead><tr><th>Competitor</th><th>Service line</th><th>Status</th><th>Depth</th><th>Safe sales wording</th></tr></thead><tbody>{findings.map((finding) => <tr key={finding.id}><td>{finding.competitorName}</td><td><strong>{finding.serviceLine}</strong></td><td><Badge>{finding.competitorStatus}</Badge></td><td>{finding.subserviceDepthScore}%</td><td>{finding.safeSalesWording}</td></tr>)}</tbody></table></div>}</>;
}

function Battlecards({ currentReport }: { currentReport: IntelligenceReport | null }) {
  return <><section className="section"><div><h1>Battlecards</h1><p>Field usable positioning by competitor. Built from evidence, safe language, and review status.</p></div></section>{!currentReport ? <Panel title="No report loaded"><p>Run or load a report to generate battlecards.</p></Panel> : <div className="grid cols2">{currentReport.analyses.map((analysis) => <div className="battleCard" key={analysis.id}><div className="row spread"><h3>{analysis.name}</h3><Badge tone={analysis.score.threatLevel === 'Strategic threat' ? 'red' : 'amber'}>{analysis.score.threatLevel}</Badge></div><p>{analysis.score.executiveReadout}</p><div className="battleSection"><strong>Lead with</strong>{analysis.score.leadWith.map((item) => <span key={item}>{item}</span>)}</div><div className="battleSection"><strong>Needs review</strong>{analysis.score.needsReview.length ? analysis.score.needsReview.map((item) => <span key={item}>{item}</span>) : <span>No major review flags</span>}</div><div className="notice"><strong>Field rule</strong><br />Do not say they do not offer a service. Use not found publicly unless approved evidence confirms otherwise.</div></div>)}</div>}</>;
}

function Reports({ reports, currentReport, loadReport, exportJson, busy }: { reports: ReportSummary[]; currentReport: IntelligenceReport | null; loadReport: (id: string) => void; exportJson: () => void; busy: boolean }) {
  return <><section className="section"><div><h1>Reports</h1><p>Stored server side reports and exportable intelligence summaries.</p></div><button className="btn" disabled={!currentReport} onClick={exportJson}>Export current JSON</button></section><div className="grid">{reports.map((report) => <Panel key={report.id} title={report.competitors?.join(', ') || 'Stored report'}><p>{new Date(report.generatedAt).toLocaleString()} | {report.pagesReviewed} pages | {report.humanReviewItems} review items</p><p>{report.executiveSummary}</p><button className="btn primary" disabled={busy} onClick={() => loadReport(report.id)}>Load report</button></Panel>)}</div></>;
}

function AskHub({ question, setQuestion, askHub, answer, busy, currentReport }: { question: string; setQuestion: (value: string) => void; askHub: () => void; answer: string; busy: boolean; currentReport: IntelligenceReport | null }) {
  return <><section className="section"><div><h1>Ask the Hub</h1><p>Ask plain English questions against the latest stored intelligence report.</p></div><Badge tone={currentReport ? 'green' : 'amber'}>{currentReport ? 'Report loaded' : 'No report loaded'}</Badge></section><Panel title="Ask a competitive question"><textarea className="textarea largeInput" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What does Andwell offer that this competitor does not clearly promote?" /><button className="btn primary" disabled={busy || !question.trim()} onClick={askHub}>Ask the Hub</button></Panel>{answer ? <section className="hero answerHero"><h2>Answer</h2><p>{answer}</p></section> : null}</>;
}

function Catalog() {
  return <><section className="section"><div><h1>Andwell Catalog</h1><p>Approved baseline service catalog with subservice capability depth.</p></div></section><div className="grid cols2">{andwellCatalog.map((service) => <div className="catalogCard" key={service.serviceLine}><Badge>{service.category}</Badge><h3>{service.serviceLine}</h3><p>{service.description}</p><div className="tagCloud">{service.subservices.slice(0, 18).map((item) => <span key={item}>{item}</span>)}{service.subservices.length > 18 ? <span>More {service.subservices.length - 18}</span> : null}</div><div className="notice"><strong>Safe language</strong><br />{service.safeLanguage}</div><div className="error"><strong>Avoid saying</strong><br />{service.avoid}</div></div>)}</div></>;
}

function Diagnostics({ diagnostics, runDiagnostics, busy }: { diagnostics: ApiCheck[]; runDiagnostics: () => void; busy: boolean }) {
  return <><section className="section"><div><h1>Diagnostics</h1><p>Confirms whether Hostinger is returning JSON or HTML for API routes.</p></div><button className="btn primary" disabled={busy} onClick={runDiagnostics}>Run diagnostics</button></section><div className="grid">{diagnostics.map((item) => <Panel key={item.route} title={item.route}><div className="row"><Badge tone={item.ok ? 'green' : 'red'}>{item.ok ? 'OK' : 'Problem'}</Badge><Badge>{item.status}</Badge></div><p>{item.message}</p><p className="muted">{item.preview}</p></Panel>)}</div></>;
}
