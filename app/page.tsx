'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { andwellCatalog, referralAudiences } from '@/lib/andwell';
import type { CompetitorInput, CompetitorScore, Finding, IntelligenceReport, SubserviceFinding } from '@/lib/types';

type View = 'dashboard' | 'ask' | 'intake' | 'profiles' | 'services' | 'subservices' | 'gaps' | 'battlecards' | 'talktracks' | 'evidence' | 'review' | 'reports' | 'catalog';
type EvidenceItem = Finding | SubserviceFinding;
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
type ReviewRecord = { findingId: string; status: string; note?: string; reviewer?: string; updatedAt: string };
type AskEvidence = { competitorName: string; serviceLine: string; subservice?: string | null; status: string; confidence: string; sourceUrl?: string; evidenceExcerpt: string; safeSalesWording: string; reviewStatus: string };

const views: { key: View; label: string }[] = [
  { key: 'dashboard', label: 'Command Center' },
  { key: 'ask', label: 'Ask the Hub' },
  { key: 'intake', label: 'Competitor Intake' },
  { key: 'profiles', label: 'Competitor Profiles' },
  { key: 'services', label: 'Service Matrix' },
  { key: 'subservices', label: 'Subservice Matrix' },
  { key: 'gaps', label: 'Gap Finder' },
  { key: 'battlecards', label: 'Battlecards' },
  { key: 'talktracks', label: 'Talk Tracks' },
  { key: 'evidence', label: 'Evidence Library' },
  { key: 'review', label: 'Review Center' },
  { key: 'reports', label: 'Reports' },
  { key: 'catalog', label: 'Andwell Catalog' }
];

const statusClass: Record<string, string> = {
  'Clearly offered': 'badge green',
  'Mentioned only': 'badge amber',
  'Related but not equivalent': 'badge blue',
  'Not found publicly': 'badge',
  Unclear: 'badge purple',
  'Needs human review': 'badge red'
};

const confidenceClass: Record<string, string> = {
  High: 'badge green',
  Moderate: 'badge amber',
  Low: 'badge red',
  'Not found': 'badge',
  'Needs review': 'badge purple'
};

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

function isSubservice(item: EvidenceItem): item is SubserviceFinding {
  return 'subservice' in item;
}

function sectionTitle(item: EvidenceItem) {
  return isSubservice(item) ? `${item.serviceLine}: ${item.subservice}` : item.serviceLine;
}

function Badge({ text, className = 'badge' }: { text: string | number; className?: string }) {
  return <span className={className}>{text}</span>;
}

function Section({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <div className="section"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return <div className="score"><div className="scoreTop"><span>{label}</span><b>{value}%</b></div><div className="scoreTrack"><div className="scoreFill" style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} /></div></div>;
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  if (!contentType.includes('application/json')) {
    const preview = text.slice(0, 180).replace(/\s+/g, ' ');
    throw new Error(`Expected JSON from ${url}, but received ${contentType || 'unknown content type'}. This usually means the Node.js Next server is not serving the API route. Response preview: ${preview}`);
  }
  const data = JSON.parse(text);
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data as T;
}

function exportBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csv(value: unknown) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export default function Page() {
  const [view, setView] = useState<View>('dashboard');
  const [competitors, setCompetitors] = useState<CompetitorInput[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [reportSummaries, setReportSummaries] = useState<ReportSummary[]>([]);
  const [reviews, setReviews] = useState<Record<string, ReviewRecord>>({});
  const [selectedCompetitorId, setSelectedCompetitorId] = useState('');
  const [selectedServiceLine, setSelectedServiceLine] = useState('Mobile Wound Care');
  const [selectedAudience, setSelectedAudience] = useState('Hospital discharge planner');
  const [drawer, setDrawer] = useState<EvidenceItem | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const analyses = report?.analyses || [];
  const findings = report?.allFindings || [];
  const subFindings = report?.allSubserviceFindings || [];
  const selectedAnalysis = analyses.find((item) => item.id === selectedCompetitorId) || analyses[0];
  const selectedFindings = selectedAnalysis ? findings.filter((item) => item.competitorId === selectedAnalysis.id) : [];
  const selectedSubFindings = selectedAnalysis ? subFindings.filter((item) => item.competitorId === selectedAnalysis.id) : [];
  const selectedService = andwellCatalog.find((item) => item.serviceLine === selectedServiceLine) || andwellCatalog[0];

  const stats = useMemo(() => ({
    competitors: report?.competitorsAnalyzed || competitors.length,
    pages: report?.pagesReviewed || 0,
    services: andwellCatalog.length,
    subservices: andwellCatalog.reduce((total, service) => total + service.subservices.length, 0),
    subFindings: subFindings.length,
    matched: report?.matchedServiceFindings || 0,
    advantages: report?.potentialAndwellAdvantages || 0,
    review: report?.humanReviewItems || 0,
    savedReports: reportSummaries.length
  }), [report, competitors.length, subFindings.length, reportSummaries.length]);

  useEffect(() => {
    void loadServerState();
  }, []);

  async function loadServerState() {
    setError('');
    try {
      const [competitorResponse, reportResponse, reviewResponse] = await Promise.all([
        fetchJson<{ competitors: CompetitorInput[] }>('/api/competitors'),
        fetchJson<{ reports: ReportSummary[] }>('/api/reports'),
        fetchJson<{ reviews: ReviewRecord[] }>('/api/reviews')
      ]);
      setCompetitors(competitorResponse.competitors || []);
      setReportSummaries(reportResponse.reports || []);
      setReviews(Object.fromEntries((reviewResponse.reviews || []).map((review) => [review.findingId, review])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load server state.');
    }
  }

  function addCompetitors() {
    const urls = urlInput.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    const slots = Math.max(0, 25 - competitors.length);
    const next = urls.slice(0, slots).map((url) => ({ name: nameFromUrl(url), url: normalizeUrl(url), market: 'Not provided' }));
    setCompetitors((current) => [...current, ...next]);
    setUrlInput('');
    if (urls.length > slots) setNotice(`Only ${slots} URLs were added because the app limit is 25 competitors.`);
  }

  async function saveCompetitorLibrary() {
    setBusy(true);
    setError('');
    try {
      const response = await fetchJson<{ competitors: CompetitorInput[] }>('/api/competitors', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ competitors })
      });
      setCompetitors(response.competitors || []);
      setNotice('Competitor library saved to server storage.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save competitors.');
    } finally {
      setBusy(false);
    }
  }

  async function runAnalysis() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!competitors.length) throw new Error('Add at least one competitor URL first.');
      const data = await fetchJson<IntelligenceReport>('/api/analyze', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ competitors, maxPagesPerSite: 24, save: true })
      });
      setReport(data);
      setSelectedCompetitorId(data.analyses?.[0]?.id || '');
      setView('dashboard');
      setNotice('Live competitor intelligence analysis complete and saved to the server.');
      await loadServerState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown analysis error.');
    } finally {
      setBusy(false);
    }
  }

  async function loadReport(id: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetchJson<{ report: IntelligenceReport }>(`/api/reports?id=${encodeURIComponent(id)}`);
      setReport(response.report);
      setSelectedCompetitorId(response.report.analyses?.[0]?.id || '');
      setView('dashboard');
      setNotice('Stored report loaded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load report.');
    } finally {
      setBusy(false);
    }
  }

  async function updateReview(id: string, value: string) {
    setError('');
    try {
      const response = await fetchJson<{ review: ReviewRecord }>('/api/reviews', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ findingId: id, status: value, reviewer: 'User' })
      });
      setReviews((current) => ({ ...current, [id]: response.review }));
      setNotice('Review decision saved to server storage.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save review decision.');
    }
  }

  function exportReport(type: 'json' | 'csv' | 'html') {
    if (!report) {
      setError('Run or load an analysis before exporting.');
      return;
    }
    if (type === 'json') exportBlob(JSON.stringify({ ...report, reviews }, null, 2), 'andwell-competitive-report.json', 'application/json');
    if (type === 'csv') {
      const rows = [['Type','Competitor','Service Line','Subservice','Status','Confidence','Review','Source','Evidence','Safe Sales Wording']];
      findings.forEach((item) => rows.push(['Service', item.competitorName, item.serviceLine, '', item.competitorStatus, item.confidence, reviews[item.id]?.status || item.reviewStatus, item.sourceUrl || '', item.evidenceExcerpt, item.safeSalesWording]));
      subFindings.forEach((item) => rows.push(['Subservice', item.competitorName, item.serviceLine, item.subservice, item.competitorStatus, item.confidence, reviews[item.id]?.status || item.reviewStatus, item.sourceUrl || '', item.evidenceExcerpt, item.safeSalesWording]));
      exportBlob(rows.map((row) => row.map(csv).join(',')).join('\n'), 'andwell-competitive-findings.csv', 'text/csv');
    }
    if (type === 'html') {
      const insights = (report.executiveInsights || []).map((item) => `<section><h2>${escapeHtml(item.title)}</h2><p><b>${escapeHtml(item.priority)}</b> for ${escapeHtml(item.audience)}</p><p>${escapeHtml(item.summary)}</p><p><b>Action:</b> ${escapeHtml(item.action)}</p></section>`).join('');
      const scores = (report.competitorScores || []).map((item) => `<section><h2>${escapeHtml(item.competitorName)}</h2><p>${escapeHtml(item.executiveReadout)}</p><p>Overlap ${item.serviceLineMatchScore}% | Depth ${item.subserviceDepthScore}% | Andwell differentiation ${item.andwellDifferentiationScore}% | Review risk ${item.reviewRiskScore}%</p></section>`).join('');
      const body = findings.map((item) => `<section><h3>${escapeHtml(item.competitorName)}: ${escapeHtml(item.serviceLine)}</h3><p>Status: ${escapeHtml(item.competitorStatus)} | Confidence: ${escapeHtml(item.confidence)} | Depth: ${item.subserviceDepthScore}%</p><p>${escapeHtml(item.safeSalesWording)}</p></section>`).join('');
      exportBlob(`<!doctype html><html><head><meta charset="utf-8"><title>Andwell Competitive Intelligence Report</title><style>body{font-family:Arial;margin:40px;line-height:1.55;color:#0f172a}section{border:1px solid #ddd;border-radius:14px;padding:16px;margin:12px 0}</style></head><body><h1>Andwell Competitive Intelligence Report</h1><p>${escapeHtml(report.executiveSummary)}</p><h2>Executive Insights</h2>${insights}<h2>Competitor Scores</h2>${scores}<h2>Findings</h2>${body}</body></html>`, 'andwell-competitive-report.html', 'text/html');
    }
  }

  return <div className="shell">
    {drawer && <EvidenceDrawer item={drawer} reviews={reviews} onReview={updateReview} close={() => setDrawer(null)} />}
    <aside className="side"><div className="brand"><h1>Andwell Advantage Intelligence Hub</h1><p>Executive, leader, and field ready competitive service intelligence.</p></div><nav className="nav">{views.map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>{item.label}</button>)}</nav></aside>
    <main className="main"><header className="head"><div><small>Baseline Provider</small><h2>Andwell Health Partners</h2></div><div className="row"><button className="btn" onClick={() => void loadServerState()}>Refresh Server State</button><a className="btn" href="/api/diagnostics" target="_blank">API Diagnostics</a></div></header><div className="content">{error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}{notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}
      {view === 'dashboard' && <Dashboard stats={stats} report={report} setView={setView} />}
      {view === 'ask' && <AskHub report={report} analyses={analyses} />}
      {view === 'intake' && <Intake competitors={competitors} setCompetitors={setCompetitors} urlInput={urlInput} setUrlInput={setUrlInput} addCompetitors={addCompetitors} saveCompetitorLibrary={saveCompetitorLibrary} runAnalysis={runAnalysis} busy={busy} />}
      {view === 'profiles' && <Profiles analyses={analyses} selectedId={selectedCompetitorId} setSelectedId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} />}
      {view === 'services' && <ServiceMatrix analyses={analyses} findings={findings} open={setDrawer} />}
      {view === 'subservices' && <SubserviceMatrix analyses={analyses} items={subFindings} selectedServiceLine={selectedServiceLine} setSelectedServiceLine={setSelectedServiceLine} open={setDrawer} />}
      {view === 'gaps' && <Gaps analyses={analyses} selectedId={selectedCompetitorId} setSelectedId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} findings={selectedFindings} subFindings={selectedSubFindings} open={setDrawer} />}
      {view === 'battlecards' && <Battlecards analyses={analyses} selectedId={selectedCompetitorId} setSelectedId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} findings={selectedFindings} />}
      {view === 'talktracks' && <TalkTracks analyses={analyses} selectedId={selectedCompetitorId} setSelectedId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} selectedService={selectedService} serviceLine={selectedServiceLine} setServiceLine={setSelectedServiceLine} audience={selectedAudience} setAudience={setSelectedAudience} findings={selectedFindings} />}
      {view === 'evidence' && <EvidenceLibrary findings={findings} subFindings={subFindings} open={setDrawer} />}
      {view === 'review' && <ReviewCenter findings={findings} subFindings={subFindings} reviews={reviews} open={setDrawer} />}
      {view === 'reports' && <Reports report={report} summaries={reportSummaries} loadReport={loadReport} exportReport={exportReport} busy={busy} />}
      {view === 'catalog' && <Catalog />}
    </div></main>
  </div>;
}

function EvidenceDrawer({ item, reviews, onReview, close }: { item: EvidenceItem; reviews: Record<string, ReviewRecord>; onReview: (id: string, value: string) => void; close: () => void }) {
  return <><div className="drawerBg" onClick={close} /><aside className="drawer"><div className="row" style={{ justifyContent: 'space-between' }}><h2>Evidence Drawer</h2><button className="btn" onClick={close}>Close</button></div><p><b>{item.competitorName}</b> | {sectionTitle(item)}</p><div className="row"><Badge text={item.competitorStatus} className={statusClass[item.competitorStatus]} /><Badge text={item.confidence} className={confidenceClass[item.confidence]} /><Badge text={reviews[item.id]?.status || item.reviewStatus} /></div><div className="card"><h3>Evidence</h3><p>{item.evidenceExcerpt}</p>{item.sourceUrl && <a className="btn" href={item.sourceUrl} target="_blank">Open source page</a>}</div><div className="card"><h3>Interpretation</h3><p>{item.aiInterpretation}</p></div><div className="success"><b>Safe wording</b><br />{item.safeSalesWording}</div><div className="error" style={{ marginTop: 12 }}><b>Avoid saying</b><br />{item.avoidSaying}</div><div className="card"><h3>Review</h3><div className="row"><button className="btn primary" onClick={() => onReview(item.id, 'Approved for sales use')}>Approve</button><button className="btn" onClick={() => onReview(item.id, 'Needs edits')}>Needs edits</button><button className="btn danger" onClick={() => onReview(item.id, 'Rejected')}>Reject</button></div></div></aside></>;
}

function Dashboard({ stats, report, setView }: { stats: Record<string, number>; report: IntelligenceReport | null; setView: (view: View) => void }) {
  const cards = [['Competitors', stats.competitors], ['Stored reports', stats.savedReports], ['Pages reviewed', stats.pages], ['Service lines', stats.services], ['Subservices', stats.subservices], ['Subservice findings', stats.subFindings], ['Potential advantages', stats.advantages], ['Review items', stats.review]];
  return <><Section title="Command Center" subtitle="Executive snapshot of competitor overlap, Andwell differentiation, service depth, stored reports, and review risk." action={<button className="btn primary" onClick={() => setView('intake')}>Add competitors</button>} /><div className="grid cols4">{cards.map(([label, value]) => <div className="card kpiCard" key={label}><div className="muted">{label}</div><div className="kpi">{value}</div></div>)}</div>{report ? <><div className="hero"><h2>Executive Summary</h2><p>{report.executiveSummary}</p></div><div className="grid cols3">{report.executiveInsights.map((item) => <div className="card" key={item.title}><div className="row"><Badge text={item.priority} className={item.priority === 'High' ? 'badge red' : 'badge amber'} /><Badge text={item.audience} /></div><h3>{item.title}</h3><p>{item.summary}</p><div className="notice"><b>Action</b><br />{item.action}</div></div>)}</div><Scoreboard scores={report.competitorScores} /></> : <div className="notice" style={{ marginTop: 16 }}>Load a stored report or add competitor URLs and run intelligence analysis.</div>}</>;
}

function Scoreboard({ scores }: { scores: CompetitorScore[] }) {
  if (!scores.length) return null;
  return <div className="card" style={{ marginTop: 16 }}><h2>Competitor Intelligence Scoreboard</h2><div className="grid cols2">{scores.map((score) => <div className="scoreCard" key={score.competitorId}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{score.competitorName}</h3><Badge text={score.threatLevel} className={score.threatLevel === 'Strategic threat' ? 'badge red' : score.threatLevel === 'High overlap' ? 'badge amber' : 'badge blue'} /></div><p>{score.executiveReadout}</p><ScoreBar label="Service overlap" value={score.serviceLineMatchScore} /><ScoreBar label="Subservice depth" value={score.subserviceDepthScore} /><ScoreBar label="Andwell differentiation" value={score.andwellDifferentiationScore} /><ScoreBar label="Review risk" value={score.reviewRiskScore} /></div>)}</div></div>;
}

function Intake({ competitors, setCompetitors, urlInput, setUrlInput, addCompetitors, saveCompetitorLibrary, runAnalysis, busy }: { competitors: CompetitorInput[]; setCompetitors: (items: CompetitorInput[]) => void; urlInput: string; setUrlInput: (value: string) => void; addCompetitors: () => void; saveCompetitorLibrary: () => void; runAnalysis: () => void; busy: boolean }) {
  return <><Section title="Competitor Intake" subtitle="Paste up to 25 competitor websites. Save the competitor library, then run intelligence analysis to create a stored report." /><div className="card"><textarea className="textarea" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="https://competitorone.org\nhttps://competitortwo.org" /><div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}><Badge text={`${competitors.length} of 25 selected for analysis`} /><div className="row"><button className="btn" onClick={addCompetitors}>Add URLs</button><button className="btn" disabled={busy} onClick={saveCompetitorLibrary}>Save Library</button><button className="btn primary" disabled={busy} onClick={runAnalysis}>{busy ? 'Analyzing live websites' : 'Run and Save Intelligence Report'}</button></div></div></div><div className="grid cols2" style={{ marginTop: 16 }}>{competitors.map((item, index) => <div className="card" key={`${item.url}${index}`}><h3>{item.name}</h3><p>{item.url}</p><button className="btn danger" onClick={() => setCompetitors(competitors.filter((_, i) => i !== index))}>Remove</button></div>)}</div></>;
}

function CompetitorSelect({ analyses, value, onChange }: { analyses: IntelligenceReport['analyses']; value: string; onChange: (value: string) => void }) {
  return <select className="select" value={value || analyses[0]?.id || ''} onChange={(event) => onChange(event.target.value)}>{analyses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
}

function Profiles({ analyses, selectedId, setSelectedId, selectedAnalysis }: { analyses: IntelligenceReport['analyses']; selectedId: string; setSelectedId: (id: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number] }) {
  return <><Section title="Competitor Profiles" subtitle="Executive profile showing overlap, threat level, lead with guidance, review risk, and source pages." action={<CompetitorSelect analyses={analyses} value={selectedId} onChange={setSelectedId} />} />{!selectedAnalysis ? <div className="notice">Run or load a report first.</div> : <div className="grid cols2"><div className="card"><h2>{selectedAnalysis.name}</h2><p>{selectedAnalysis.url}</p><Badge text={selectedAnalysis.score.threatLevel} className={selectedAnalysis.score.threatLevel === 'Strategic threat' ? 'badge red' : 'badge amber'} /><p>{selectedAnalysis.score.executiveReadout}</p><ScoreBar label="Service line overlap" value={selectedAnalysis.score.serviceLineMatchScore} /><ScoreBar label="Subservice depth" value={selectedAnalysis.score.subserviceDepthScore} /><ScoreBar label="Andwell differentiation" value={selectedAnalysis.score.andwellDifferentiationScore} /><ScoreBar label="Evidence strength" value={selectedAnalysis.score.evidenceStrengthScore} /></div><div className="card"><h3>Recommended sales posture</h3><p><b>Lead with:</b> {selectedAnalysis.score.leadWith.join(', ') || 'Andwell continuum depth'}</p><p><b>Strongest matches:</b> {selectedAnalysis.score.strongestMatches.join(', ') || 'No strong matches found publicly'}</p><p><b>Review first:</b> {selectedAnalysis.score.needsReview.join(', ') || 'No major review flags'}</p><h3>Pages reviewed</h3>{selectedAnalysis.pagesReviewed.slice(0, 12).map((page) => <p key={page.url}><a href={page.url} target="_blank">{page.title}</a></p>)}</div></div>}</>;
}

function ServiceMatrix({ analyses, findings, open }: { analyses: IntelligenceReport['analyses']; findings: Finding[]; open: (item: Finding) => void }) {
  return <><Section title="Service Line Matrix" subtitle="Main service line comparison with subservice depth score for each competitor." />{!analyses.length ? <div className="notice">Run or load a report first.</div> : <div className="tableWrap"><table><thead><tr><th>Service line</th><th>Andwell</th>{analyses.map((analysis) => <th key={analysis.id}>{analysis.name}</th>)}</tr></thead><tbody>{andwellCatalog.map((service) => <tr key={service.serviceLine}><td><b>{service.serviceLine}</b><br /><span className="muted">{service.category}</span></td><td><Badge text="Clearly offered" className="badge green" /></td>{analyses.map((analysis) => { const item = findings.find((finding) => finding.competitorId === analysis.id && finding.serviceLine === service.serviceLine); return <td key={analysis.id}>{item ? <button className={statusClass[item.competitorStatus]} onClick={() => open(item)}>{item.competitorStatus} | {item.subserviceDepthScore}% depth</button> : <Badge text="Needs review" className="badge red" />}</td>; })}</tr>)}</tbody></table></div>}</>;
}

function SubserviceMatrix({ analyses, items, selectedServiceLine, setSelectedServiceLine, open }: { analyses: IntelligenceReport['analyses']; items: SubserviceFinding[]; selectedServiceLine: string; setSelectedServiceLine: (line: string) => void; open: (item: SubserviceFinding) => void }) {
  const service = andwellCatalog.find((entry) => entry.serviceLine === selectedServiceLine) || andwellCatalog[0];
  return <><Section title="Subservice Matrix" subtitle="Each capability has its own evidence backed finding." action={<select className="select" value={selectedServiceLine} onChange={(event) => setSelectedServiceLine(event.target.value)}>{andwellCatalog.map((entry) => <option key={entry.serviceLine}>{entry.serviceLine}</option>)}</select>} /><div className="card"><h3>{service.serviceLine}</h3><p>{service.description}</p></div>{!analyses.length ? <div className="notice" style={{ marginTop: 16 }}>Run or load a report first.</div> : <div className="tableWrap" style={{ marginTop: 16 }}><table><thead><tr><th>Capability</th><th>Andwell</th>{analyses.map((analysis) => <th key={analysis.id}>{analysis.name}</th>)}</tr></thead><tbody>{service.subservices.map((subservice) => <tr key={subservice}><td><b>{subservice}</b></td><td><Badge text="Clearly offered" className="badge green" /></td>{analyses.map((analysis) => { const item = items.find((finding) => finding.competitorId === analysis.id && finding.serviceLine === service.serviceLine && finding.subservice === subservice); return <td key={analysis.id}>{item ? <button className={statusClass[item.competitorStatus]} onClick={() => open(item)}>{item.competitorStatus}</button> : <Badge text="Needs review" className="badge red" />}</td>; })}</tr>)}</tbody></table></div>}</>;
}

function Gaps({ analyses, selectedId, setSelectedId, selectedAnalysis, findings, subFindings, open }: { analyses: IntelligenceReport['analyses']; selectedId: string; setSelectedId: (id: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; findings: Finding[]; subFindings: SubserviceFinding[]; open: (item: EvidenceItem) => void }) {
  const serviceAdvantages = findings.filter((item) => item.competitorStatus !== 'Clearly offered');
  const subAdvantages = subFindings.filter((item) => item.competitorStatus !== 'Clearly offered').slice(0, 30);
  return <><Section title="Gap Finder" subtitle="Service and subservice opportunities based on public evidence and safe wording." action={<CompetitorSelect analyses={analyses} value={selectedId} onChange={setSelectedId} />} />{!selectedAnalysis ? <div className="notice">Run or load a report first.</div> : <div className="grid cols3"><div className="card"><h3>Service opportunities</h3>{serviceAdvantages.map((item) => <FindingCard key={item.id} item={item} open={open} />)}</div><div className="card" style={{ gridColumn: 'span 2' }}><h3>Subservice opportunities</h3>{subAdvantages.map((item) => <FindingCard key={item.id} item={item} open={open} />)}</div></div>}</>;
}

function FindingCard({ item, open }: { item: EvidenceItem; open: (item: EvidenceItem) => void }) {
  return <div className="miniFinding"><div className="row" style={{ justifyContent: 'space-between' }}><b>{sectionTitle(item)}</b><div className="row"><Badge text={item.competitorStatus} className={statusClass[item.competitorStatus]} /><Badge text={item.confidence} className={confidenceClass[item.confidence]} /></div></div><p>{item.safeSalesWording}</p><button className="btn" onClick={() => open(item)}>Open evidence</button></div>;
}

function Battlecards({ analyses, selectedId, setSelectedId, selectedAnalysis, findings }: { analyses: IntelligenceReport['analyses']; selectedId: string; setSelectedId: (id: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; findings: Finding[] }) {
  const advantages = findings.filter((item) => item.competitorStatus !== 'Clearly offered').slice(0, 8);
  const matches = findings.filter((item) => item.competitorStatus === 'Clearly offered').slice(0, 8);
  return <><Section title="Battlecards" subtitle="Competitor specific sales positioning for field use." action={<CompetitorSelect analyses={analyses} value={selectedId} onChange={setSelectedId} />} />{!selectedAnalysis ? <div className="notice">Run or load a report first.</div> : <div className="card"><h2>{selectedAnalysis.name} Battlecard</h2><div className="grid cols3"><div className="card"><h3>Lead with</h3>{selectedAnalysis.score.leadWith.map((item) => <p key={item}>{item}</p>)}</div><div className="card"><h3>Where Andwell appears stronger</h3>{advantages.map((item) => <p key={item.id}>{item.serviceLine}</p>)}</div><div className="card"><h3>Where they match publicly</h3>{matches.map((item) => <p key={item.id}>{item.serviceLine} | {item.subserviceDepthScore}% depth</p>)}</div></div><div className="success" style={{ marginTop: 12 }}><b>Opening talk track</b><br />Lead with specific Andwell service depth, not broad category claims. Connect the conversation to patient complexity, caregiver burden, discharge risk, or continuity of care.</div><div className="error" style={{ marginTop: 12 }}><b>Do not say</b><br />Do not say the competitor does not offer a service unless approved evidence confirms it. Use not found publicly for website based findings.</div></div>}</>;
}

function TalkTracks({ analyses, selectedId, setSelectedId, selectedAnalysis, selectedService, serviceLine, setServiceLine, audience, setAudience, findings }: { analyses: IntelligenceReport['analyses']; selectedId: string; setSelectedId: (id: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; selectedService: typeof andwellCatalog[number]; serviceLine: string; setServiceLine: (line: string) => void; audience: string; setAudience: (audience: string) => void; findings: Finding[] }) {
  const finding = findings.find((item) => item.serviceLine === serviceLine);
  return <><Section title="Talk Track Builder" subtitle="Build field language by competitor, service line, and referral source type." /><div className="card"><div className="grid cols3"><label>Competitor<CompetitorSelect analyses={analyses} value={selectedId} onChange={setSelectedId} /></label><label>Service line<select className="select" value={serviceLine} onChange={(event) => setServiceLine(event.target.value)}>{andwellCatalog.map((service) => <option key={service.serviceLine}>{service.serviceLine}</option>)}</select></label><label>Referral source<select className="select" value={audience} onChange={(event) => setAudience(event.target.value)}>{referralAudiences.map((item) => <option key={item}>{item}</option>)}</select></label></div></div><div className="grid cols2" style={{ marginTop: 16 }}><div className="card"><h3>Short talk track</h3><p>For a {audience.toLowerCase()}, position Andwell’s {selectedService.serviceLine} around specific capabilities, including {selectedService.subservices.slice(0, 8).join(', ')}.</p></div><div className="card"><h3>Competitive angle</h3><p>{finding ? finding.safeSalesWording : 'Run or load a report and select a competitor to generate a competitor specific angle.'}</p></div><div className="card"><h3>Referral question</h3><p>Are you looking for the basic service category, or do you need a provider that can support detailed needs like {selectedService.subservices.slice(0, 5).join(', ')}?</p></div><div className="card"><h3>Objection response</h3><p>If the referral source already uses {selectedAnalysis?.name || 'this competitor'}, acknowledge the relationship, then pivot to the patient situation and Andwell’s specific capabilities inside {selectedService.serviceLine}.</p></div></div></>;
}

function EvidenceLibrary({ findings, subFindings, open }: { findings: Finding[]; subFindings: SubserviceFinding[]; open: (item: EvidenceItem) => void }) {
  const [kind, setKind] = useState<'service' | 'subservice'>('service');
  const items: EvidenceItem[] = kind === 'service' ? findings : subFindings;
  return <><Section title="Evidence Library" subtitle="Every finding is traceable to evidence, confidence, and safe wording." action={<select className="select" value={kind} onChange={(event) => setKind(event.target.value as 'service' | 'subservice')}><option value="service">Service findings</option><option value="subservice">Subservice findings</option></select>} />{!items.length ? <div className="notice">Run or load a report first.</div> : <div className="grid">{items.map((item) => <div className="card" key={item.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{item.competitorName}: {sectionTitle(item)}</h3><div className="row"><Badge text={item.competitorStatus} className={statusClass[item.competitorStatus]} /><Badge text={item.confidence} className={confidenceClass[item.confidence]} /></div></div><p>{item.evidenceExcerpt}</p><button className="btn" onClick={() => open(item)}>Open evidence</button></div>)}</div>}</>;
}

function ReviewCenter({ findings, subFindings, reviews, open }: { findings: Finding[]; subFindings: SubserviceFinding[]; reviews: Record<string, ReviewRecord>; open: (item: EvidenceItem) => void }) {
  const items: EvidenceItem[] = [...findings, ...subFindings].filter((item) => (reviews[item.id]?.status || item.reviewStatus) !== 'Sales usable with evidence' && (reviews[item.id]?.status || item.reviewStatus) !== 'Approved for sales use');
  return <><Section title="Review Center" subtitle="Approve findings before turning them into field language. Review decisions are saved to the server." />{!items.length ? <div className="success">No open review items.</div> : <div className="grid">{items.map((item) => <div className="card" key={item.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{sectionTitle(item)}</h3><Badge text={reviews[item.id]?.status || item.reviewStatus} className="badge red" /></div><p>{item.safeSalesWording}</p><button className="btn" onClick={() => open(item)}>Review</button></div>)}</div>}</>;
}

function Reports({ report, summaries, loadReport, exportReport, busy }: { report: IntelligenceReport | null; summaries: ReportSummary[]; loadReport: (id: string) => void; exportReport: (type: 'json' | 'csv' | 'html') => void; busy: boolean }) {
  return <><Section title="Reports" subtitle="Load stored intelligence reports from the server or export the current report." action={<div className="row"><button className="btn" disabled={!report} onClick={() => exportReport('json')}>Export JSON</button><button className="btn" disabled={!report} onClick={() => exportReport('csv')}>Export CSV</button><button className="btn" disabled={!report} onClick={() => exportReport('html')}>Export HTML</button></div>} />{report && <div className="success" style={{ marginBottom: 16 }}>Current report loaded with {report.competitorsAnalyzed} competitors and {report.allSubserviceFindings.length} subservice findings.</div>}<div className="grid">{summaries.map((summary) => <div className="card" key={summary.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{summary.competitors.join(', ') || 'Stored report'}</h3><Badge text={`${summary.competitorsAnalyzed} competitors`} /></div><p>{new Date(summary.generatedAt).toLocaleString()} | {summary.pagesReviewed} pages reviewed | {summary.potentialAndwellAdvantages} potential advantages | {summary.humanReviewItems} review items</p><p>{summary.executiveSummary}</p><button className="btn primary" disabled={busy} onClick={() => loadReport(summary.id)}>Load Report</button></div>)}</div></>;
}

function Catalog() {
  return <><Section title="Andwell Catalog" subtitle="Baseline service catalog. Catalog governance API is available at /api/catalog for admin approved overrides." /><div className="grid cols2">{andwellCatalog.map((service) => <div className="card" key={service.serviceLine}><Badge text={service.category} /><h3>{service.serviceLine}</h3><p>{service.description}</p><div className="row">{service.subservices.slice(0, 18).map((item) => <Badge key={item} text={item} />)}{service.subservices.length > 18 && <Badge text={`More: ${service.subservices.length - 18}`} />}</div><div className="success" style={{ marginTop: 12 }}><b>Safe language</b><br />{service.safeLanguage}</div><div className="error" style={{ marginTop: 12 }}><b>Avoid saying</b><br />{service.avoid}</div></div>)}</div></>;
}

function AskHub({ report, analyses }: { report: IntelligenceReport | null; analyses: IntelligenceReport['analyses'] }) {
  const [question, setQuestion] = useState('');
  const [competitorName, setCompetitorName] = useState('');
  const [serviceLine, setServiceLine] = useState('');
  const [answer, setAnswer] = useState('');
  const [evidence, setEvidence] = useState<AskEvidence[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask() {
    setBusy(true);
    setError('');
    setAnswer('');
    try {
      const response = await fetchJson<{ answer: string; evidence: AskEvidence[]; confidence: string }>('/api/ask', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ question, competitorName, serviceLine, reportId: report?.id })
      });
      setAnswer(response.answer);
      setEvidence(response.evidence || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask the Hub failed.');
    } finally {
      setBusy(false);
    }
  }

  return <><Section title="Ask the Hub" subtitle="Ask plain English questions against the latest stored intelligence report. Answers use evidence, safe wording, and review status." /><div className="card"><textarea className="textarea" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Example: What does Andwell offer that this competitor does not clearly promote in hospice?" /><div className="grid cols3" style={{ marginTop: 12 }}><select className="select" value={competitorName} onChange={(event) => setCompetitorName(event.target.value)}><option value="">Any competitor</option>{analyses.map((analysis) => <option key={analysis.id} value={analysis.name}>{analysis.name}</option>)}</select><select className="select" value={serviceLine} onChange={(event) => setServiceLine(event.target.value)}><option value="">Any service line</option>{andwellCatalog.map((service) => <option key={service.serviceLine}>{service.serviceLine}</option>)}</select><button className="btn primary" disabled={busy || !question.trim()} onClick={ask}>{busy ? 'Searching intelligence' : 'Ask'}</button></div></div>{error && <div className="error" style={{ marginTop: 16 }}>{error}</div>}{answer && <div className="hero"><h2>Answer</h2><p>{answer}</p></div>}<div className="grid">{evidence.map((item, index) => <div className="card" key={`${item.competitorName}${item.serviceLine}${item.subservice}${index}`}><div className="row"><Badge text={item.status} className={statusClass[item.status] || 'badge'} /><Badge text={item.confidence} className={confidenceClass[item.confidence] || 'badge'} /><Badge text={item.reviewStatus} /></div><h3>{item.competitorName}: {item.serviceLine}{item.subservice ? ` | ${item.subservice}` : ''}</h3><p>{item.safeSalesWording}</p><p className="muted">{item.evidenceExcerpt}</p>{item.sourceUrl && <a className="btn" href={item.sourceUrl} target="_blank">Open source</a>}</div>)}</div></>;
}
