import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabaseProd: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
    storageKey: 'motio.auth.prod',
  },
});

const demoUrl = import.meta.env.VITE_SUPABASE_URL_DEMO;
const demoAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY_DEMO;

let demoClientCache: SupabaseClient | null = null;

const getDemoClient = (): SupabaseClient | null => {
  if (!demoUrl || !demoAnonKey) return null;
  if (!demoClientCache) {
    demoClientCache = createClient(demoUrl, demoAnonKey, {
      auth: {
        flowType: 'pkce',
        storageKey: 'motio.auth.demo',
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return demoClientCache;
};

export const getSupabase = (): SupabaseClient => {
  if (isDemoRoute()) {
    const demo = getDemoClient();
    if (demo) return demo;
  }
  return supabaseProd;
};

// Existing code does `import { supabase } from '@/shared/lib/supabaseClient'`.
// We keep that surface but route every property access through `getSupabase()`,
// so the same import resolves to the demo client when the user is on /demo/*
// and the prod client everywhere else.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as SupabaseClient;
