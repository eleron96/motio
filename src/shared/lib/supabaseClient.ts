import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';
import { demoSupabaseClient } from '@/features/demo/lib/demoSupabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

export const supabaseProd: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: 'pkce',
  },
});

// The demo sandbox runs entirely client-side. demoSupabaseClient is a
// hand-rolled mock backed by demoDataStore (sessionStorage with a 24h
// TTL). No network, no anon auth, no Postgres on the other end.
export const getSupabase = (): SupabaseClient => {
  if (isDemoRoute()) {
    return demoSupabaseClient as unknown as SupabaseClient;
  }
  return supabaseProd;
};

// Existing code does `import { supabase } from '@/shared/lib/supabaseClient'`.
// We keep that surface but route every property access through
// getSupabase(), so the same import resolves to the demo mock when the
// user is on /demo/* and the prod client everywhere else.
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getSupabase();
    const value = Reflect.get(client as object, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as SupabaseClient;
