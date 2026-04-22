// ========================================
// SUPABASE CLIENT — Environment Variables Only
// NEVER hardcode credentials in React components
// ========================================
//
// Env vars (set in .env.local for local, Cloudflare Pages Dashboard for production):
//   NEXT_PUBLIC_SUPABASE_URL  (client-side, baked at build time)
//   NEXT_PUBLIC_SUPABASE_ANON_KEY  (client-side, baked at build time)
//   SUPABASE_URL  (server-side only, available at RUNTIME)
//   SUPABASE_ANON_KEY  (server-side only, available at RUNTIME)
//
// IMPORTANT: For API routes, SUPABASE_URL (without NEXT_PUBLIC_) is preferred
// because it's read at RUNTIME on the server, not baked at build time.

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

// ========================================
// SERVER-SIDE ONLY CLIENT — reads env at RUNTIME
// Use this in API routes to avoid build-time caching issues.
// Checks SUPABASE_URL first (runtime), then NEXT_PUBLIC_SUPABASE_URL (build-time).
// NO singleton — fresh per call to avoid stale state in Edge Runtime.
// ========================================
export function getSupabaseServer(): SupabaseClient | null {
  // Prefer runtime env vars (not baked at build time)
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('[SUPABASE SERVER] Variables no configuradas.');
    return null;
  }

  return createClient(url, key);
}

// ========================================
// ADMIN CLIENT — Uses service_role key to BYPASS RLS
// Required for admin operations that modify other users' profiles
// Env var: SUPABASE_SERVICE_ROLE_KEY (set in Cloudflare Pages dashboard)
//
// IMPORTANT: NO singleton caching in Edge Runtime!
// Edge function instances persist across requests. If the first call
// cached a null or a stale client, all subsequent calls would fail
// silently. Creating a fresh client per call is cheap and guarantees
// the latest env vars + service_role key are always used.
// ========================================
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    console.warn('[SUPABASE ADMIN] SUPABASE_URL no configurada.');
    return null;
  }

  if (!serviceKey) {
    console.warn('[SUPABASE ADMIN] SUPABASE_SERVICE_ROLE_KEY no configurada. Las operaciones de admin fallaran con RLS.');
    return null;
  }

  // Log key prefix for debugging (never log the full key)
  const keyPrefix = serviceKey.substring(0, 10);
  console.log(`[SUPABASE ADMIN] Creando cliente admin con key ${keyPrefix}...`);

  return createClient(url, serviceKey);
}
