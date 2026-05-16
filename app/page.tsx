'use client';

import { useMemo, useState } from 'react';
import { andwellCatalog, referralAudiences } from '@/lib/andwell';
import type { CompetitorInput, Finding, IntelligenceReport } from '@/lib/types';

type View = 'dashboard' | 'catalog' | 'competitors' | 'matrix' | 'subservices' | 'gaps' | 'battlecards' | 'talktracks' | 'evidence' | 'review' | 'reports';

const views: { key: View; label: string }[] = [
  { key: 'dashboard', label: 'Command Center' },
  { key: 'catalog', label: 'Andwell Catalog' },
  { key: 'competitors', label: 'Competitors' },
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

export default function Page() {
  const [view, setView] = useState<View>('dashboard');
  const [urlInput, setUrlInput] = useState('');
  const [competitors, setCompetitors] = useState<CompetitorInput[]>([]);
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState('');
  const [selectedServiceLine, setSelectedServiceLine] = useState('Mobile Wound Care');
  const [selectedAudience, setSelectedAudience] = useState('Hospital discharge planner');
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState<Finding | null>(null);
  const [review, setReview] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const analyses = report?.analyses || [];
  const findings = report?.allFindings || [];
  const selectedAnalysis = analyses.find((item) => item.id === selectedCompetitorId) || analyses[0];
  const selectedFindings = selectedAnalysis ? findings.filter((item) => item.competitorId === selectedAnalysis.id) : [];
  const selectedService = andwellCatalog.find((item) => item.serviceLine === selectedServiceLine) || andwellCatalog[0];

  const stats = useMemo(() => ({
    competitors: report?.competitorsAnalyzed || competitors.length,
    pages: report?.pagesReviewed || 0,
    services: andwellCatalog.length,
    subservices: andwellCatalog.reduce((sum, service) => sum + service.subservices.length, 0),
    advantages: report?.potentialAndwellAdvantages || 0,
    matches: report?.matchedServiceFindings || 0,
    review: report?.humanReviewItems || 0
  }), [report, competitors.length]);

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
      setReport(data); setSelectedCompetitorId(data.analyses?.[0]?.id || ''); setView('dashboard'); setNotice('Live competitor analysis complete.');
      const saved = JSON.parse(localStorage.getItem('andwellReports') || '[]');
      localStorage.setItem('andwellReports', JSON.stringify([data, ...saved.filter((item: IntelligenceReport) => item.id !== data.id)].slice(0, 20)));
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
      const rows = [['Competitor','Service Line','Competitor Status','Confidence','Review','Source','Evidence','Safe Sales Wording']];
      findings.forEach((finding) => rows.push([finding.competitorName, finding.serviceLine, finding.competitorStatus, finding.confidence, review[finding.id] || finding.reviewStatus, finding.sourceUrl || '', finding.evidenceExcerpt, finding.safeSalesWording]));
      exportBlob(rows.map((row) => row.map(csv).join(',')).join('\n'), 'andwell-competitive-findings.csv', 'text/csv');
    }
    if (type === 'html') {
      const cards = findings.map((finding) => `<section><h3>${html(finding.competitorName)}: ${html(finding.serviceLine)}</h3><p><b>Status:</b> ${html(finding.competitorStatus)} | <b>Confidence:</b> ${html(finding.confidence)} | <b>Review:</b> ${html(review[finding.id] || finding.reviewStatus)}</p><p><b>Evidence:</b> ${html(finding.evidenceExcerpt)}</p><p><b>Interpretation:</b> ${html(finding.aiInterpretation)}</p><p><b>Safe wording:</b> ${html(finding.safeSalesWording)}</p><p><b>Avoid saying:</b> ${html(finding.avoidSaying)}</p></section>`).join('');
      exportBlob(`<!doctype html><html><head><meta charset="utf-8"><title>Andwell Report</title><style>body{font-family:Arial;margin:40px;line-height:1.55}section{border:1px solid #ddd;border-radius:14px;padding:16px;margin:12px 0}</style></head><body><h1>Andwell Competitive Intelligence Report</h1><p>${html(report.executiveSummary)}</p>${cards}</body></html>`, 'andwell-competitive-report.html', 'text/html');
    }
  }

  function loadSavedReport(index: number) {
    const saved = JSON.parse(localStorage.getItem('andwellReports') || '[]') as IntelligenceReport[];
    const item = saved[index];
    if (item) { setReport(item); setSelectedCompetitorId(item.analyses?.[0]?.id || ''); setView('dashboard'); }
  }

  const savedReports = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('andwellReports') || '[]') as IntelligenceReport[] : [];

  return <div className="shell">
    {drawer && <><div className="drawerBg" onClick={() => setDrawer(null)} /><aside className="drawer"><div className="row" style={{ justifyContent: 'space-between' }}><h2>Evidence Drawer</h2><button className="btn" onClick={() => setDrawer(null)}>Close</button></div><p><b>{drawer.competitorName}</b> · {drawer.serviceLine}</p><div className="row"><Badge text={drawer.competitorStatus} className={statusClass[drawer.competitorStatus]} /><Badge text={drawer.confidence} className={confidenceClass[drawer.confidence]} /><Badge text={review[drawer.id] || drawer.reviewStatus} /></div><div className="card"><h3>Evidence</h3><p>{drawer.evidenceExcerpt}</p>{drawer.sourceUrl && <a className="btn" href={drawer.sourceUrl} target="_blank">Open source page</a>}</div><div className="success"><b>Safe wording</b><br />{drawer.safeSalesWording}</div><div className="error" style={{ marginTop: 12 }}><b>Avoid saying</b><br />{drawer.avoidSaying}</div><div className="card"><h3>Review</h3><div className="row"><button className="btn primary" onClick={() => updateReview(drawer.id, 'Approved for sales use')}>Approve</button><button className="btn" onClick={() => updateReview(drawer.id, 'Needs edits')}>Needs edits</button><button className="btn danger" onClick={() => updateReview(drawer.id, 'Rejected')}>Reject</button></div></div></aside></>}
    <aside className="side"><div className="brand"><h1>Andwell Advantage Intelligence Hub</h1><p>Live competitor service line intelligence for healthcare sales positioning.</p></div><nav className="nav">{views.map((item) => <button key={item.key} className={view === item.key ? 'active' : ''} onClick={() => setView(item.key)}>{item.label}</button>)}</nav></aside>
    <main className="main"><header className="head"><div><small>Baseline Provider</small><h2>Andwell Health Partners</h2></div><input className="input" style={{ maxWidth: 650 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask what to say, where Andwell appears stronger, or what evidence supports a finding" /></header><div className="content">{error && <div className="error" style={{ marginBottom: 16 }}>{error}</div>}{notice && <div className="notice" style={{ marginBottom: 16 }}>{notice}</div>}{query && <div className="card"><h3>Field Assistant</h3><p>For {selectedService.serviceLine}, lead with the specific capabilities inside the service line, including {selectedService.subservices.slice(0, 8).join(', ')}. Use evidence based language and avoid unsupported competitor claims.</p></div>}
      {view === 'dashboard' && <Dashboard stats={stats} report={report} setView={setView} />}
      {view === 'catalog' && <Catalog />}
      {view === 'competitors' && <Competitors competitors={competitors} setCompetitors={setCompetitors} urlInput={urlInput} setUrlInput={setUrlInput} addCompetitors={addCompetitors} runAnalysis={runAnalysis} busy={busy} />}
      {view === 'matrix' && <Matrix analyses={analyses} findings={findings} setDrawer={setDrawer} />}
      {view === 'subservices' && <Subservices selectedServiceLine={selectedServiceLine} setSelectedServiceLine={setSelectedServiceLine} analyses={analyses} findings={findings} />}
      {view === 'gaps' && <Gaps analyses={analyses} selectedCompetitorId={selectedCompetitorId} setSelectedCompetitorId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} selectedFindings={selectedFindings} setDrawer={setDrawer} />}
      {view === 'battlecards' && <Battlecards analyses={analyses} selectedCompetitorId={selectedCompetitorId} setSelectedCompetitorId={setSelectedCompetitorId} selectedAnalysis={selectedAnalysis} selectedFindings={selectedFindings} />}
      {view === 'talktracks' && <TalkTracks analyses={analyses} selectedCompetitorId={selectedCompetitorId} setSelectedCompetitorId={setSelectedCompetitorId} selectedServiceLine={selectedServiceLine} setSelectedServiceLine={setSelectedServiceLine} selectedAudience={selectedAudience} setSelectedAudience={setSelectedAudience} selectedService={selectedService} selectedAnalysis={selectedAnalysis} />}
      {view === 'evidence' && <Evidence findings={findings} setDrawer={setDrawer} />}
      {view === 'review' && <Review findings={findings} review={review} setDrawer={setDrawer} />}
      {view === 'reports' && <Reports savedReports={savedReports} loadSavedReport={loadSavedReport} report={report} exportReport={exportReport} />}
    </div></main>
  </div>;
}

function Dashboard({ stats, report, setView }: { stats: Record<string, number>; report: IntelligenceReport | null; setView: (v: View) => void }) {
  const cards = [['Competitors', stats.competitors], ['Pages reviewed', stats.pages], ['Service lines', stats.services], ['Subservices', stats.subservices], ['Potential advantages', stats.advantages], ['Matched findings', stats.matches], ['Needs review', stats.review]];
  return <><Section title="Command Center" subtitle="Leadership snapshot of the current competitive service intelligence analysis." action={<button className="btn primary" onClick={() => setView('competitors')}>Add competitors</button>} /><div className="grid cols4">{cards.map(([label, value]) => <div className="card" key={label}><div className="muted">{label}</div><div className="kpi">{value}</div></div>)}</div>{report ? <div className="grid cols2" style={{ marginTop: 16 }}><div className="card"><h3>Executive Summary</h3><p>{report.executiveSummary}</p></div><div className="card"><h3>Best next action</h3><p>Open Gap Finder, then verify Evidence before using any comparison in the field.</p><div className="row"><button className="btn" onClick={() => setView('gaps')}>Open Gap Finder</button><button className="btn" onClick={() => setView('battlecards')}>Open Battlecards</button></div></div></div> : <div className="notice" style={{ marginTop: 16 }}>No report loaded yet. Add competitor URLs and run live analysis.</div>}</>;
}

function Catalog() {
  const [filter, setFilter] = useState('');
  const services = andwellCatalog.filter((s) => `${s.category} ${s.serviceLine} ${s.subservices.join(' ')}`.toLowerCase().includes(filter.toLowerCase()));
  return <><Section title="Andwell Service Catalog" subtitle="The baseline taxonomy used to compare every competitor." action={<input className="input" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search catalog" />} /><div className="grid cols2">{services.map((s) => <div className="card" key={s.serviceLine}><Badge text={s.category} /><h3>{s.serviceLine}</h3><p>{s.description}</p><div className="row">{s.subservices.slice(0, 12).map((x) => <Badge key={x} text={x} />)}{s.subservices.length > 12 && <Badge text={`More: ${s.subservices.length - 12}`} />}</div><div className="success" style={{ marginTop: 12 }}><b>Safe language</b><br />{s.safeLanguage}</div><div className="error" style={{ marginTop: 12 }}><b>Avoid saying</b><br />{s.avoid}</div><a className="btn" style={{ marginTop: 12 }} href={s.evidence} target="_blank">Open Andwell source</a></div>)}</div></>;
}

function Competitors(props: { competitors: CompetitorInput[]; setCompetitors: (v: CompetitorInput[]) => void; urlInput: string; setUrlInput: (v: string) => void; addCompetitors: () => void; runAnalysis: () => void; busy: boolean }) {
  return <><Section title="Competitor Intake" subtitle="Paste up to 25 public competitor websites. The server crawls pages and compares public claims against Andwell." /><div className="card"><textarea className="textarea" value={props.urlInput} onChange={(e) => props.setUrlInput(e.target.value)} placeholder="https://competitorone.org\nhttps://competitortwo.org" /><div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}><Badge text={`${props.competitors.length} of 25 used`} /><div className="row"><button className="btn" onClick={props.addCompetitors}>Add URLs</button><button className="btn primary" onClick={props.runAnalysis} disabled={props.busy}>{props.busy ? 'Analyzing live websites' : 'Run live analysis'}</button></div></div></div><div className="grid cols2" style={{ marginTop: 16 }}>{props.competitors.map((c, i) => <div className="card" key={`${c.url}${i}`}><h3>{c.name}</h3><p>{c.url}</p><button className="btn danger" onClick={() => props.setCompetitors(props.competitors.filter((_, index) => index !== i))}>Remove</button></div>)}</div></>;
}

function Matrix({ analyses, findings, setDrawer }: { analyses: IntelligenceReport['analyses']; findings: Finding[]; setDrawer: (f: Finding) => void }) {
  return <><Section title="Service Line Matrix" subtitle="Main service line comparison using public evidence status labels." />{!analyses.length ? <div className="notice">Run or load an analysis first.</div> : <div className="tableWrap"><table><thead><tr><th>Service line</th><th>Andwell</th>{analyses.map((a) => <th key={a.id}>{a.name}</th>)}</tr></thead><tbody>{andwellCatalog.map((service) => <tr key={service.serviceLine}><td><b>{service.serviceLine}</b><br /><span className="muted">{service.category}</span></td><td><Badge text="Clearly offered" className="badge green" /></td>{analyses.map((a) => { const f = findings.find((x) => x.competitorId === a.id && x.serviceLine === service.serviceLine); return <td key={a.id}>{f ? <button className={statusClass[f.competitorStatus]} onClick={() => setDrawer(f)}>{f.competitorStatus}</button> : <Badge text="Needs human review" className="badge red" />}</td>; })}</tr>)}</tbody></table></div>}</>;
}

function Subservices({ selectedServiceLine, setSelectedServiceLine, analyses, findings }: { selectedServiceLine: string; setSelectedServiceLine: (v: string) => void; analyses: IntelligenceReport['analyses']; findings: Finding[] }) {
  const service = andwellCatalog.find((s) => s.serviceLine === selectedServiceLine) || andwellCatalog[0];
  return <><Section title="Subservice Matrix" subtitle="Detailed capability view for one service line." action={<select className="select" value={selectedServiceLine} onChange={(e) => setSelectedServiceLine(e.target.value)}>{andwellCatalog.map((s) => <option key={s.serviceLine}>{s.serviceLine}</option>)}</select>} /><div className="card"><h3>{service.serviceLine}</h3><p>{service.description}</p></div>{!analyses.length ? <div className="notice" style={{ marginTop: 16 }}>Run or load an analysis first.</div> : <div className="tableWrap" style={{ marginTop: 16 }}><table><thead><tr><th>Capability</th><th>Andwell</th>{analyses.map((a) => <th key={a.id}>{a.name}</th>)}</tr></thead><tbody>{service.subservices.map((sub, index) => <tr key={sub}><td><b>{sub}</b></td><td><Badge text="Clearly offered" className="badge green" /></td>{analyses.map((a) => { const f = findings.find((x) => x.competitorId === a.id && x.serviceLine === service.serviceLine); const status = f?.competitorStatus === 'Clearly offered' && index % 3 === 0 ? 'Clearly offered' : f?.competitorStatus || 'Needs human review'; return <td key={a.id}><Badge text={status} className={statusClass[status]} /></td>; })}</tr>)}</tbody></table></div>}</>;
}

function SelectCompetitor({ analyses, value, onChange }: { analyses: IntelligenceReport['analyses']; value: string; onChange: (v: string) => void }) {
  return <select className="select" value={value || analyses[0]?.id || ''} onChange={(e) => onChange(e.target.value)}>{analyses.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>;
}

function Gaps(props: { analyses: IntelligenceReport['analyses']; selectedCompetitorId: string; setSelectedCompetitorId: (v: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; selectedFindings: Finding[]; setDrawer: (f: Finding) => void }) {
  const advantages = props.selectedFindings.filter((f) => f.competitorStatus !== 'Clearly offered');
  const matches = props.selectedFindings.filter((f) => f.competitorStatus === 'Clearly offered');
  return <><Section title="Gap Finder" subtitle="What Andwell publicly promotes that the competitor does not clearly promote publicly." action={<SelectCompetitor analyses={props.analyses} value={props.selectedCompetitorId} onChange={props.setSelectedCompetitorId} />} />{!props.selectedAnalysis ? <div className="notice">Run or load an analysis first.</div> : <div className="grid cols3"><div className="card" style={{ gridColumn: 'span 2' }}><h3>Potential Andwell advantages against {props.selectedAnalysis.name}</h3>{advantages.map((f) => <FindingCard key={f.id} finding={f} setDrawer={props.setDrawer} />)}</div><div className="card"><h3>Matched service lines</h3>{matches.map((f) => <p key={f.id}><Badge text={f.serviceLine} className="badge green" /></p>)}</div></div>}</>;
}

function FindingCard({ finding, setDrawer }: { finding: Finding; setDrawer: (f: Finding) => void }) {
  return <div className="card" style={{ marginTop: 12, boxShadow: 'none' }}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{finding.serviceLine}</h3><div className="row"><Badge text={finding.competitorStatus} className={statusClass[finding.competitorStatus]} /><Badge text={finding.confidence} className={confidenceClass[finding.confidence]} /></div></div><p>{finding.andwellAdvantage}</p><div className="success"><b>Safe wording</b><br />{finding.safeSalesWording}</div><button className="btn" style={{ marginTop: 12 }} onClick={() => setDrawer(finding)}>Open evidence</button></div>;
}

function Battlecards(props: { analyses: IntelligenceReport['analyses']; selectedCompetitorId: string; setSelectedCompetitorId: (v: string) => void; selectedAnalysis?: IntelligenceReport['analyses'][number]; selectedFindings: Finding[] }) {
  const advantages = props.selectedFindings.filter((f) => f.competitorStatus !== 'Clearly offered').slice(0, 8);
  const matches = props.selectedFindings.filter((f) => f.competitorStatus === 'Clearly offered').slice(0, 8);
  return <><Section title="Battlecards" subtitle="Competitor specific sales positioning." action={<SelectCompetitor analyses={props.analyses} value={props.selectedCompetitorId} onChange={props.setSelectedCompetitorId} />} />{!props.selectedAnalysis ? <div className="notice">Run or load an analysis first.</div> : <div className="card"><h2>{props.selectedAnalysis.name} Battlecard</h2><div className="grid cols3"><div className="card"><h3>Where Andwell appears stronger</h3>{advantages.map((f) => <p key={f.id}>{f.serviceLine}</p>)}</div><div className="card"><h3>Where they match publicly</h3>{matches.map((f) => <p key={f.id}>{f.serviceLine}</p>)}</div><div className="card"><h3>Lead with</h3><p>Continuum depth, detailed subservices, hospice house care, mobile wound care, GUIDE, Caring Comfort, behavioral health breadth, and maternal and child health when relevant.</p></div></div><div className="success" style={{ marginTop: 12 }}><b>Opening talk track</b><br />Andwell’s value is not just the service category. It is the depth inside the service line and the broader continuum that supports needs as they change.</div></div>}</>;
}

function TalkTracks(props: { analyses: IntelligenceReport['analyses']; selectedCompetitorId: string; setSelectedCompetitorId: (v: string) => void; selectedServiceLine: string; setSelectedServiceLine: (v: string) => void; selectedAudience: string; setSelectedAudience: (v: string) => void; selectedService: typeof andwellCatalog[number]; selectedAnalysis?: IntelligenceReport['analyses'][number] }) {
  return <><Section title="Talk Track Builder" subtitle="Build field language by competitor, service line, and referral source type." /><div className="card"><div className="grid cols3"><label>Competitor<SelectCompetitor analyses={props.analyses} value={props.selectedCompetitorId} onChange={props.setSelectedCompetitorId} /></label><label>Service line<select className="select" value={props.selectedServiceLine} onChange={(e) => props.setSelectedServiceLine(e.target.value)}>{andwellCatalog.map((s) => <option key={s.serviceLine}>{s.serviceLine}</option>)}</select></label><label>Referral source<select className="select" value={props.selectedAudience} onChange={(e) => props.setSelectedAudience(e.target.value)}>{referralAudiences.map((a) => <option key={a}>{a}</option>)}</select></label></div></div><div className="grid cols2" style={{ marginTop: 16 }}><div className="card"><h3>Short talk track</h3><p>For a {props.selectedAudience.toLowerCase()}, position Andwell’s {props.selectedService.serviceLine} around the specific capabilities inside the service line: {props.selectedService.subservices.slice(0, 8).join(', ')}.</p></div><div className="card"><h3>Referral question</h3><p>Are you looking for the basic service category, or do you need a provider that can support detailed needs like {props.selectedService.subservices.slice(0, 5).join(', ')}?</p></div></div></>;
}

function Evidence({ findings, setDrawer }: { findings: Finding[]; setDrawer: (f: Finding) => void }) {
  return <><Section title="Evidence Library" subtitle="Every finding is traceable to public evidence, confidence, and safe wording." />{!findings.length ? <div className="notice">Run or load an analysis first.</div> : <div className="grid">{findings.map((f) => <div className="card" key={f.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{f.competitorName}: {f.serviceLine}</h3><div className="row"><Badge text={f.competitorStatus} className={statusClass[f.competitorStatus]} /><Badge text={f.confidence} className={confidenceClass[f.confidence]} /></div></div><p>{f.evidenceExcerpt}</p><button className="btn" onClick={() => setDrawer(f)}>Open evidence</button></div>)}</div>}</>;
}

function Review({ findings, review, setDrawer }: { findings: Finding[]; review: Record<string, string>; setDrawer: (f: Finding) => void }) {
  const items = findings.filter((f) => (review[f.id] || f.reviewStatus) !== 'Sales usable with evidence' && (review[f.id] || f.reviewStatus) !== 'Approved for sales use');
  return <><Section title="Human Review Center" subtitle="Approve findings before turning them into sales language." />{!items.length ? <div className="success">No open review items.</div> : <div className="grid">{items.map((f) => <div className="card" key={f.id}><div className="row" style={{ justifyContent: 'space-between' }}><h3>{f.serviceLine}</h3><Badge text={review[f.id] || f.reviewStatus} className="badge red" /></div><p>{f.safeSalesWording}</p><button className="btn" onClick={() => setDrawer(f)}>Review</button></div>)}</div>}</>;
}

function Reports({ savedReports, loadSavedReport, report, exportReport }: { savedReports: IntelligenceReport[]; loadSavedReport: (i: number) => void; report: IntelligenceReport | null; exportReport: (type: 'json' | 'csv' | 'html') => void }) {
  return <><Section title="Reports" subtitle="Export current reports and reload locally saved reports." action={<div className="row"><button className="btn" onClick={() => exportReport('json')}>Export JSON</button><button className="btn" onClick={() => exportReport('csv')}>Export CSV</button><button className="btn" onClick={() => exportReport('html')}>Export HTML</button></div>} />{report && <div className="success" style={{ marginBottom: 16 }}>Loaded report with {report.competitorsAnalyzed} competitors.</div>}<div className="grid">{savedReports.map((r, i) => <div className="card" key={r.id}><h3>{r.analyses.map((a) => a.name).join(', ')}</h3><p>{new Date(r.generatedAt).toLocaleString()} · {r.pagesReviewed} pages reviewed · {r.potentialAndwellAdvantages} potential advantages</p><button className="btn primary" onClick={() => loadSavedReport(i)}>Load</button></div>)}</div></>;
}
