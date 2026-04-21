// ========================================
// LIGHTWEIGHT DATABASE CLIENT
// Uses @libsql/client directly — NO Prisma
// Edge-compatible: ~10 KB vs Prisma's ~2.1 MB WASM
// ========================================

import { createClient, Client } from '@libsql/client';

let _client: Client | null = null;

function getClient(): Client {
  if (!_client) {
    const url = process.env.DATABASE_URL || 'file:db/custom.db';
    const authToken = process.env.TURSO_AUTH_TOKEN;

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
