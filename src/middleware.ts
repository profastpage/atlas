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

  return response;
};

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
