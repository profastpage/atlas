// ========================================
// EDGE POLYFILL — Must be at module level
// Cloudflare Workers lack XMLHttpRequest which Next.js checks at load time
// ========================================
if (typeof globalThis.XMLHttpRequest === 'undefined') {
  (globalThis as any).XMLHttpRequest = class XMLHttpRequestStub {
    open() {}
    send() {}
    setRequestHeader() {}
    abort() {}
    getAllResponseHeaders() { return ''; }
    getResponseHeader() { return null; }
    overrideMimeType() {}
  };
}

// ========================================
// LIGHTWEIGHT DATABASE CLIENT — Edge Compatible
// Uses @libsql/client/http for pure HTTP transport
// ========================================

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
