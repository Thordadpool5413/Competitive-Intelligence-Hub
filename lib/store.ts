import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { Collection } from 'mongodb';
import { getMongoDb, isMongoConfigured } from './mongodb';
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
  version: 3,
  updatedAt: new Date().toISOString(),
  competitors: [],
  reports: [],
  reviews: [],
  catalogOverrides: []
});

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function collection<T extends object>(name: string): Promise<Collection<T>> {
  const db = await getMongoDb();
  return db.collection<T>(name);
}

async function mongoReadStore(): Promise<HubStore> {
  const [competitors, reports, reviews, catalogOverrides] = await Promise.all([
    collection<CompetitorInput>('competitors').then((col) => col.find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray()),
    collection<IntelligenceReport>('reports').then((col) => col.find({}, { projection: { _id: 0 } }).sort({ generatedAt: -1 }).limit(100).toArray()),
    collection<StoredReview>('reviews').then((col) => col.find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).limit(10000).toArray()),
    collection<CatalogOverride>('catalogOverrides').then((col) => col.find({}, { projection: { _id: 0 } }).sort({ serviceLine: 1 }).toArray())
  ]);

  return {
    ...emptyStore(),
    updatedAt: new Date().toISOString(),
    competitors,
    reports,
    reviews,
    catalogOverrides
  };
}

async function jsonReadStore(): Promise<HubStore> {
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
    await jsonWriteStore(initial);
    return initial;
  }
}

async function jsonWriteStore(store: HubStore) {
  await ensureDataDir();
  const next = { ...store, updatedAt: new Date().toISOString() };
  await writeFile(storeFile, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export async function readStore(): Promise<HubStore> {
  if (isMongoConfigured()) return mongoReadStore();
  return jsonReadStore();
}

export async function writeStore(store: HubStore) {
  if (!isMongoConfigured()) return jsonWriteStore(store);

  const [competitorsCol, reportsCol, reviewsCol, catalogCol] = await Promise.all([
    collection<CompetitorInput>('competitors'),
    collection<IntelligenceReport>('reports'),
    collection<StoredReview>('reviews'),
    collection<CatalogOverride>('catalogOverrides')
  ]);

  await Promise.all([
    competitorsCol.deleteMany({}),
    reportsCol.deleteMany({}),
    reviewsCol.deleteMany({}),
    catalogCol.deleteMany({})
  ]);

  await Promise.all([
    store.competitors.length ? competitorsCol.insertMany(store.competitors) : Promise.resolve(),
    store.reports.length ? reportsCol.insertMany(store.reports) : Promise.resolve(),
    store.reviews.length ? reviewsCol.insertMany(store.reviews) : Promise.resolve(),
    store.catalogOverrides.length ? catalogCol.insertMany(store.catalogOverrides) : Promise.resolve()
  ]);

  return { ...store, updatedAt: new Date().toISOString() };
}

export async function saveCompetitors(competitors: CompetitorInput[]) {
  if (isMongoConfigured()) {
    const col = await collection<CompetitorInput>('competitors');
    const normalized = competitors.filter((competitor) => competitor.url);
    await Promise.all(normalized.map((competitor) => col.updateOne({ url: competitor.url }, { $set: competitor }, { upsert: true })));
    return readStore();
  }

  const store = await readStore();
  const byUrl = new Map<string, CompetitorInput>();
  [...store.competitors, ...competitors].forEach((competitor) => {
    if (competitor.url) byUrl.set(competitor.url, competitor);
  });
  store.competitors = [...byUrl.values()].slice(0, 500);
  return writeStore(store);
}

export async function saveReport(report: IntelligenceReport) {
  if (isMongoConfigured()) {
    const reportsCol = await collection<IntelligenceReport>('reports');
    const competitorsCol = await collection<CompetitorInput>('competitors');
    await reportsCol.updateOne({ id: report.id }, { $set: report }, { upsert: true });
    const reportCompetitors = report.analyses.map((analysis) => ({ name: analysis.name, url: analysis.url, market: analysis.market }));
    await Promise.all(reportCompetitors.map((competitor) => competitorsCol.updateOne({ url: competitor.url }, { $set: competitor }, { upsert: true })));
    return readStore();
  }

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
  if (isMongoConfigured()) {
    const col = await collection<IntelligenceReport>('reports');
    return col.findOne({ id: reportId }, { projection: { _id: 0 } });
  }

  const store = await readStore();
  return store.reports.find((report) => report.id === reportId) || null;
}

export async function saveReview(input: Omit<StoredReview, 'id' | 'updatedAt'> & { id?: string }) {
  const id = input.id || `review_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const review: StoredReview = { ...input, id, updatedAt: new Date().toISOString() };

  if (isMongoConfigured()) {
    const col = await collection<StoredReview>('reviews');
    await col.updateOne({ findingId: input.findingId }, { $set: review }, { upsert: true });
    return review;
  }

  const store = await readStore();
  store.reviews = [review, ...store.reviews.filter((item) => item.findingId !== input.findingId)].slice(0, 10000);
  await writeStore(store);
  return review;
}

export async function saveCatalogOverride(input: Omit<CatalogOverride, 'updatedAt'>) {
  const override: CatalogOverride = { ...input, updatedAt: new Date().toISOString() };

  if (isMongoConfigured()) {
    const col = await collection<CatalogOverride>('catalogOverrides');
    await col.updateOne({ serviceLine: input.serviceLine }, { $set: override }, { upsert: true });
    return override;
  }

  const store = await readStore();
  store.catalogOverrides = [override, ...store.catalogOverrides.filter((item) => item.serviceLine !== input.serviceLine)];
  await writeStore(store);
  return override;
}
