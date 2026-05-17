'use client';

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { andwellCatalog, referralAudiences } from '@/lib/andwell';
import type { CompetitorInput, CompetitorScore, Finding, IntelligenceReport, SubserviceFinding } from '@/lib/types';

type View = 'dashboard' | 'intake' | 'profiles' | 'services' | 'subservices' | 'gaps' | 'battlecards' | 'talktracks' | 'evidence' | 'review' | 'reports';
type EvidenceItem = Finding | SubserviceFinding;

const views: { key: View; label: string }[] = [
  { key: 'dashboard', label: 'Command Center' },
  { key: 'intake', label: 'Competitor Intake' },
  { key: 'profiles', label: 'Competitor Profiles' },
  { key: 'services', label: 'Service Matrix' },
  { key: 'subservices', label: 'Subservice Matrix' },
  { key: 'gaps', label: 'Gap Finder' },
  { key: 'battlecards', label: 'Battlecards' },
  { key: 'talktracks', label: 'Talk Tracks' },
  { key: 'evidence', label: 'Evidence Library' },
  { key: 'review', label: 'Review Center' },
  { key: 'reports', label: 'Reports' }
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

async function readJsonOrThrow(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  const bodyText = await response.text();
  if (!contentType.includes('application/json')) {
    const preview = bodyText.slice(0, 160).replace(/\s+/g, ' ');
    throw new Error(`The analysis API returned ${contentType || 'an unknown content type'} instead of JSON. This usually means Hostinger is serving an HTML error page or the app is not running as a Node.js Next server. Test /api/analyze and /api/diagnostics after redeploy. Response preview: ${preview}`);
  }
  const data = JSON.parse(bodyText);
  if (!response.ok) throw new Error(data.error || `Analysis failed with HTTP ${response.status}.`);
  return data as IntelligenceReport;
}

export default function Page() {
  const [view, setView] = useState<View>('dashboard');
  const [competitors, setCompetitors] = useState<CompetitorInput[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState('');
  const [selectedServiceLine, setSelectedServiceLine] = useState('Mobile Wound Care');
  const [selectedAudience, setSelectedAudience] = useState('Hospital discharge planner');
  const [drawer, setDrawer] = useState<EvidenceItem | null>(null);
  const [review, setReview] = useState<Record<string, string>>({});
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
    review: report?.humanReviewItems || 0
  }), [report, competitors.length, subFindings.length]);

  function addCompetitors() {
    const urls = urlInput.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    const slots = Math.max(0, 25 - competitors.length);
    const next = urls.slice(0, slots).map((url) => ({ name: nameFromUrl(url), url: normalizeUrl(url), market: 'Not provided' }));
    setCompetitors((current) => [...current, ...next]);
    setUrlInput('');
    if (urls.length > slots) setNotice(`Only ${slots} URLs were added because the app limit is 25 competitors.`);
  }

  async function runAnalysis() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!competitors.length) throw new Error('Add at least one competitor URL first.');
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ competitors, maxPagesPerSite: 24 })
      });
      const data = await readJsonOrThrow(response);
      setReport(data);
      setSelectedCompetitorId(data.analyses?.[0]?.id || '');
      setView('dashboard');
      setNotice('Live competitor intelligence analysis complete.');
      const saved = JSON.parse(localStorage.getItem('andwellReports') || '[]') as IntelligenceReport[];
      localStorage.setItem('andwellReports', JSON.stringify([data, ...saved.filter((item) => item.id !== data.id)].slice(0, 20)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown analysis error.');
    } finally {
      setBusy(false);
    }
  }

  function updateReview(id: string, value: string) {
    setReview((current) => ({ ...current, [id]: value }));
    setNotice('Review status updated locally. Export the report to preserve review notes.');
  }

  function exportReport(type: 'json' | 'csv' | 'html') {
    if (!report) {
      setError('Run an analysis before exporting.');
      return;
    }
    if (type === 'json') exportBlob(JSON.stringify({ ...report, review }, null, 2), 'andwell-competitive-report.json', 'application/json');
    if (type === 'csv') {
      const rows = [['Type','Competitor','Service Line','Subservice','Status','Confidence','Review','Source','Evidence','Safe Sales Wording']];
      findings.forEach((item) => rows.push(['Service', item.competitorName, item.serviceLine, '', item.competitorStatus, item.confidence, review[item.id] || item.reviewStatus, item.sourceUrl || '', item.evidenceExcerpt, item.safeSalesWording]));
      subFindings.forEach((item) => rows.push(['Subservice', item.competitorName, item.serviceLine, item.subservice, item.competitorStatus, item.confidence, review[item.id] || item.reviewStatus, item.sourceUrl || '', item.evidenceExcerpt, item.safeSalesWording]));
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
    {drawer && <EvidenceDrawer item={drawer} review={review} onReview={updateReview} close={() => setDrawer(null)} />}
    <aside className="side"><div className="brand"><h1>Andwell Advantage Intelligence Hub</h1><p>Executive, leader, and field ready competitive service intelligence.</p></div><nav className="nav">{views.map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>{item.label}</button>)}</nav></aside>
    <main className="main"><header className="head"><div><small>Baseline Provider</small><h2>Andwell Health Partners</h2></div><div className="row"><a className="btn" href="/api/diagnostics" target="_blank">API Diagnostics</a><a className="btn" href="/api/analyze" target="_blank">Analyze Route</a></div></header><div className="content">{error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}{notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}
      {view === 'dashboard' && <Dashboard stats={stats} report={report} setView={setView} />}
      {view === 'intake' && <Intake competitors={competitors} setCompetitors={setCompetitors} urlInput={urlInput} setUrlInput={setUrlInput} addCompetitors={addCompetitors} runAnalysis={runAnalysis} busy={busy} />}
      {view === 'profiles' && <Profiles analyses={analyses} selectedId={selectedCompetitorId} setSelectedId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} />}
      {view === 'services' && <ServiceMatrix analyses={analyses} findings={findings} open={setDrawer} />}
      {view === 'subservices' && <SubserviceMatrix analyses={analyses} items={subFindings} selectedServiceLine={selectedServiceLine} setSelectedServiceLine={setSelectedServiceLine} open={setDrawer} />}
      {view === 'gaps' && <Gaps analyses={analyses} selectedId={selectedCompetitorId} setSelectedId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} findings={selectedFindings} subFindings={selectedSubFindings} open={setDrawer} />}
      {view === 'battlecards' && <Battlecards analyses={analyses} selectedId={selectedCompetitorId} setSelectedId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} findings={selectedFindings} />}
      {view === 'talktracks' && <TalkTracks analyses={analyses} selectedId={selectedCompetitorId} setSelectedId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} selectedService={selectedService} serviceLine={selectedServiceLine} setServiceLine={setSelectedServiceLine} audience={selectedAudience} setAudience={setSelectedAudience} findings={selectedFindings} />}
      {view === 'evidence' && <EvidenceLibrary findings={findings} subFindings={subFindings} open={setDrawer} />}
      {view === 'review' && <ReviewCenter findings={findings} subFindings={subFindings} review={review} open={setDrawer} />}
      {view === 'reports' && <Reports report={report} exportReport={exportReport} />}
    </div></main>
  </div>;
}

function EvidenceDrawer({ item, review, onReview, close }: { item: EvidenceItem; review: Record<string, string>; onReview: (id: string, value: string) => void; close: () => void }) {
  return <><div className="drawerBg" onClick={close} /><aside className="drawer"><div className="row" style={{ justifyContent: 'space-between' }}><h2>Evidence Drawer</h2><button className="btn" onClick={close}>Close</button></div><p><b>{item.competitorName}</b> | {sectionTitle(item)}</p><div className="row"><Badge text={item.competitorStatus} className={statusClass[item.competitorStatus]} /><Badge text={item.confidence} className={confidenceClass[item.confidence]} /><Badge text={review[item.id] || item.reviewStatus} /></div><div className="card"><h3>Evidence</h3><p>{item.evidenceExcerpt}</p>{item.sourceUrl && <a className="btn" href={item.sourceUrl} target="_blank">Open source page</a>}</div><div className="card"><h3>Interpretation</h3><p>{item.aiInterpretation}</p></div><div className="success"><b>Safe wording</b><br />{item.safeSalesWording}</div><div className="error" style={{ marginTop: 12 }}><b>Avoid saying</b><br />{item.avoidSaying}</div><div className="card"><h3>Review</h3><div className="row"><button className="btn primary" onClick={() => onReview(item.id, 'Approved for sales use')}>Approve</button><button className="btn" onClick={() => onReview(item.id, 'Needs edits')}>Needs edits</button><button className="btn danger" onClick={() => onReview(item.id, 'Rejected')}>Reject</button></div></div></aside></>;
}

function Dashboard({ stats, report, setView }: { stats: Record<string, number>; report: IntelligenceReport | null; setView: (view: View) => void }) {
  const cards = [['Competitors', stats.competitors], ['Pages reviewed', stats.pages], ['Service lines', stats.services], ['Subservices', stats.subservices], ['Subservice findings', stats.subFindings], ['Potential advantages', stats.advantages], ['Matched services', stats.matched], ['Review items', stats.review]];
  return <><Section title="Command Center" subtitle="Executive snapshot of competitor overlap, Andwell differentiation, service depth, and review risk." action={<button className="btn primary" onClick={() => setView('intake')}>Add competitors</button>} /><div className="grid cols4">{cards.map(([label, value]) => <div className="card kpiCard" key={label}><div className="muted">{label}</div><div className="kpi">{value}</div></div>)}</div>{report ? <><div className="hero"><h2>Executive Summary</h2><p>{report.executiveSummary}</p></div><div className="grid cols3">{report.executiveInsights.map((item) => <div className="card" key={item.title}><div className="row"><Badge text={item.priority} className={item.priority === 'High' ? 'badge red' : 'badge amber'} /><Badge text={item.audience} /></div><h3>{item.title}</h3><p>{item.summary}</p><div className="notice"><b>Action</b><br />{item.action}</div></div>)}</div><Scoreboard scores={report.competitorScores} /></> : <div className="notice" style={{ marginTop: 16 }}>Add competitor URLs and run intelligence analysis.</div>}</>;
}

function Scoreboard({ scores }: { scores: CompetitorScore[] }) {
  if (!scores.length) return null;
  return <div className="card" style={{ marginTop: 16 }}><h2>Competitor Intelligence Scoreboard</h2><div className="grid cols2">{scores.map((score) => <div className="scoreCard" key={score.competitorId}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{score.competitorName}</h3><Badge text={score.threatLevel} className={score.threatLevel === 'Strategic threat' ? 'badge red' : score.threatLevel === 'High overlap' ? 'badge amber' : 'badge blue'} /></div><p>{score.executiveReadout}</p><ScoreBar label="Service overlap" value={score.serviceLineMatchScore} /><ScoreBar label="Subservice depth" value={score.subserviceDepthScore} /><ScoreBar label="Andwell differentiation" value={score.andwellDifferentiationScore} /><ScoreBar label="Review risk" value={score.reviewRiskScore} /></div>)}</div></div>;
}

function Intake({ competitors, setCompetitors, urlInput, setUrlInput, addCompetitors, runAnalysis, busy }: { competitors: CompetitorInput[]; setCompetitors: (items: CompetitorInput[]) => void; urlInput: string; setUrlInput: (value: string) => void; addCompetitors: () => void; runAnalysis: () => void; busy: boolean }) {
  return <><Section title="Competitor Intake" subtitle="Paste up to 25 competitor websites. The app crawls public pages and compares service lines and subservices against Andwell." /><div className="card"><textarea className="textarea" value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="https://competitorone.org\nhttps://competitortwo.org" /><div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}><Badge text={`${competitors.length} of 25 used`} /><div className="row"><button className="btn" onClick={addCompetitors}>Add URLs</button><button className="btn primary" disabled={busy} onClick={runAnalysis}>{busy ? 'Analyzing live websites' : 'Run intelligence analysis'}</button></div></div></div><div className="grid cols2" style={{ marginTop: 16 }}>{competitors.map((item, index) => <div className="card" key={`${item.url}${index}`}><h3>{item.name}</h3><p>{item.url}</p><button className="btn danger" onClick={() => setCompetitors(competitors.filter((_, i) => i !== index))}>Remove</button></div>)}</div></>;
}

function CompetitorSelect({ analyses, value, onChange }: { analyses: IntelligenceReport['analyses']; value: string; onChange: (value: string) => void }) {
  return <select className="select" value={value || analyses[0]?.id || ''} onChange={(event) => onChange(event.target.value)}>{analyses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
}

function Profiles({ analyses, selectedId, setSelectedId, selectedAnalysis }: { analyses: IntelligenceReport['analyses']; selectedId: string; setSelectedId: (id: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number] }) {
  return <><Section title="Competitor Profiles" subtitle="Executive profile showing overlap, threat level, lead with guidance, review risk, and source pages." action={<CompetitorSelect analyses={analyses} value={selectedId} onChange={setSelectedId} />} />{!selectedAnalysis ? <div className="notice">Run an analysis first.</div> : <div className="grid cols2"><div className="card"><h2>{selectedAnalysis.name}</h2><p>{selectedAnalysis.url}</p><Badge text={selectedAnalysis.score.threatLevel} className={selectedAnalysis.score.threatLevel === 'Strategic threat' ? 'badge red' : 'badge amber'} /><p>{selectedAnalysis.score.executiveReadout}</p><ScoreBar label="Service line overlap" value={selectedAnalysis.score.serviceLineMatchScore} /><ScoreBar label="Subservice depth" value={selectedAnalysis.score.subserviceDepthScore} /><ScoreBar label="Andwell differentiation" value={selectedAnalysis.score.andwellDifferentiationScore} /><ScoreBar label="Evidence strength" value={selectedAnalysis.score.evidenceStrengthScore} /></div><div className="card"><h3>Recommended sales posture</h3><p><b>Lead with:</b> {selectedAnalysis.score.leadWith.join(', ') || 'Andwell continuum depth'}</p><p><b>Strongest matches:</b> {selectedAnalysis.score.strongestMatches.join(', ') || 'No strong matches found publicly'}</p><p><b>Review first:</b> {selectedAnalysis.score.needsReview.join(', ') || 'No major review flags'}</p><h3>Pages reviewed</h3>{selectedAnalysis.pagesReviewed.slice(0, 12).map((page) => <p key={page.url}><a href={page.url} target="_blank">{page.title}</a></p>)}</div></div>}</>;
}

function ServiceMatrix({ analyses, findings, open }: { analyses: IntelligenceReport['analyses']; findings: Finding[]; open: (item: Finding) => void }) {
  return <><Section title="Service Line Matrix" subtitle="Main service line comparison with subservice depth score for each competitor." />{!analyses.length ? <div className="notice">Run an analysis first.</div> : <div className="tableWrap"><table><thead><tr><th>Service line</th><th>Andwell</th>{analyses.map((analysis) => <th key={analysis.id}>{analysis.name}</th>)}</tr></thead><tbody>{andwellCatalog.map((service) => <tr key={service.serviceLine}><td><b>{service.serviceLine}</b><br /><span className="muted">{service.category}</span></td><td><Badge text="Clearly offered" className="badge green" /></td>{analyses.map((analysis) => { const item = findings.find((finding) => finding.competitorId === analysis.id && finding.serviceLine === service.serviceLine); return <td key={analysis.id}>{item ? <button className={statusClass[item.competitorStatus]} onClick={() => open(item)}>{item.competitorStatus} | {item.subserviceDepthScore}% depth</button> : <Badge text="Needs review" className="badge red" />}</td>; })}</tr>)}</tbody></table></div>}</>;
}

function SubserviceMatrix({ analyses, items, selectedServiceLine, setSelectedServiceLine, open }: { analyses: IntelligenceReport['analyses']; items: SubserviceFinding[]; selectedServiceLine: string; setSelectedServiceLine: (line: string) => void; open: (item: SubserviceFinding) => void }) {
  const service = andwellCatalog.find((entry) => entry.serviceLine === selectedServiceLine) || andwellCatalog[0];
  return <><Section title="Subservice Matrix" subtitle="Each capability has its own evidence backed finding." action={<select className="select" value={selectedServiceLine} onChange={(event) => setSelectedServiceLine(event.target.value)}>{andwellCatalog.map((entry) => <option key={entry.serviceLine}>{entry.serviceLine}</option>)}</select>} /><div className="card"><h3>{service.serviceLine}</h3><p>{service.description}</p></div>{!analyses.length ? <div className="notice" style={{ marginTop: 16 }}>Run an analysis first.</div> : <div className="tableWrap" style={{ marginTop: 16 }}><table><thead><tr><th>Capability</th><th>Andwell</th>{analyses.map((analysis) => <th key={analysis.id}>{analysis.name}</th>)}</tr></thead><tbody>{service.subservices.map((subservice) => <tr key={subservice}><td><b>{subservice}</b></td><td><Badge text="Clearly offered" className="badge green" /></td>{analyses.map((analysis) => { const item = items.find((finding) => finding.competitorId === analysis.id && finding.serviceLine === service.serviceLine && finding.subservice === subservice); return <td key={analysis.id}>{item ? <button className={statusClass[item.competitorStatus]} onClick={() => open(item)}>{item.competitorStatus}</button> : <Badge text="Needs review" className="badge red" />}</td>; })}</tr>)}</tbody></table></div>}</>;
}

function Gaps({ analyses, selectedId, setSelectedId, selectedAnalysis, findings, subFindings, open }: { analyses: IntelligenceReport['analyses']; selectedId: string; setSelectedId: (id: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; findings: Finding[]; subFindings: SubserviceFinding[]; open: (item: EvidenceItem) => void }) {
  const serviceAdvantages = findings.filter((item) => item.competitorStatus !== 'Clearly offered');
  const subAdvantages = subFindings.filter((item) => item.competitorStatus !== 'Clearly offered').slice(0, 30);
  return <><Section title="Gap Finder" subtitle="Service and subservice opportunities based on public evidence and safe wording." action={<CompetitorSelect analyses={analyses} value={selectedId} onChange={setSelectedId} />} />{!selectedAnalysis ? <div className="notice">Run an analysis first.</div> : <div className="grid cols3"><div className="card"><h3>Service opportunities</h3>{serviceAdvantages.map((item) => <FindingCard key={item.id} item={item} open={open} />)}</div><div className="card" style={{ gridColumn: 'span 2' }}><h3>Subservice opportunities</h3>{subAdvantages.map((item) => <FindingCard key={item.id} item={item} open={open} />)}</div></div>}</>;
}

function FindingCard({ item, open }: { item: EvidenceItem; open: (item: EvidenceItem) => void }) {
  return <div className="miniFinding"><div className="row" style={{ justifyContent: 'space-between' }}><b>{sectionTitle(item)}</b><div className="row"><Badge text={item.competitorStatus} className={statusClass[item.competitorStatus]} /><Badge text={item.confidence} className={confidenceClass[item.confidence]} /></div></div><p>{item.safeSalesWording}</p><button className="btn" onClick={() => open(item)}>Open evidence</button></div>;
}

function Battlecards({ analyses, selectedId, setSelectedId, selectedAnalysis, findings }: { analyses: IntelligenceReport['analyses']; selectedId: string; setSelectedId: (id: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; findings: Finding[] }) {
  const advantages = findings.filter((item) => item.competitorStatus !== 'Clearly offered').slice(0, 8);
  const matches = findings.filter((item) => item.competitorStatus === 'Clearly offered').slice(0, 8);
  return <><Section title="Battlecards" subtitle="Competitor specific sales positioning for field use." action={<CompetitorSelect analyses={analyses} value={selectedId} onChange={setSelectedId} />} />{!selectedAnalysis ? <div className="notice">Run an analysis first.</div> : <div className="card"><h2>{selectedAnalysis.name} Battlecard</h2><div className="grid cols3"><div className="card"><h3>Lead with</h3>{selectedAnalysis.score.leadWith.map((item) => <p key={item}>{item}</p>)}</div><div className="card"><h3>Where Andwell appears stronger</h3>{advantages.map((item) => <p key={item.id}>{item.serviceLine}</p>)}</div><div className="card"><h3>Where they match publicly</h3>{matches.map((item) => <p key={item.id}>{item.serviceLine} | {item.subserviceDepthScore}% depth</p>)}</div></div><div className="success" style={{ marginTop: 12 }}><b>Opening talk track</b><br />Lead with specific Andwell service depth, not broad category claims. Connect the conversation to patient complexity, caregiver burden, discharge risk, or continuity of care.</div><div className="error" style={{ marginTop: 12 }}><b>Do not say</b><br />Do not say the competitor does not offer a service unless approved evidence confirms it. Use not found publicly for website based findings.</div></div>}</>;
}

function TalkTracks({ analyses, selectedId, setSelectedId, selectedAnalysis, selectedService, serviceLine, setServiceLine, audience, setAudience, findings }: { analyses: IntelligenceReport['analyses']; selectedId: string; setSelectedId: (id: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; selectedService: typeof andwellCatalog[number]; serviceLine: string; setServiceLine: (line: string) => void; audience: string; setAudience: (audience: string) => void; findings: Finding[] }) {
  const finding = findings.find((item) => item.serviceLine === serviceLine);
  return <><Section title="Talk Track Builder" subtitle="Build field language by competitor, service line, and referral source type." /><div className="card"><div className="grid cols3"><label>Competitor<CompetitorSelect analyses={analyses} value={selectedId} onChange={setSelectedId} /></label><label>Service line<select className="select" value={serviceLine} onChange={(event) => setServiceLine(event.target.value)}>{andwellCatalog.map((service) => <option key={service.serviceLine}>{service.serviceLine}</option>)}</select></label><label>Referral source<select className="select" value={audience} onChange={(event) => setAudience(event.target.value)}>{referralAudiences.map((item) => <option key={item}>{item}</option>)}</select></label></div></div><div className="grid cols2" style={{ marginTop: 16 }}><div className="card"><h3>Short talk track</h3><p>For a {audience.toLowerCase()}, position Andwell’s {selectedService.serviceLine} around specific capabilities, including {selectedService.subservices.slice(0, 8).join(', ')}.</p></div><div className="card"><h3>Competitive angle</h3><p>{finding ? finding.safeSalesWording : 'Run analysis and select a competitor to generate a competitor specific angle.'}</p></div><div className="card"><h3>Referral question</h3><p>Are you looking for the basic service category, or do you need a provider that can support detailed needs like {selectedService.subservices.slice(0, 5).join(', ')}?</p></div><div className="card"><h3>Objection response</h3><p>If the referral source already uses {selectedAnalysis?.name || 'this competitor'}, acknowledge the relationship, then pivot to the patient situation and Andwell’s specific capabilities inside {selectedService.serviceLine}.</p></div></div></>;
}

function EvidenceLibrary({ findings, subFindings, open }: { findings: Finding[]; subFindings: SubserviceFinding[]; open: (item: EvidenceItem) => void }) {
  const [kind, setKind] = useState<'service' | 'subservice'>('service');
  const items: EvidenceItem[] = kind === 'service' ? findings : subFindings;
  return <><Section title="Evidence Library" subtitle="Every finding is traceable to evidence, confidence, and safe wording." action={<select className="select" value={kind} onChange={(event) => setKind(event.target.value as 'service' | 'subservice')}><option value="service">Service findings</option><option value="subservice">Subservice findings</option></select>} />{!items.length ? <div className="notice">Run an analysis first.</div> : <div className="grid">{items.map((item) => <div className="card" key={item.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{item.competitorName}: {sectionTitle(item)}</h3><div className="row"><Badge text={item.competitorStatus} className={statusClass[item.competitorStatus]} /><Badge text={item.confidence} className={confidenceClass[item.confidence]} /></div></div><p>{item.evidenceExcerpt}</p><button className="btn" onClick={() => open(item)}>Open evidence</button></div>)}</div>}</>;
}

function ReviewCenter({ findings, subFindings, review, open }: { findings: Finding[]; subFindings: SubserviceFinding[]; review: Record<string, string>; open: (item: EvidenceItem) => void }) {
  const items: EvidenceItem[] = [...findings, ...subFindings].filter((item) => (review[item.id] || item.reviewStatus) !== 'Sales usable with evidence' && (review[item.id] || item.reviewStatus) !== 'Approved for sales use');
  return <><Section title="Review Center" subtitle="Approve findings before turning them into field language." />{!items.length ? <div className="success">No open review items.</div> : <div className="grid">{items.map((item) => <div className="card" key={item.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{sectionTitle(item)}</h3><Badge text={review[item.id] || item.reviewStatus} className="badge red" /></div><p>{item.safeSalesWording}</p><button className="btn" onClick={() => open(item)}>Review</button></div>)}</div>}</>;
}

function Reports({ report, exportReport }: { report: IntelligenceReport | null; exportReport: (type: 'json' | 'csv' | 'html') => void }) {
  return <><Section title="Reports" subtitle="Export the current intelligence report." action={<div className="row"><button className="btn" onClick={() => exportReport('json')}>Export JSON</button><button className="btn" onClick={() => exportReport('csv')}>Export CSV</button><button className="btn" onClick={() => exportReport('html')}>Export HTML</button></div>} />{report ? <div className="success">Loaded report with {report.competitorsAnalyzed} competitors and {report.allSubserviceFindings.length} subservice findings.</div> : <div className="notice">Run an analysis first.</div>}</>;
}
