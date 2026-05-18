import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import type { Collection } from 'mongodb';
import { getMongoDb, isMongoConfigured } from './mongodb';
import { getSupabaseClient, isSupabaseConfigured } from './supabase';
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

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, '');
}

const dataDir = cleanEnvValue(process.env.CIH_DATA_DIR) || path.join(process.cwd(), '.data');
const storeFile = cleanEnvValue(process.env.CIH_STORE_FILE) || path.join(dataDir, 'competitive-intelligence-hub.json');
let mongoUnavailable = false;
let supabaseUnavailable = false;

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

function assertSupabase(action: string, error: { message: string } | null) {
  if (error) throw new Error(`Supabase ${action} failed: ${error.message}`);
}

async function supabaseReadStore(): Promise<HubStore> {
  const supabase = getSupabaseClient();
  const [competitorsResult, reportsResult, reviewsResult, catalogResult] = await Promise.all([
    supabase.from('cih_competitors').select('payload').order('name', { ascending: true }).limit(500),
    supabase.from('cih_reports').select('payload').order('generated_at', { ascending: false }).limit(100),
    supabase.from('cih_reviews').select('payload').order('updated_at', { ascending: false }).limit(10000),
    supabase.from('cih_catalog_overrides').select('payload').order('service_line', { ascending: true })
  ]);

  assertSupabase('read competitors', competitorsResult.error);
  assertSupabase('read reports', reportsResult.error);
  assertSupabase('read reviews', reviewsResult.error);
  assertSupabase('read catalog overrides', catalogResult.error);

  return {
    ...emptyStore(),
    updatedAt: new Date().toISOString(),
    competitors: (competitorsResult.data || []).map((row) => row.payload as CompetitorInput),
    reports: (reportsResult.data || []).map((row) => row.payload as IntelligenceReport),
    reviews: (reviewsResult.data || []).map((row) => row.payload as StoredReview),
    catalogOverrides: (catalogResult.data || []).map((row) => row.payload as CatalogOverride)
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

function logPersistenceFallback(provider: string, error: unknown) {
  console.error(`${provider} persistence failed. Falling back to local JSON storage.`, error);
}

export async function readStore(): Promise<HubStore> {
  if (isSupabaseConfigured() && !supabaseUnavailable) {
    try {
      return await supabaseReadStore();
    } catch (error) {
      supabaseUnavailable = true;
      logPersistenceFallback('Supabase', error);
    }
  }

  if (isMongoConfigured() && !mongoUnavailable) {
    try {
      return await mongoReadStore();
    } catch (error) {
      mongoUnavailable = true;
      logPersistenceFallback('MongoDB', error);
    }
  }

  return jsonReadStore();
}

export async function writeStore(store: HubStore) {
  if (isSupabaseConfigured() && !supabaseUnavailable) {
    try {
      const supabase = getSupabaseClient();
      const [competitorsDelete, reportsDelete, reviewsDelete, catalogDelete] = await Promise.all([
        supabase.from('cih_competitors').delete().neq('url', '__cih_never__'),
        supabase.from('cih_reports').delete().neq('id', '__cih_never__'),
        supabase.from('cih_reviews').delete().neq('finding_id', '__cih_never__'),
        supabase.from('cih_catalog_overrides').delete().neq('service_line', '__cih_never__')
      ]);

      assertSupabase('delete competitors', competitorsDelete.error);
      assertSupabase('delete reports', reportsDelete.error);
      assertSupabase('delete reviews', reviewsDelete.error);
      assertSupabase('delete catalog overrides', catalogDelete.error);

      const [competitorsInsert, reportsInsert, reviewsInsert, catalogInsert] = await Promise.all([
        store.competitors.length ? supabase.from('cih_competitors').insert(store.competitors.filter((competitor) => competitor.url).map(competitorRow)) : Promise.resolve({ error: null }),
        store.reports.length ? supabase.from('cih_reports').insert(store.reports.map(reportRow)) : Promise.resolve({ error: null }),
        store.reviews.length ? supabase.from('cih_reviews').insert(store.reviews.map(reviewRow)) : Promise.resolve({ error: null }),
        store.catalogOverrides.length ? supabase.from('cih_catalog_overrides').insert(store.catalogOverrides.map(catalogOverrideRow)) : Promise.resolve({ error: null })
      ]);

      assertSupabase('insert competitors', competitorsInsert.error);
      assertSupabase('insert reports', reportsInsert.error);
      assertSupabase('insert reviews', reviewsInsert.error);
      assertSupabase('insert catalog overrides', catalogInsert.error);

      return { ...store, updatedAt: new Date().toISOString() };
    } catch (error) {
      supabaseUnavailable = true;
      logPersistenceFallback('Supabase', error);
      return jsonWriteStore(store);
    }
  }

  if (!isMongoConfigured() || mongoUnavailable) return jsonWriteStore(store);

  try {
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
  } catch (error) {
    mongoUnavailable = true;
    logPersistenceFallback('MongoDB', error);
    return jsonWriteStore(store);
  }
}

function competitorRow(competitor: CompetitorInput) {
  return {
    url: competitor.url,
    name: competitor.name || null,
    market: competitor.market || null,
    payload: competitor,
    updated_at: new Date().toISOString()
  };
}

function reportRow(report: IntelligenceReport) {
  return {
    id: report.id,
    generated_at: report.generatedAt,
    payload: report,
    updated_at: new Date().toISOString()
  };
}

function reviewRow(review: StoredReview) {
  return {
    finding_id: review.findingId,
    payload: review,
    updated_at: review.updatedAt
  };
}

function catalogOverrideRow(override: CatalogOverride) {
  return {
    service_line: override.serviceLine,
    payload: override,
    updated_at: override.updatedAt
  };
}

export async function saveCompetitors(competitors: CompetitorInput[]) {
  if (isSupabaseConfigured() && !supabaseUnavailable) {
    try {
      const supabase = getSupabaseClient();
      const normalized = competitors.filter((competitor) => competitor.url);
      if (normalized.length) {
        const result = await supabase.from('cih_competitors').upsert(normalized.map(competitorRow), { onConflict: 'url' });
        assertSupabase('upsert competitors', result.error);
      }
      return readStore();
    } catch (error) {
      supabaseUnavailable = true;
      logPersistenceFallback('Supabase', error);
    }
  }

  if (isMongoConfigured() && !mongoUnavailable) {
    try {
      const col = await collection<CompetitorInput>('competitors');
      const normalized = competitors.filter((competitor) => competitor.url);
      await Promise.all(normalized.map((competitor) => col.updateOne({ url: competitor.url }, { $set: competitor }, { upsert: true })));
      return readStore();
    } catch (error) {
      mongoUnavailable = true;
      logPersistenceFallback('MongoDB', error);
    }
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
  if (isSupabaseConfigured() && !supabaseUnavailable) {
    try {
      const supabase = getSupabaseClient();
      const reportResult = await supabase.from('cih_reports').upsert(reportRow(report), { onConflict: 'id' });
      assertSupabase('upsert report', reportResult.error);
      const reportCompetitors = report.analyses.map((analysis) => ({ name: analysis.name, url: analysis.url, market: analysis.market }));
      if (reportCompetitors.length) {
        const competitorsResult = await supabase.from('cih_competitors').upsert(reportCompetitors.map(competitorRow), { onConflict: 'url' });
        assertSupabase('upsert report competitors', competitorsResult.error);
      }
      return readStore();
    } catch (error) {
      supabaseUnavailable = true;
      logPersistenceFallback('Supabase', error);
    }
  }

  if (isMongoConfigured() && !mongoUnavailable) {
    try {
      const reportsCol = await collection<IntelligenceReport>('reports');
      const competitorsCol = await collection<CompetitorInput>('competitors');
      await reportsCol.updateOne({ id: report.id }, { $set: report }, { upsert: true });
      const reportCompetitors = report.analyses.map((analysis) => ({ name: analysis.name, url: analysis.url, market: analysis.market }));
      await Promise.all(reportCompetitors.map((competitor) => competitorsCol.updateOne({ url: competitor.url }, { $set: competitor }, { upsert: true })));
      return readStore();
    } catch (error) {
      mongoUnavailable = true;
      logPersistenceFallback('MongoDB', error);
    }
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
  if (isSupabaseConfigured() && !supabaseUnavailable) {
    try {
      const result = await getSupabaseClient()
        .from('cih_reports')
        .select('payload')
        .eq('id', reportId)
        .maybeSingle();
      assertSupabase('get report', result.error);
      return result.data ? result.data.payload as IntelligenceReport : null;
    } catch (error) {
      supabaseUnavailable = true;
      logPersistenceFallback('Supabase', error);
    }
  }

  if (isMongoConfigured() && !mongoUnavailable) {
    try {
      const col = await collection<IntelligenceReport>('reports');
      return col.findOne({ id: reportId }, { projection: { _id: 0 } });
    } catch (error) {
      mongoUnavailable = true;
      logPersistenceFallback('MongoDB', error);
    }
  }

  const store = await readStore();
  return store.reports.find((report) => report.id === reportId) || null;
}

export async function saveReview(input: Omit<StoredReview, 'id' | 'updatedAt'> & { id?: string }) {
  const id = input.id || `review_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const review: StoredReview = { ...input, id, updatedAt: new Date().toISOString() };

  if (isSupabaseConfigured() && !supabaseUnavailable) {
    try {
      const result = await getSupabaseClient().from('cih_reviews').upsert(reviewRow(review), { onConflict: 'finding_id' });
      assertSupabase('upsert review', result.error);
      return review;
    } catch (error) {
      supabaseUnavailable = true;
      logPersistenceFallback('Supabase', error);
    }
  }

  if (isMongoConfigured() && !mongoUnavailable) {
    try {
      const col = await collection<StoredReview>('reviews');
      await col.updateOne({ findingId: input.findingId }, { $set: review }, { upsert: true });
      return review;
    } catch (error) {
      mongoUnavailable = true;
      logPersistenceFallback('MongoDB', error);
    }
  }

  const store = await readStore();
  store.reviews = [review, ...store.reviews.filter((item) => item.findingId !== input.findingId)].slice(0, 10000);
  await writeStore(store);
  return review;
}

export async function saveCatalogOverride(input: Omit<CatalogOverride, 'updatedAt'>) {
  const override: CatalogOverride = { ...input, updatedAt: new Date().toISOString() };

  if (isSupabaseConfigured() && !supabaseUnavailable) {
    try {
      const result = await getSupabaseClient().from('cih_catalog_overrides').upsert(catalogOverrideRow(override), { onConflict: 'service_line' });
      assertSupabase('upsert catalog override', result.error);
      return override;
    } catch (error) {
      supabaseUnavailable = true;
      logPersistenceFallback('Supabase', error);
    }
  }

  if (isMongoConfigured() && !mongoUnavailable) {
    try {
      const col = await collection<CatalogOverride>('catalogOverrides');
      await col.updateOne({ serviceLine: input.serviceLine }, { $set: override }, { upsert: true });
      return override;
    } catch (error) {
      mongoUnavailable = true;
      logPersistenceFallback('MongoDB', error);
    }
  }

  const store = await readStore();
  store.catalogOverrides = [override, ...store.catalogOverrides.filter((item) => item.serviceLine !== input.serviceLine)];
  await writeStore(store);
  return override;
}
