// ========================================
// LIGHTWEIGHT DATABASE CLIENT — Edge Compatible
// Uses @libsql/client with native fetch (cross-fetch replaced via webpack alias)
// ========================================

import { createClient, type Client } from '@libsql/client';

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
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
    return getClient().execute(sql, args);
  },
  async batch(statements: { sql: string; args?: Record<string, unknown> | unknown[] }[]) {
    return getClient().batch(statements);
  },
};
