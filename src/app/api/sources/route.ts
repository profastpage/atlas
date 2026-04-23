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

    // Use DuckDuckGo Lite (HTML, no JS) for free web search
    const encodedQuery = encodeURIComponent(query.trim());
    const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodedQuery}`;
    
    const ddgRes = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AtlasBot/1.0)',
        'Accept': 'text/html',
      },
    });

    if (!ddgRes.ok) {
      return NextResponse.json(
        { error: 'Search service temporarily unavailable' },
        { status: 502 }
      );
    }

    const html = await ddgRes.text();

    // Parse DuckDuckGo Lite HTML results
    // DDG Lite uses tables: each result is a table row with class "result-snippet"
    const sources: SearchResult[] = [];
    const resultBlocks = html.split(/<td[^>]*class="result-snippet"[^>]*>/i);
    
    for (let i = 1; i < resultBlocks.length && sources.length < maxResults; i++) {
      const block = resultBlocks[i];
      // Extract URL from the previous block's link
      const prevBlock = resultBlocks[i - 1];
      const urlMatch = prevBlock.match(/href="(https?:\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)[^"]*)"/);
      
      if (urlMatch) {
        let url = urlMatch[2];
        try { url = decodeURIComponent(url); } catch {}
        
        // Extract title
        const titleMatch = prevBlock.match(/<a[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
        
        // Extract snippet
        const snippetMatch = block.match(/([\s\S]*?)(?:<\/td>|$)/i);
        const snippet = snippetMatch 
          ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim().substring(0, 200)
          : '';

        if (url && title && !url.includes('duckduckgo.com')) {
          sources.push({
            position: sources.length + 1,
            url,
            title,
            snippet: snippet || '',
            score: 1 - (sources.length * 0.05),
          });
        }
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
