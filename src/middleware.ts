import { NextRequest, NextResponse } from "next/server";
import { NextMiddleware } from "next/server";

// Cloudflare Pages middleware — handles request interception
export const middleware: NextMiddleware = async (request: NextRequest) => {
  const response = NextResponse.next();

  // CORS headers for Cloudflare Pages
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: response.headers,
    });
  }

  return response;
};

export const config = {
  matcher: [
    // Match all API routes
    "/api/:path*",
    // Match all pages
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
