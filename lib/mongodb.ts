import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'competitive_intelligence_hub';

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
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
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
