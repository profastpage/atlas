// ========================================
// EDGE POLYFILL + MIDDLEWARE
// Cloudflare Pages — XHR polyfill for Next.js framework
// ========================================
//
// PROBLEM: Next.js 16 bundles ua-parser-js which checks for XMLHttpRequest
// at module evaluation time. Cloudflare Workers don't have XHR, causing all
// DB operations to crash with "XMLHttpRequest is not defined".
//
// FIX: Polyfill XMLHttpRequest before any route handlers execute.
//
// WARNING: Cloudflare Workers do NOT support setInterval, setImmediate,
// process.nextTick, or any Node.js timer APIs at module scope.
// Only setTimeout (within request handlers) and request-scoped APIs are supported.
// Using setInterval at module scope WILL crash the entire worker → 500 on ALL routes.

import { NextRequest, NextResponse } from 'next/server';
import { NextMiddleware } from 'next/server';

// Polyfill XMLHttpRequest for Edge Workers — Next.js ua-parser-js checks for it
if (typeof globalThis.XMLHttpRequest === 'undefined') {
  // @ts-ignore — XHR stub for Edge Workers compatibility
  (globalThis as any).XMLHttpRequest = class XMLHttpRequest {
    open() {}
    send() {}
    setRequestHeader() {}
    getResponseHeader() { return null; }
    getAllResponseHeaders() { return ''; }
  };
}

// ========================================
// IP-BASED RATE LIMITER (Edge-compatible in-memory Map)
// 20 requests per minute per IP on /api/chat
// Cleanup is LAZY (on each checkRateLimit call) — NO setInterval needed.
// Cloudflare Workers do not support setInterval at module scope.
// ========================================
interface RateLimitEntry {
  timestamps: number[];
}

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 20;
const rateLimitMap = new Map<string, RateLimitEntry>();

// Lazy cleanup threshold — clean map when it grows beyond this size
const CLEANUP_THRESHOLD = 200;

function lazyCleanup(): void {
  if (rateLimitMap.size <= CLEANUP_THRESHOLD) return;
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    entry.timestamps = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (entry.timestamps.length === 0) {
      rateLimitMap.delete(key);
    }
  }
}

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetIn: number } {
  // Lazy cleanup: only runs when map grows beyond threshold (Edge-safe, no setInterval)
  lazyCleanup();

  const now = Date.now();
  let entry = rateLimitMap.get(ip);

  if (!entry) {
    entry = { timestamps: [] };
    rateLimitMap.set(ip, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);

  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldest = entry.timestamps[0];
    const resetIn = Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, remaining: 0, resetIn };
  }

  entry.timestamps.push(now);
  const remaining = RATE_LIMIT_MAX_REQUESTS - entry.timestamps.length;
  return { allowed: true, remaining, resetIn: 0 };
}

// Cloudflare Pages middleware — handles request interception
export const middleware: NextMiddleware = async (request: NextRequest) => {
  const response = NextResponse.next();

  // CORS headers for Cloudflare Pages
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 204,
      headers: response.headers,
    });
  }

  // ---- RATE LIMITING: /api/chat POST only ----
  if (request.nextUrl.pathname === '/api/chat' && request.method === 'POST') {
    const clientIP = getClientIP(request);
    const { allowed, remaining } = checkRateLimit(clientIP);

    // Add rate limit headers to all /api/chat responses
    response.headers.set('X-RateLimit-Limit', String(RATE_LIMIT_MAX_REQUESTS));
    response.headers.set('X-RateLimit-Remaining', String(remaining));

    if (!allowed) {
      return NextResponse.json(
        { error: 'Demasiadas solicitudes. Intenta en un momento.' },
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }
  }

  return response;
};

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
