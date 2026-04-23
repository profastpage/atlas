export const runtime = 'edge';

import { NextRequest, NextResponse } from 'next/server';

interface SearchResult {
  position: number;
  url: string;
  title: string;
  snippet: string;
  score: number;
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

    // Use DuckDuckGo HTML (Lite has CAPTCHA blocking server requests)
    const encodedQuery = encodeURIComponent(query.trim());
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    const ddgRes = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,es-419,en;q=0.5',
      },
    });

    if (!ddgRes.ok) {
      return NextResponse.json(
        { error: 'Search service temporarily unavailable' },
        { status: 502 }
      );
    }

    const html = await ddgRes.text();

    // Parse DDG HTML: <div class="result results_links ... web-result">
    // <a class="result__a" href="//duckduckgo.com/l/?uddg=ENCODED_URL">
    // <a class="result__snippet">TEXT</a>
    const sources: SearchResult[] = [];
    const resultBlocks = html.split(/<div class="result results_links[\s\S]*?web-result\s*"/i);

    for (let i = 1; i < resultBlocks.length && sources.length < maxResults; i++) {
      const block = resultBlocks[i];

      const urlMatch = block.match(/class="result__a"[^>]*href="(?:\/\/|https?:\/\/)duckduckgo\.com\/l\/\?uddg=([^"&]+)/i);
      if (!urlMatch) continue;

      let url = urlMatch[1];
      try { url = decodeURIComponent(url); } catch {}

      // Skip DDG internal URLs and ads
      if (!url || url.includes('duckduckgo.com') || url.includes('bing.com') || url.includes('microsoft.com')) continue;

      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch
        ? titleMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim()
        : '';

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      const snippet = snippetMatch
        ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim().substring(0, 200)
        : '';

      if (url && title) {
        sources.push({
          position: sources.length + 1,
          url,
          title,
          snippet: snippet || '',
          score: 1 - (sources.length * 0.05),
        });
      }
    }

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
