// ========================================
// LIGHTWEIGHT DATABASE CLIENT — Edge Compatible
// Uses @libsql/client/http for pure HTTP transport
// NO Prisma, NO WASM, NO Node.js APIs, NO XHR
// ========================================
//
// CRITICAL: @libsql/client/http uses native fetch() directly.
// The /http export only supports HTTP connections (no local SQLite),
// which is exactly what we need for Turso in Edge Workers.
// This avoids @libsql/client/node (uses XHR) and @libsql/client/web
// (which may still pull in polyfills).

import { createClient, Client } from '@libsql/client/http';

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
