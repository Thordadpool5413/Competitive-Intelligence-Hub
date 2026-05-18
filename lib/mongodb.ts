import { MongoClient, Db } from 'mongodb';

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, '');
}

const uri = cleanEnvValue(process.env.MONGODB_URI);
const dbName = cleanEnvValue(process.env.MONGODB_DB) || 'competitive_intelligence_hub';

type GlobalMongo = typeof globalThis & {
  _cihMongoClientPromise?: Promise<MongoClient>;
};

export function isMongoConfigured() {
  return Boolean(uri);
}

export async function getMongoClient() {
  if (!uri) {
    throw new Error('MONGODB_URI is not configured. Add it to your environment variables to enable MongoDB persistence.');
  }

  const globalMongo = globalThis as GlobalMongo;

  if (!globalMongo._cihMongoClientPromise) {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 1500),
      connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 2000),
      maxPoolSize: 10
    });
    globalMongo._cihMongoClientPromise = client.connect();
  }

  return globalMongo._cihMongoClientPromise;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(dbName);
}
