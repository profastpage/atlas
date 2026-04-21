// ========================================
// EDGE POLYFILL — Must be at module level
// Cloudflare Workers lack XMLHttpRequest which Next.js checks at load time
// ========================================
if (typeof globalThis.XMLHttpRequest === 'undefined') {
  // Provide minimal stub so Next.js framework code doesn't crash
  const noop = () => {};
  const XHRStub: any = class XMLHttpRequest {
    OPENED = 1; UNSENT = 0; LOADING = 1; DONE = 4;
    static UNSENT = 0; static OPENED = 1; static LOADING = 1; static DONE = 4;
    readyState = 0; status = 0; timeout = 0; responseURL = ''; responseText = '';
    responseType = ''; withCredentials = false; onreadystatechange = noop;
    onload = noop; onerror = noop; onabort = noop; onprogress = noop;
    ontimeout = noop; upload = noop; send() { this.readyState = 1; this.status = 200; }
    open() { this.readyState = 1; }
    abort() {}
    setRequestHeader() {}
    getResponseHeader() { return null; }
    getAllResponseHeaders() { return ''; }
    overrideMimeType() {}
  };
  try {
    // @ts-ignore
    globalThis.XMLHttpRequest = XHRStub;
  } catch {}
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
