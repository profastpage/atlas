// ========================================
// LIGHTWEIGHT DATABASE CLIENT — Edge Compatible
// Uses @libsql/client with fetch transport for Cloudflare Workers
// No Prisma, no WASM, no Node.js APIs
// ========================================

import { createClient, Client } from '@libsql/client';

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    const url = process.env.DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url) {
      throw new Error('DATABASE_URL no configurada en Cloudflare Pages');
    }

    // CRITICAL: Use 'fetch' as the transport for Edge Workers compatibility.
    // Default libsql client uses XMLHttpRequest which is NOT available in
    // Cloudflare Workers. The raw option disables the WASM engine for
    // remote HTTP connections.
    _client = createClient({
      url,
      authToken: authToken || undefined,
      // @ts-expect-error — fetch option is supported in @libsql/client for edge
      fetch: globalThis.fetch,
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
