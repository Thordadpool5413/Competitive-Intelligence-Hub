'use client';

import { useMemo, useState } from 'react';
import { andwellCatalog, referralAudiences } from '@/lib/andwell';
import type { CompetitorInput, CompetitorScore, Finding, IntelligenceReport, SubserviceFinding } from '@/lib/types';

type View = 'dashboard' | 'catalog' | 'competitors' | 'profiles' | 'matrix' | 'subservices' | 'gaps' | 'battlecards' | 'talktracks' | 'evidence' | 'review' | 'reports';
type DrawerItem = Finding | SubserviceFinding | null;

const views: { key: View; label: string }[] = [
  { key: 'dashboard', label: 'Command Center' },
  { key: 'catalog', label: 'Andwell Catalog' },
  { key: 'competitors', label: 'Competitor Intake' },
  { key: 'profiles', label: 'Competitor Profiles' },
  { key: 'matrix', label: 'Service Matrix' },
  { key: 'subservices', label: 'Subservice Matrix' },
  { key: 'gaps', label: 'Gap Finder' },
  { key: 'battlecards', label: 'Battlecards' },
  { key: 'talktracks', label: 'Talk Tracks' },
  { key: 'evidence', label: 'Evidence' },
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

const confidenceClass: Record<string, string> = { High: 'badge green', Moderate: 'badge amber', Low: 'badge red', 'Not found': 'badge', 'Needs review': 'badge purple' };

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

function Section({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) {
  return <div className="section"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function Badge({ text, className = 'badge' }: { text: string | number; className?: string }) {
  return <span className={className}>{text}</span>;
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return <div className="score"><div className="scoreTop"><span>{label}</span><b>{value}%</b></div><div className="scoreTrack"><div className="scoreFill" style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }} /></div></div>;
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

function html(value: unknown) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function isSubserviceFinding(item: DrawerItem): item is SubserviceFinding {
  return !!item && 'subservice' in item;
}

function allSavedReports(): IntelligenceReport[] {
  if (typeof window === 'undefined') return [];
  try { return JSON.parse(localStorage.getItem('andwellReports') || '[]') as IntelligenceReport[]; } catch { return []; }
}

export default function Page() {
  const [view, setView] = useState<View>('dashboard');
  const [urlInput, setUrlInput] = useState('');
  const [competitors, setCompetitors] = useState<CompetitorInput[]>([]);
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState('');
  const [selectedServiceLine, setSelectedServiceLine] = useState('Mobile Wound Care');
  const [selectedAudience, setSelectedAudience] = useState('Hospital discharge planner');
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState<DrawerItem>(null);
  const [review, setReview] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [savedReports, setSavedReports] = useState<IntelligenceReport[]>([]);

  const analyses = report?.analyses || [];
  const findings = report?.allFindings || [];
  const subserviceFindings = report?.allSubserviceFindings || [];
  const selectedAnalysis = analyses.find((item) => item.id === selectedCompetitorId) || analyses[0];
  const selectedFindings = selectedAnalysis ? findings.filter((item) => item.competitorId === selectedAnalysis.id) : [];
  const selectedSubserviceFindings = selectedAnalysis ? subserviceFindings.filter((item) => item.competitorId === selectedAnalysis.id) : [];
  const selectedService = andwellCatalog.find((item) => item.serviceLine === selectedServiceLine) || andwellCatalog[0];

  const stats = useMemo(() => ({
    competitors: report?.competitorsAnalyzed || competitors.length,
    pages: report?.pagesReviewed || 0,
    services: andwellCatalog.length,
    subservices: andwellCatalog.reduce((sum, service) => sum + service.subservices.length, 0),
    subFindings: subserviceFindings.length,
    advantages: report?.potentialAndwellAdvantages || 0,
    matches: report?.matchedServiceFindings || 0,
    review: report?.humanReviewItems || 0
  }), [report, competitors.length, subserviceFindings.length]);

  function addCompetitors() {
    setError('');
    const urls = urlInput.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
    const slots = Math.max(0, 25 - competitors.length);
    const next = urls.slice(0, slots).map((url) => ({ name: nameFromUrl(url), url: normalizeUrl(url), market: 'Not provided' }));
    setCompetitors((current) => [...current, ...next]);
    setUrlInput('');
    if (urls.length > slots) setNotice(`Only ${slots} URLs were added because the app limit is 25 competitors.`);
  }

  async function runAnalysis() {
    setBusy(true); setError(''); setNotice('');
    try {
      if (!competitors.length) throw new Error('Add at least one competitor URL first.');
      const response = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ competitors, maxPagesPerSite: 24 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Analysis failed.');
      setReport(data); setSelectedCompetitorId(data.analyses?.[0]?.id || ''); setView('dashboard'); setNotice('Live competitor intelligence analysis complete.');
      const saved = allSavedReports();
      const next = [data, ...saved.filter((item) => item.id !== data.id)].slice(0, 20);
      localStorage.setItem('andwellReports', JSON.stringify(next));
      setSavedReports(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error.');
    } finally { setBusy(false); }
  }

  function updateReview(id: string, value: string) {
    setReview((current) => ({ ...current, [id]: value }));
    setNotice('Review status updated locally. Export the report to preserve this review note.');
  }

  function exportReport(type: 'json' | 'csv' | 'html') {
    if (!report) { setError('Run or load an analysis before exporting.'); return; }
    if (type === 'json') exportBlob(JSON.stringify({ ...report, review }, null, 2), 'andwell-competitive-report.json', 'application/json');
    if (type === 'csv') {
      const rows = [['Type','Competitor','Service Line','Subservice','Status','Confidence','Review','Source','Evidence','Safe Sales Wording']];
      findings.forEach((finding) => rows.push(['Service', finding.competitorName, finding.serviceLine, '', finding.competitorStatus, finding.confidence, review[finding.id] || finding.reviewStatus, finding.sourceUrl || '', finding.evidenceExcerpt, finding.safeSalesWording]));
      subserviceFindings.forEach((finding) => rows.push(['Subservice', finding.competitorName, finding.serviceLine, finding.subservice, finding.competitorStatus, finding.confidence, review[finding.id] || finding.reviewStatus, finding.sourceUrl || '', finding.evidenceExcerpt, finding.safeSalesWording]));
      exportBlob(rows.map((row) => row.map(csv).join(',')).join('\n'), 'andwell-competitive-findings.csv', 'text/csv');
    }
    if (type === 'html') {
      const insightCards = (report.executiveInsights || []).map((insight) => `<section><h2>${html(insight.title)}</h2><p><b>Priority:</b> ${html(insight.priority)} | <b>Audience:</b> ${html(insight.audience)}</p><p>${html(insight.summary)}</p><p><b>Action:</b> ${html(insight.action)}</p></section>`).join('');
      const scoreCards = (report.competitorScores || []).map((score) => `<section><h2>${html(score.competitorName)}</h2><p><b>Threat:</b> ${html(score.threatLevel)}</p><p>Overlap ${score.serviceLineMatchScore}% | Depth ${score.subserviceDepthScore}% | Andwell differentiation ${score.andwellDifferentiationScore}% | Review risk ${score.reviewRiskScore}%</p><p>${html(score.executiveReadout)}</p></section>`).join('');
      const cards = findings.map((finding) => `<section><h3>${html(finding.competitorName)}: ${html(finding.serviceLine)}</h3><p><b>Status:</b> ${html(finding.competitorStatus)} | <b>Confidence:</b> ${html(finding.confidence)} | <b>Depth:</b> ${finding.subserviceDepthScore}%</p><p><b>Evidence:</b> ${html(finding.evidenceExcerpt)}</p><p><b>Interpretation:</b> ${html(finding.aiInterpretation)}</p><p><b>Safe wording:</b> ${html(finding.safeSalesWording)}</p></section>`).join('');
      exportBlob(`<!doctype html><html><head><meta charset="utf-8"><title>Andwell Competitive Intelligence Report</title><style>body{font-family:Arial;margin:40px;line-height:1.55;color:#0f172a}section{border:1px solid #ddd;border-radius:14px;padding:16px;margin:12px 0}</style></head><body><h1>Andwell Competitive Intelligence Report</h1><p>${html(report.executiveSummary)}</p><h2>Executive Insights</h2>${insightCards}<h2>Competitor Scores</h2>${scoreCards}<h2>Service Findings</h2>${cards}</body></html>`, 'andwell-competitive-report.html', 'text/html');
    }
  }

  function loadSavedReport(index: number) {
    const item = savedReports[index] || allSavedReports()[index];
    if (item) { setReport(item); setSelectedCompetitorId(item.analyses?.[0]?.id || ''); setView('dashboard'); }
  }

  function refreshSavedReports() {
    setSavedReports(allSavedReports());
    setNotice('Saved reports refreshed from this browser.');
  }

  return <div className="shell">
    {drawer && <EvidenceDrawer item={drawer} review={review} updateReview={updateReview} close={() => setDrawer(null)} />}
    <aside className="side"><div className="brand"><h1>Andwell Advantage Intelligence Hub</h1><p>Executive, leader, and field ready competitive service intelligence.</p></div><nav className="nav">{views.map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>{item.label}</button>)}</nav></aside>
    <main className="main"><header className="head"><div><small>Baseline Provider</small><h2>Andwell Health Partners</h2></div><input className="input" style={{ maxWidth: 650 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask what to say, where Andwell appears stronger, or what evidence supports a finding" /></header><div className="content">{error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}{notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}{query && <FieldAssistant query={query} selectedAnalysis={selectedAnalysis} selectedService={selectedService} selectedFindings={selectedFindings} />}
      {view === 'dashboard' && <Dashboard stats={stats} report={report} setView={setView} />}
      {view === 'catalog' && <Catalog />}
      {view === 'competitors' && <Competitors competitors={competitors} setCompetitors={setCompetitors} urlInput={urlInput} setUrlInput={setUrlInput} addCompetitors={addCompetitors} runAnalysis={runAnalysis} busy={busy} />}
      {view === 'profiles' && <Profiles analyses={analyses} selectedCompetitorId={selectedCompetitorId} setSelectedCompetitorId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} />}
      {view === 'matrix' && <Matrix analyses={analyses} findings={findings} setDrawer={setDrawer} />}
      {view === 'subservices' && <Subservices selectedServiceLine={selectedServiceLine} setSelectedServiceLine={setSelectedServiceLine} analyses={analyses} subserviceFindings={subserviceFindings} setDrawer={setDrawer} />}
      {view === 'gaps' && <Gaps analyses={analyses} selectedCompetitorId={selectedCompetitorId} setSelectedCompetitorId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} selectedFindings={selectedFindings} selectedSubserviceFindings={selectedSubserviceFindings} setDrawer={setDrawer} />}
      {view === 'battlecards' && <Battlecards analyses={analyses} selectedCompetitorId={selectedCompetitorId} setSelectedCompetitorId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} selectedFindings={selectedFindings} />}
      {view === 'talktracks' && <TalkTracks analyses={analyses} selectedCompetitorId={selectedCompetitorId} setSelectedCompetitorId={setSelectedCompetitorId} selectedServiceLine={selectedServiceLine} setSelectedServiceLine={setSelectedServiceLine} selectedAudience={selectedAudience} setSelectedAudience={setSelectedAudience} selectedService={selectedService} selectedAnalysis={selectedAnalysis} selectedFindings={selectedFindings} />}
      {view === 'evidence' && <Evidence findings={findings} subserviceFindings={subserviceFindings} setDrawer={setDrawer} />}
      {view === 'review' && <Review findings={findings} subserviceFindings={subserviceFindings} review={review} setDrawer={setDrawer} />}
      {view === 'reports' && <Reports savedReports={savedReports} loadSavedReport={loadSavedReport} refreshSavedReports={refreshSavedReports} report={report} exportReport={exportReport} />}
    </div></main>
  </div>;
}

function EvidenceDrawer({ item, review, updateReview, close }: { item: Finding | SubserviceFinding; review: Record<string, string>; updateReview: (id: string, value: string) => void; close: () => void }) {
  return <><div className="drawerBg" onClick={close} /><aside className="drawer"><div className="row" style={{ justifyContent: 'space-between' }}><h2>Evidence Drawer</h2><button className="btn" onClick={close}>Close</button></div><p><b>{item.competitorName}</b> · {item.serviceLine}{isSubserviceFinding(item) ? ` · ${item.subservice}` : ''}</p><div className="row"><Badge text={item.competitorStatus} className={statusClass[item.competitorStatus]} /><Badge text={item.confidence} className={confidenceClass[item.confidence]} /><Badge text={review[item.id] || item.reviewStatus} /></div><div className="card"><h3>Evidence</h3><p>{item.evidenceExcerpt}</p>{item.sourceUrl && <a className="btn" href={item.sourceUrl} target="_blank">Open source page</a>}</div><div className="card"><h3>Interpretation</h3><p>{item.aiInterpretation}</p></div><div className="success"><b>Safe wording</b><br />{item.safeSalesWording}</div><div className="error" style={{ marginTop: 12 }}><b>Avoid saying</b><br />{item.avoidSaying}</div><div className="card"><h3>Review action</h3><div className="row"><button className="btn primary" onClick={() => updateReview(item.id, 'Approved for sales use')}>Approve</button><button className="btn" onClick={() => updateReview(item.id, 'Needs edits')}>Needs edits</button><button className="btn danger" onClick={() => updateReview(item.id, 'Rejected')}>Reject</button></div></div></aside></>;
}

function Dashboard({ stats, report, setView }: { stats: Record<string, number>; report: IntelligenceReport | null; setView: (v: View) => void }) {
  const cards = [['Competitors', stats.competitors], ['Pages reviewed', stats.pages], ['Service lines', stats.services], ['Subservices', stats.subservices], ['Subservice findings', stats.subFindings], ['Potential advantages', stats.advantages], ['Matched services', stats.matches], ['Review items', stats.review]];
  return <><Section title="Command Center" subtitle="Executive snapshot of competitive overlap, Andwell differentiation, service depth, and review risk." action={<button className="btn primary" onClick={() => setView('competitors')}>Add competitors</button>} /><div className="grid cols4">{cards.map(([label, value]) => <div className="card kpiCard" key={label}><div className="muted">{label}</div><div className="kpi">{value}</div></div>)}</div>{report ? <><div className="hero"><h2>Executive Summary</h2><p>{report.executiveSummary}</p></div><div className="grid cols3">{(report.executiveInsights || []).map((insight) => <div className="card" key={insight.title}><div className="row"><Badge text={insight.priority} className={insight.priority === 'High' ? 'badge red' : 'badge amber'} /><Badge text={insight.audience} /></div><h3>{insight.title}</h3><p>{insight.summary}</p><div className="notice"><b>Recommended action</b><br />{insight.action}</div></div>)}</div><CompetitorScoreboard scores={report.competitorScores || []} /></> : <div className="notice" style={{ marginTop: 16 }}>No report loaded yet. Add competitor URLs and run live analysis.</div>}</>;
}

function CompetitorScoreboard({ scores }: { scores: CompetitorScore[] }) {
  if (!scores.length) return null;
  return <div className="card" style={{ marginTop: 16 }}><h2>Competitor Intelligence Scoreboard</h2><div className="grid cols2">{scores.map((score) => <div className="scoreCard" key={score.competitorId}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{score.competitorName}</h3><Badge text={score.threatLevel} className={score.threatLevel === 'Strategic threat' ? 'badge red' : score.threatLevel === 'High overlap' ? 'badge amber' : 'badge blue'} /></div><p>{score.executiveReadout}</p><ScoreBar label="Service overlap" value={score.serviceLineMatchScore} /><ScoreBar label="Subservice depth" value={score.subserviceDepthScore} /><ScoreBar label="Andwell differentiation" value={score.andwellDifferentiationScore} /><ScoreBar label="Review risk" value={score.reviewRiskScore} /></div>)}</div></div>;
}

function Catalog() {
  const [filter, setFilter] = useState('');
  const services = andwellCatalog.filter((s) => `${s.category} ${s.serviceLine} ${s.subservices.join(' ')}`.toLowerCase().includes(filter.toLowerCase()));
  return <><Section title="Andwell Service Catalog" subtitle="The baseline taxonomy used to compare every competitor at service and subservice level." action={<input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search catalog" />} /><div className="grid cols2">{services.map((s) => <div className="card" key={s.serviceLine}><Badge text={s.category} /><h3>{s.serviceLine}</h3><p>{s.description}</p><div className="row">{s.subservices.slice(0, 16).map((x) => <Badge key={x} text={x} />)}{s.subservices.length > 16 && <Badge text={`More: ${s.subservices.length - 16}`} />}</div><div className="success" style={{ marginTop: 12 }}><b>Safe language</b><br />{s.safeLanguage}</div><div className="error" style={{ marginTop: 12 }}><b>Avoid saying</b><br />{s.avoid}</div><a className="btn" style={{ marginTop: 12 }} href={s.evidence} target="_blank">Open Andwell source</a></div>)}</div></>;
}

function Competitors(props: { competitors: CompetitorInput[]; setCompetitors: (v: CompetitorInput[]) => void; urlInput: string; setUrlInput: (v: string) => void; addCompetitors: () => void; runAnalysis: () => void; busy: boolean }) {
  return <><Section title="Competitor Intake" subtitle="Paste up to 25 public competitor websites. The server crawls pages, creates service findings, creates subservice findings, and builds executive intelligence scores." /><div className="card"><textarea className="textarea" value={props.urlInput} onChange={(e) => props.setUrlInput(e.target.value)} placeholder="https://competitorone.org\nhttps://competitortwo.org" /><div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}><Badge text={`${props.competitors.length} of 25 used`} /><div className="row"><button className="btn" onClick={props.addCompetitors}>Add URLs</button><button className="btn primary" onClick={props.runAnalysis} disabled={props.busy}>{props.busy ? 'Analyzing live websites' : 'Run intelligence analysis'}</button></div></div></div><div className="grid cols2" style={{ marginTop: 16 }}>{props.competitors.map((c, i) => <div className="card" key={`${c.url}${i}`}><h3>{c.name}</h3><p>{c.url}</p><button className="btn danger" onClick={() => props.setCompetitors(props.competitors.filter((_, index) => index !== i))}>Remove</button></div>)}</div></>;
}

function SelectCompetitor({ analyses, value, onChange }: { analyses: IntelligenceReport['analyses']; value: string; onChange: (v: string) => void }) {
  return <select className="select" value={value || analyses[0]?.id || ''} onChange={(e) => onChange(e.target.value)}>{analyses.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>;
}

function Profiles({ analyses, selectedCompetitorId, setSelectedCompetitorId, selectedAnalysis }: { analyses: IntelligenceReport['analyses']; selectedCompetitorId: string; setSelectedCompetitorId: (v: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number] }) {
  return <><Section title="Competitor Profiles" subtitle="Executive level profile for each competitor with overlap, threat level, lead with guidance, review risk, and source pages." action={<SelectCompetitor analyses={analyses} value={selectedCompetitorId} onChange={setSelectedCompetitorId} />} />{!selectedAnalysis ? <div className="notice">Run or load an analysis first.</div> : <div className="grid cols2"><div className="card"><h2>{selectedAnalysis.name}</h2><p>{selectedAnalysis.url}</p><Badge text={selectedAnalysis.score.threatLevel} className={selectedAnalysis.score.threatLevel === 'Strategic threat' ? 'badge red' : 'badge amber'} /><p>{selectedAnalysis.score.executiveReadout}</p><ScoreBar label="Service line overlap" value={selectedAnalysis.score.serviceLineMatchScore} /><ScoreBar label="Subservice depth" value={selectedAnalysis.score.subserviceDepthScore} /><ScoreBar label="Andwell differentiation" value={selectedAnalysis.score.andwellDifferentiationScore} /><ScoreBar label="Evidence strength" value={selectedAnalysis.score.evidenceStrengthScore} /></div><div className="card"><h3>Recommended sales posture</h3><p><b>Lead with:</b> {selectedAnalysis.score.leadWith.join(', ') || 'Andwell continuum depth'}</p><p><b>Strongest matches:</b> {selectedAnalysis.score.strongestMatches.join(', ') || 'No strong matches found publicly'}</p><p><b>Review first:</b> {selectedAnalysis.score.needsReview.join(', ') || 'No major review flags'}</p><h3>Pages reviewed</h3>{selectedAnalysis.pagesReviewed.slice(0, 12).map((p) => <p key={p.url}><a href={p.url} target="_blank">{p.title}</a></p>)}</div></div>}</>;
}

function Matrix({ analyses, findings, setDrawer }: { analyses: IntelligenceReport['analyses']; findings: Finding[]; setDrawer: (f: Finding) => void }) {
  return <><Section title="Service Line Matrix" subtitle="Main service line comparison with subservice depth score for each competitor." />{!analyses.length ? <div className="notice">Run or load an analysis first.</div> : <div className="tableWrap"><table><thead><tr><th>Service line</th><th>Andwell</th>{analyses.map((a) => <th key={a.id}>{a.name}</th>)}</tr></thead><tbody>{andwellCatalog.map((service) => <tr key={service.serviceLine}><td><b>{service.serviceLine}</b><br /><span className="muted">{service.category}</span></td><td><Badge text="Clearly offered" className="badge green" /></td>{analyses.map((a) => { const f = findings.find((x) => x.competitorId === a.id && x.serviceLine === service.serviceLine); return <td key={a.id}>{f ? <button className={statusClass[f.competitorStatus]} onClick={() => setDrawer(f)}>{f.competitorStatus} · {f.subserviceDepthScore}% depth</button> : <Badge text="Needs human review" className="badge red" />}</td>; })}</tr>)}</tbody></table></div>}</>;
}

function Subservices({ selectedServiceLine, setSelectedServiceLine, analyses, subserviceFindings, setDrawer }: { selectedServiceLine: string; setSelectedServiceLine: (v: string) => void; analyses: IntelligenceReport['analyses']; subserviceFindings: SubserviceFinding[]; setDrawer: (f: SubserviceFinding) => void }) {
  const service = andwellCatalog.find((s) => s.serviceLine === selectedServiceLine) || andwellCatalog[0];
  return <><Section title="Subservice Matrix" subtitle="Every capability is now its own evidence backed finding, not just a display row." action={<select className="select" value={selectedServiceLine} onChange={(e) => setSelectedServiceLine(e.target.value)}>{andwellCatalog.map((s) => <option key={s.serviceLine}>{s.serviceLine}</option>)}</select>} /><div className="card"><h3>{service.serviceLine}</h3><p>{service.description}</p></div>{!analyses.length ? <div className="notice" style={{ marginTop: 16 }}>Run or load an analysis first.</div> : <div className="tableWrap" style={{ marginTop: 16 }}><table><thead><tr><th>Capability</th><th>Andwell</th>{analyses.map((a) => <th key={a.id}>{a.name}</th>)}</tr></thead><tbody>{service.subservices.map((sub) => <tr key={sub}><td><b>{sub}</b></td><td><Badge text="Clearly offered" className="badge green" /></td>{analyses.map((a) => { const f = subserviceFindings.find((x) => x.competitorId === a.id && x.serviceLine === service.serviceLine && x.subservice === sub); return <td key={a.id}>{f ? <button className={statusClass[f.competitorStatus]} onClick={() => setDrawer(f)}>{f.competitorStatus}</button> : <Badge text="Needs human review" className="badge red" />}</td>; })}</tr>)}</tbody></table></div>}</>;
}

function Gaps(props: { analyses: IntelligenceReport['analyses']; selectedCompetitorId: string; setSelectedCompetitorId: (v: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; selectedFindings: Finding[]; selectedSubserviceFindings: SubserviceFinding[]; setDrawer: (f: Finding | SubserviceFinding) => void }) {
  const serviceAdvantages = props.selectedFindings.filter((f) => f.competitorStatus !== 'Clearly offered');
  const subAdvantages = props.selectedSubserviceFindings.filter((f) => f.competitorStatus !== 'Clearly offered').slice(0, 25);
  return <><Section title="Gap Finder" subtitle="Shows Andwell service and subservice advantages based on public evidence, with safe wording." action={<SelectCompetitor analyses={props.analyses} value={props.selectedCompetitorId} onChange={props.setSelectedCompetitorId} />} />{!props.selectedAnalysis ? <div className="notice">Run or load an analysis first.</div> : <div className="grid cols3"><div className="card"><h3>Service level advantages</h3>{serviceAdvantages.map((f) => <FindingCard key={f.id} finding={f} setDrawer={props.setDrawer} />)}</div><div className="card" style={{ gridColumn: 'span 2' }}><h3>Subservice level opportunities</h3>{subAdvantages.map((f) => <FindingCard key={f.id} finding={f} setDrawer={props.setDrawer} />)}</div></div>}</>;
}

function FindingCard({ finding, setDrawer }: { finding: Finding | SubserviceFinding; setDrawer: (f: Finding | SubserviceFinding) => void }) {
  return <div className="miniFinding"><div className="row" style={{ justifyContent: 'space-between' }}><b>{finding.serviceLine}{isSubserviceFinding(finding) ? `: ${finding.subservice}` : ''}</b><div className="row"><Badge text={finding.competitorStatus} className={statusClass[finding.competitorStatus]} /><Badge text={finding.confidence} className={confidenceClass[finding.confidence]} /></div></div><p>{finding.safeSalesWording}</p><button className="btn" onClick={() => setDrawer(finding)}>Open evidence</button></div>;
}

function Battlecards(props: { analyses: IntelligenceReport['analyses']; selectedCompetitorId: string; setSelectedCompetitorId: (v: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; selectedFindings: Finding[] }) {
  const advantages = props.selectedFindings.filter((f) => f.competitorStatus !== 'Clearly offered').slice(0, 8);
  const matches = props.selectedFindings.filter((f) => f.competitorStatus === 'Clearly offered').slice(0, 8);
  return <><Section title="Battlecards" subtitle="Competitor specific sales positioning for field use." action={<SelectCompetitor analyses={props.analyses} value={props.selectedCompetitorId} onChange={props.setSelectedCompetitorId} />} />{!props.selectedAnalysis ? <div className="notice">Run or load an analysis first.</div> : <div className="card"><h2>{props.selectedAnalysis.name} Battlecard</h2><div className="grid cols3"><div className="card"><h3>Lead with</h3>{props.selectedAnalysis.score.leadWith.map((x) => <p key={x}>{x}</p>)}</div><div className="card"><h3>Where Andwell appears stronger</h3>{advantages.map((f) => <p key={f.id}>{f.serviceLine}</p>)}</div><div className="card"><h3>Where they match publicly</h3>{matches.map((f) => <p key={f.id}>{f.serviceLine} · {f.subserviceDepthScore}% depth</p>)}</div></div><div className="success" style={{ marginTop: 12 }}><b>Opening talk track</b><br />Based on reviewed public pages, Andwell should lead with specific service depth, not broad category claims. Start with the service lines this competitor does not clearly promote publicly, then connect the conversation to patient complexity, caregiver burden, discharge risk, or continuity of care.</div><div className="notice" style={{ marginTop: 12 }}><b>Best question</b><br />When this patient’s needs change, do you want one provider that can support multiple service needs across the care journey, or are you mainly solving one immediate referral problem?</div><div className="error" style={{ marginTop: 12 }}><b>Do not say</b><br />Do not say the competitor does not offer a service unless approved evidence confirms it. Use not found publicly for website based findings.</div></div>}</>;
}

function TalkTracks(props: { analyses: IntelligenceReport['analyses']; selectedCompetitorId: string; setSelectedCompetitorId: (v: string) => void; selectedServiceLine: string; setSelectedServiceLine: (v: string) => void; selectedAudience: string; setSelectedAudience: (v: string) => void; selectedService: typeof andwellCatalog[number]; selectedAnalysis?: IntelligenceReport['analyses'][number]; selectedFindings: Finding[] }) {
  const finding = props.selectedFindings.find((f) => f.serviceLine === props.selectedServiceLine);
  return <><Section title="Talk Track Builder" subtitle="Build field language by competitor, service line, and referral source type." /><div className="card"><div className="grid cols3"><label>Competitor<SelectCompetitor analyses={props.analyses} value={props.selectedCompetitorId} onChange={props.setSelectedCompetitorId} /></label><label>Service line<select className="select" value={props.selectedServiceLine} onChange={(e) => props.setSelectedServiceLine(e.target.value)}>{andwellCatalog.map((s) => <option key={s.serviceLine}>{s.serviceLine}</option>)}</select></label><label>Referral source<select className="select" value={props.selectedAudience} onChange={(e) => props.setSelectedAudience(e.target.value)}>{referralAudiences.map((a) => <option key={a}>{a}</option>)}</select></label></div></div><div className="grid cols2" style={{ marginTop: 16 }}><div className="card"><h3>Short talk track</h3><p>For a {props.selectedAudience.toLowerCase()}, position Andwell’s {props.selectedService.serviceLine} around specific capabilities: {props.selectedService.subservices.slice(0, 8).join(', ')}.</p></div><div className="card"><h3>Competitive angle</h3><p>{finding ? finding.safeSalesWording : 'Run analysis and select a competitor to generate a competitor specific angle.'}</p></div><div className="card"><h3>Referral question</h3><p>Are you looking for the basic service category, or do you need a provider that can support detailed needs like {props.selectedService.subservices.slice(0, 5).join(', ')}?</p></div><div className="card"><h3>Objection response</h3><p>If the referral source already uses {props.selectedAnalysis?.name || 'this competitor'}, acknowledge the relationship, then pivot to the patient situation: “That makes sense. Where Andwell may help is when the need involves specific capabilities inside {props.selectedService.serviceLine}, especially when the case becomes more complex or the family needs broader support.”</p></div></div></>;
}

function Evidence({ findings, subserviceFindings, setDrawer }: { findings: Finding[]; subserviceFindings: SubserviceFinding[]; setDrawer: (f: Finding | SubserviceFinding) => void }) {
  const [kind, setKind] = useState<'service' | 'subservice'>('service');
  const items = kind === 'service' ? findings : subserviceFindings;
  return <><Section title="Evidence Library" subtitle="Every finding is traceable to public evidence, confidence, and safe wording." action={<select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'service' | 'subservice')}><option value="service">Service findings</option><option value="subservice">Subservice findings</option></select>} />{!items.length ? <div className="notice">Run or load an analysis first.</div> : <div className="grid">{items.map((f) => <div className="card" key={f.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{f.competitorName}: {f.serviceLine}{isSubserviceFinding(f) ? `: ${f.subservice}` : ''}</h3><div className="row"><Badge text={f.competitorStatus} className={statusClass[f.competitorStatus]} /><Badge text={f.confidence} className={confidenceClass[f.confidence]} /></div></div><p>{f.evidenceExcerpt}</p><button className="btn" onClick={() => setDrawer(f)}>Open evidence</button></div>)}</div>}</>;
}

function Review({ findings, subserviceFindings, review, setDrawer }: { findings: Finding[]; subserviceFindings: SubserviceFinding[]; review: Record<string, string>; setDrawer: (f: Finding | SubserviceFinding) => void }) {
  const items = [...findings, ...subserviceFindings].filter((f) => (review[f.id] || f.reviewStatus) !== 'Sales usable with evidence' && (review[f.id] || f.reviewStatus) !== 'Approved for sales use');
  return <><Section title="Human Review Center" subtitle="Approve findings before turning them into sales language." />{!items.length ? <div className="success">No open review items.</div> : <div className="grid">{items.map((f) => <div className="card" key={f.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{f.serviceLine}{isSubserviceFinding(f) ? `: ${f.subservice}` : ''}</h3><Badge text={review[f.id] || f.reviewStatus} className="badge red" /></div><p>{f.safeSalesWording}</p><button className="btn" onClick={() => setDrawer(f)}>Review</button></div>)}</div>}</>;
}

function Reports({ savedReports, loadSavedReport, refreshSavedReports, report, exportReport }: { savedReports: IntelligenceReport[]; loadSavedReport: (i: number) => void; refreshSavedReports: () => void; report: IntelligenceReport | null; exportReport: (type: 'json' | 'csv' | 'html') => void }) {
  return <><Section title="Reports" subtitle="Export current reports and reload locally saved reports." action={<div className="row"><button className="btn" onClick={refreshSavedReports}>Refresh saved</button><button className="btn" onClick={() => exportReport('json')}>Export JSON</button><button className="btn" onClick={() => exportReport('csv')}>Export CSV</button><button className="btn" onClick={() => exportReport('html')}>Export HTML</button></div>} />{report && <div className="success" style={{ marginBottom: 16 }}>Loaded report with {report.competitorsAnalyzed} competitors and {report.allSubserviceFindings?.length || 0} subservice findings.</div>}<div className="grid">{savedReports.map((r, i) => <div className="card" key={r.id}><h3>{r.analyses.map((a) => a.name).join(', ')}</h3><p>{new Date(r.generatedAt).toLocaleString()} · {r.pagesReviewed} pages reviewed · {r.potentialAndwellAdvantages} potential advantages · {r.allSubserviceFindings?.length || 0} subservice findings</p><button className="btn primary" onClick={() => loadSavedReport(i)}>Load</button></div>)}</div></>;
}

function FieldAssistant({ query, selectedAnalysis, selectedService, selectedFindings }: { query: string; selectedAnalysis?: IntelligenceReport['analyses'][number]; selectedService: typeof andwellCatalog[number]; selectedFindings: Finding[] }) {
  const finding = selectedFindings.find((f) => f.serviceLine === selectedService.serviceLine);
  return <div className="card assistant"><h3>Ask the Hub</h3><p><b>Question:</b> {query}</p><p>For {selectedService.serviceLine}, lead with specific capabilities, including {selectedService.subservices.slice(0, 8).join(', ')}. {selectedAnalysis ? `Against ${selectedAnalysis.name}, use the current evidence status and review risk before making a field claim.` : 'Run analysis to add competitor specific guidance.'}</p>{finding && <div className="notice"><b>Current competitive angle</b><br />{finding.safeSalesWording}</div>}</div>;
}
