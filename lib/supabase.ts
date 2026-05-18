import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function cleanEnvValue(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, '');
}

const url = cleanEnvValue(process.env.SUPABASE_URL);
const serviceKey = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);

type GlobalSupabase = typeof globalThis & {
  _cihSupabaseClient?: SupabaseClient;
};

export function isSupabaseConfigured() {
  return Boolean(url && serviceKey);
}

export function getSupabaseClient() {
  if (!url || !serviceKey) {
    throw new Error('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable Supabase persistence.');
  }

  const globalSupabase = globalThis as GlobalSupabase;
  if (!globalSupabase._cihSupabaseClient) {
    globalSupabase._cihSupabaseClient = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      },
      global: {
        headers: {
          'x-application-name': 'competitive-intelligence-hub'
        }
      }
    });
  }

  return globalSupabase._cihSupabaseClient;
}
