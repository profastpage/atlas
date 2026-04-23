export const runtime = 'edge';

// ========================================
// SOURCES API — Web search via Tavily
// Returns real sources with URLs, titles, snippets
// ========================================

import { NextRequest, NextResponse } from 'next/server';

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';

interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score: number;
}

interface TavilyResponse {
  results: TavilyResult[];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, maxResults = 10 } = body;

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'Query is required (min 2 characters)' },
        { status: 400 }
      );
    }

    if (!TAVILY_API_KEY) {
      return NextResponse.json(
        { error: 'Tavily API key not configured' },
        { status: 500 }
      );
    }

    const tavilyRes = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query.trim(),
        max_results: Math.min(maxResults, 10),
        include_answer: false,
        include_raw_content: false,
        search_depth: 'basic',
      }),
    });

    if (!tavilyRes.ok) {
      const errText = await tavilyRes.text();
      console.error('[SOURCES] Tavily API error:', tavilyRes.status, errText);
      return NextResponse.json(
        { error: 'Search service temporarily unavailable' },
        { status: 502 }
      );
    }

    const data: TavilyResponse = await tavilyRes.json();

    const sources = (data.results || []).map((r, i) => ({
      position: i + 1,
      url: r.url,
      title: r.title,
      snippet: r.content?.substring(0, 200) || '',
      score: r.score,
    }));

    return NextResponse.json({
      query: query.trim(),
      sources,
      totalResults: sources.length,
    });
  } catch (error) {
    console.error('[SOURCES] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
