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
// ========================================
let _serverClient: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient | null {
  if (_serverClient) return _serverClient;

  // Prefer runtime env vars (not baked at build time)
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn('[SUPABASE SERVER] Variables no configuradas.');
    return null;
  }

  _serverClient = createClient(url, key);
  return _serverClient;
}
