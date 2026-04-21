// ========================================
// LIGHTWEIGHT DATABASE CLIENT
// Uses @libsql/client directly — NO Prisma
// Edge-compatible: ~10 KB vs Prisma's ~2.1 MB WASM
// ========================================

import { createClient, Client } from '@libsql/client';

let _client: Client | null = null;
let _missingEnv = false;

function getClient(): Client {
  if (_missingEnv) {
    throw new Error('DATABASE_URL no configurada en Cloudflare Pages');
  }

  if (!_client) {
    const url = process.env.DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      _missingEnv = true;
      throw new Error('DATABASE_URL no configurada en Cloudflare Pages');
    }

    _client = createClient({
      url,
      authToken: authToken || undefined,
    });
  }
  return _client;
}

export const db = {
  async execute(sql: string, args?: Record<string, unknown> | unknown[]) {
    try {
      return await getClient().execute(sql, args);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('DATABASE_URL') || msg.includes('not configured')) {
        console.error('[DB] Variables de entorno no configuradas. Agrega DATABASE_URL y TURSO_AUTH_TOKEN en Cloudflare Pages > Settings > Environment Variables.');
      }
      throw error;
    }
  },
  async batch(statements: { sql: string; args?: Record<string, unknown> | unknown[] }[]) {
    return getClient().batch(statements);
  },
};
