import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isDemoRoute } from '@/features/demo/hooks/useIsDemo';
import { demoSupabaseClient } from '@/features/demo/lib/demoSupabaseClient';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

// Created lazily so that visitors landing directly on /demo do NOT
// instantiate the prod client at all. createClient() schedules its own
// auto-refresh loop and reads any persisted session out of localStorage,
// which would otherwise cause /demo pages to make background requests
// to the prod auth endpoint on behalf of a logged-in user — noise that
// has no business firing inside an "ephemeral demo" surface.
let supabaseProdCache: SupabaseClient | null = null;

const getSupabaseProd = (): SupabaseClient => {
  if (!supabaseProdCache) {
    supabaseProdCache = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { flowType: 'pkce' },
    });
  }
  return supabaseProdCache;
};

// A page that started in the sandbox stays on the mock for its whole life,
// even after a client-side route change takes it out of /demo: such a change
// carries the fake demo user, and sending that to production only fails (the
// DB rejects "demo-user-…" ids, the calls run as anon). DemoExitGuard then
// reloads the page so the real app boots cleanly.
const bootedInDemo = isDemoRoute();

/** True while this page talks to the demo mock — for code that reaches the network around the client. */
export const isDemoClientActive = (): boolean => bootedInDemo || isDemoRoute();

export const getSupabase = (): SupabaseClient => {
  if (isDemoClientActive()) {
    return demoSupabaseClient as unknown as SupabaseClient;
  }
  return getSupabaseProd();
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
