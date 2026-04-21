// ========================================
// SUPABASE CLIENT — Environment Variables Only
// NEVER hardcode credentials in React components
// ========================================
//
// Env vars (set in .env.local for local, Cloudflare Pages Dashboard for production):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Faltan variables de entorno de Supabase. ' +
    'Agrega NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local ' +
    '(local) o en Cloudflare Pages > Settings > Environment Variables (produccion).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
