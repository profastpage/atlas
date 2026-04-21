// ========================================
// LIGHTWEIGHT DATABASE CLIENT — Edge Compatible
// Uses @libsql/client/web for Cloudflare Workers
// NO Prisma, NO WASM, NO Node.js APIs
// ========================================
//
// CRITICAL: We import from @libsql/client/web instead of @libsql/client
// because the default import uses @libsql/client/node.js which pulls
// in cross-fetch -> XMLHttpRequest -> NOT available in Edge Workers.
// The /web export uses native fetch which IS available in Edge.

import { createClient, Client } from '@libsql/client/web';

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
