// ========================================
// SUPABASE CLIENT — Environment Variables Only
// NEVER hardcode credentials in React components
// ========================================
//
// Env vars (set in .env.local for local, Cloudflare Pages Dashboard for production):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//
// IMPORTANT: These vars must be set in BOTH:
//   1. Cloudflare Pages > Settings > Environment Variables (for build time)
//   2. Cloudflare Pages > Settings > Environment Variables (for runtime)
// If vars are missing, supabase will be null (graceful degradation).

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('[SUPABASE] Variables de entorno no configuradas. Set NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.');
    return null;
  }

  _client = createClient(url, key);
  return _client;
}

// Lazy singleton — safe during build even without env vars
export const supabase = getClient();
