'use client';

import { useEffect, useMemo, useState } from 'react';
import { andwellCatalog } from '@/lib/andwell';
import type { CompetitorInput, IntelligenceReport } from '@/lib/types';

type View = 'dashboard' | 'intake' | 'reports' | 'ask' | 'catalog' | 'diagnostics';
type ReportSummary = {
  id: string;
  generatedAt: string;
  competitorsAnalyzed: number;
  pagesReviewed: number;
  potentialAndwellAdvantages: number;
  humanReviewItems: number;
  competitors: string[];
  executiveSummary: string;
};

type ApiCheck = { route: string; ok: boolean; status: number; message: string; preview?: string };

function normalizeUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

function nameFromUrl(url: string) {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '').split('.')[0].replace(/\b\w/g, (letter) => letter.toUpperCase());
  } catch {
    return 'Competitor';
  }
}

function parseJsonSafely<T>(text: string, url: string): T {
  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<')) {
    throw new Error(`The request to ${url} returned HTML instead of JSON. Hostinger is serving a fallback page, stale build, or static site instead of the Node.js app. Open /api/version directly. If it is not JSON, Hostinger is not running server.js.`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`The request to ${url} did not return valid JSON. Response started with: ${text.slice(0, 160).replace(/\s+/g, ' ')}`);
  }
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: 'application/json',
      ...(options?.headers || {})
    },
    cache: 'no-store'
  });
  const text = await response.text();
  const data = parseJsonSafely<{ error?: string } & T>(text, url);
  if (!response.ok) throw new Error(data.error || `Request failed with status ${response.status}.`);
  return data;
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="card"><h3>{title}</h3>{children}</div>;
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
    findings: (currentReport?.allFindings?.length || 0) + (currentReport?.allSubserviceFindings?.length || 0)
  }), [competitors, reports, currentReport]);

  useEffect(() => {
    try {
      ['andwellReports', 'andwellReport', 'andwellCompetitiveReports', 'competitiveIntelligenceReports'].forEach((key) => {
        window.localStorage.removeItem(key);
        window.sessionStorage.removeItem(key);
      });
    } catch {}
    void refreshServerState();
  }, []);

  async function refreshServerState() {
    setError('');
    try {
      const competitorResponse = await api<{ competitors: CompetitorInput[] }>('/api/competitors');
      const reportResponse = await api<{ reports: ReportSummary[] }>('/api/reports');
      setCompetitors(competitorResponse.competitors || []);
      setReports(reportResponse.reports || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load server state.');
    }
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
      const response = await api<{ competitors: CompetitorInput[] }>('/api/competitors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ competitors })
      });
      setCompetitors(response.competitors || []);
      setNotice('Competitor library saved on the server.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save competitors.');
    } finally { setBusy(false); }
  }

  async function runAnalysis() {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!competitors.length) throw new Error('Add at least one competitor URL first.');
      const report = await api<IntelligenceReport>('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ competitors, maxPagesPerSite: 24, save: true })
      });
      setCurrentReport(report);
      setNotice('Analysis completed and saved on the server.');
      setView('dashboard');
      await refreshServerState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally { setBusy(false); }
  }

  async function loadReport(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api<{ report: IntelligenceReport }>(`/api/reports?id=${encodeURIComponent(id)}`);
      setCurrentReport(response.report);
      setNotice('Stored report loaded.');
      setView('dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load report.');
    } finally { setBusy(false); }
  }

  async function askHub() {
    setBusy(true); setError(''); setAnswer('');
    try {
      const response = await api<{ answer: string }>('/api/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, reportId: currentReport?.id })
      });
      setAnswer(response.answer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask the Hub failed.');
    } finally { setBusy(false); }
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
        results.push({ route, ok: response.ok && !isHtml, status: response.status, message: isHtml ? 'Returned HTML instead of JSON' : 'Returned JSON or text', preview: text.slice(0, 120).replace(/\s+/g, ' ') });
      } catch (err) {
        results.push({ route, ok: false, status: 0, message: err instanceof Error ? err.message : 'Request failed' });
      }
    }
    setDiagnostics(results);
    setBusy(false);
  }

  function exportJson() {
    if (!currentReport) return;
    const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'andwell-competitive-intelligence-report.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  return <div className="shell">
    <aside className="side">
      <div className="brand"><h1>Andwell Advantage Intelligence Hub</h1><p>Server backed competitive intelligence for service line, subservice, evidence, and sales positioning.</p></div>
      <nav className="nav">
        {(['dashboard','intake','reports','ask','catalog','diagnostics'] as View[]).map((item) => <button key={item} className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item === 'ask' ? 'Ask the Hub' : item[0].toUpperCase() + item.slice(1)}</button>)}
      </nav>
    </aside>
    <main className="main">
      <header className="head"><div><small>Production Version</small><h2>Competitive Intelligence Hub</h2></div><div className="row"><button className="btn" onClick={refreshServerState}>Refresh</button><button className="btn" onClick={() => setView('diagnostics')}>Diagnostics</button></div></header>
      <div className="content">
        {error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}
        {notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}

        {view === 'dashboard' && <>
          <section className="section"><div><h1>Command Center</h1><p>Leadership snapshot of the current competitive intelligence state.</p></div><button className="btn primary" onClick={() => setView('intake')}>Add competitors</button></section>
          <div className="grid cols4">
            <Panel title="Competitors"><div className="kpi">{stats.competitors}</div></Panel>
            <Panel title="Stored Reports"><div className="kpi">{stats.reports}</div></Panel>
            <Panel title="Service Lines"><div className="kpi">{stats.serviceLines}</div></Panel>
            <Panel title="Subservices"><div className="kpi">{stats.subservices}</div></Panel>
          </div>
          {currentReport ? <div className="hero"><h2>Executive Summary</h2><p>{currentReport.executiveSummary}</p><div className="row"><Badge>{currentReport.pagesReviewed} pages reviewed</Badge><Badge>{stats.findings} findings</Badge><button className="btn" onClick={exportJson}>Export JSON</button></div></div> : <div className="notice" style={{ marginTop: 16 }}>Load a stored report or run a new analysis.</div>}
          {currentReport?.competitorScores?.length ? <Panel title="Competitor Scores"><div className="grid cols2">{currentReport.competitorScores.map((score) => <div className="scoreCard" key={score.competitorId}><h3>{score.competitorName}</h3><p>{score.executiveReadout}</p><Badge>{score.threatLevel}</Badge></div>)}</div></Panel> : null}
        </>}

        {view === 'intake' && <>
          <section className="section"><div><h1>Competitor Intake</h1><p>Paste up to 25 competitor URLs. Reports are saved on the server, not in browser storage.</p></div></section>
          <Panel title="Add Competitors"><textarea className="textarea" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="https://competitorone.org\nhttps://competitortwo.org" /><div className="row" style={{ marginTop: 12 }}><button className="btn" onClick={addUrls}>Add URLs</button><button className="btn" disabled={busy} onClick={saveCompetitors}>Save Library</button><button className="btn primary" disabled={busy} onClick={runAnalysis}>{busy ? 'Working' : 'Run Analysis'}</button></div></Panel>
          <div className="grid cols2" style={{ marginTop: 16 }}>{competitors.map((competitor, index) => <Panel key={`${competitor.url}${index}`} title={competitor.name || 'Competitor'}><p>{competitor.url}</p><button className="btn danger" onClick={() => setCompetitors(competitors.filter((_, i) => i !== index))}>Remove</button></Panel>)}</div>
        </>}

        {view === 'reports' && <>
          <section className="section"><div><h1>Reports</h1><p>Load stored server side reports. No full reports are stored in localStorage.</p></div></section>
          <div className="grid">{reports.map((report) => <Panel key={report.id} title={report.competitors?.join(', ') || 'Stored report'}><p>{new Date(report.generatedAt).toLocaleString()} | {report.pagesReviewed} pages | {report.humanReviewItems} review items</p><p>{report.executiveSummary}</p><button className="btn primary" disabled={busy} onClick={() => loadReport(report.id)}>Load Report</button></Panel>)}</div>
        </>}

        {view === 'ask' && <>
          <section className="section"><div><h1>Ask the Hub</h1><p>Ask questions against the latest stored intelligence report.</p></div></section>
          <Panel title="Question"><textarea className="textarea" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What does Andwell offer that this competitor does not clearly promote?" /><button className="btn primary" style={{ marginTop: 12 }} disabled={busy || !question.trim()} onClick={askHub}>Ask</button></Panel>
          {answer && <div className="hero"><h2>Answer</h2><p>{answer}</p></div>}
        </>}

        {view === 'catalog' && <>
          <section className="section"><div><h1>Andwell Catalog</h1><p>Baseline Andwell services and subservices used for comparison.</p></div></section>
          <div className="grid cols2">{andwellCatalog.map((service) => <Panel key={service.serviceLine} title={service.serviceLine}><p>{service.description}</p><div className="row">{service.subservices.slice(0, 12).map((item) => <Badge key={item}>{item}</Badge>)}</div></Panel>)}</div>
        </>}

        {view === 'diagnostics' && <>
          <section className="section"><div><h1>Diagnostics</h1><p>Use this to prove whether Hostinger is returning JSON or HTML for API routes.</p></div><button className="btn primary" disabled={busy} onClick={runDiagnostics}>Run Diagnostics</button></section>
          <div className="grid">{diagnostics.map((item) => <Panel key={item.route} title={item.route}><div className="row"><Badge>{item.ok ? 'OK' : 'Problem'}</Badge><Badge>{item.status}</Badge></div><p>{item.message}</p><p className="muted">{item.preview}</p></Panel>)}</div>
        </>}
      </div>
    </main>
  </div>;
}
