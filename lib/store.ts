import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { CompetitorInput, IntelligenceReport, ReviewStatus } from './types';

export type StoredReview = {
  id: string;
  findingId: string;
  status: ReviewStatus | 'Needs edits';
  note?: string;
  reviewer?: string;
  updatedAt: string;
};

export type CatalogOverride = {
  serviceLine: string;
  description?: string;
  safeLanguage?: string;
  avoid?: string;
  internalNotes?: string;
  approvalStatus?: 'Draft' | 'Needs review' | 'Approved' | 'Retired' | 'Do not show to sales';
  updatedAt: string;
};

export type HubStore = {
  version: number;
  updatedAt: string;
  competitors: CompetitorInput[];
  reports: IntelligenceReport[];
  reviews: StoredReview[];
  catalogOverrides: CatalogOverride[];
};

const dataDir = process.env.CIH_DATA_DIR || path.join(process.cwd(), '.data');
const storeFile = process.env.CIH_STORE_FILE || path.join(dataDir, 'competitive-intelligence-hub.json');

const emptyStore = (): HubStore => ({
  version: 2,
  updatedAt: new Date().toISOString(),
  competitors: [],
  reports: [],
  reviews: [],
  catalogOverrides: []
});

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

export async function readStore(): Promise<HubStore> {
  await ensureDataDir();
  try {
    const raw = await readFile(storeFile, 'utf8');
    const parsed = JSON.parse(raw) as Partial<HubStore>;
    return {
      ...emptyStore(),
      ...parsed,
      competitors: parsed.competitors || [],
      reports: parsed.reports || [],
      reviews: parsed.reviews || [],
      catalogOverrides: parsed.catalogOverrides || []
    };
  } catch {
    const initial = emptyStore();
    await writeStore(initial);
    return initial;
  }
}

export async function writeStore(store: HubStore) {
  await ensureDataDir();
  const next = { ...store, updatedAt: new Date().toISOString() };
  await writeFile(storeFile, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export async function saveCompetitors(competitors: CompetitorInput[]) {
  const store = await readStore();
  const byUrl = new Map<string, CompetitorInput>();
  [...store.competitors, ...competitors].forEach((competitor) => {
    if (competitor.url) byUrl.set(competitor.url, competitor);
  });
  store.competitors = [...byUrl.values()].slice(0, 500);
  return writeStore(store);
}

export async function saveReport(report: IntelligenceReport) {
  const store = await readStore();
  const nextReports = [report, ...store.reports.filter((item) => item.id !== report.id)].slice(0, 100);
  store.reports = nextReports;
  const reportCompetitors = report.analyses.map((analysis) => ({ name: analysis.name, url: analysis.url, market: analysis.market }));
  const byUrl = new Map<string, CompetitorInput>();
  [...store.competitors, ...reportCompetitors].forEach((competitor) => {
    if (competitor.url) byUrl.set(competitor.url, competitor);
  });
  store.competitors = [...byUrl.values()].slice(0, 500);
  return writeStore(store);
}

export async function getReport(reportId: string) {
  const store = await readStore();
  return store.reports.find((report) => report.id === reportId) || null;
}

export async function saveReview(input: Omit<StoredReview, 'id' | 'updatedAt'> & { id?: string }) {
  const store = await readStore();
  const id = input.id || `review_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const review: StoredReview = { ...input, id, updatedAt: new Date().toISOString() };
  store.reviews = [review, ...store.reviews.filter((item) => item.findingId !== input.findingId)].slice(0, 10000);
  await writeStore(store);
  return review;
}

export async function saveCatalogOverride(input: Omit<CatalogOverride, 'updatedAt'>) {
  const store = await readStore();
  const override: CatalogOverride = { ...input, updatedAt: new Date().toISOString() };
  store.catalogOverrides = [override, ...store.catalogOverrides.filter((item) => item.serviceLine !== input.serviceLine)];
  await writeStore(store);
  return override;
}
