export const runtime = 'edge';

// ========================================
// RESEARCH API — Intelligent Web Research (Perplexity-style)
// 1. Searches DuckDuckGo for relevant sources
// 2. Fetches and extracts text from top pages
// 3. Sends sources + query to AI for analysis
// 4. Returns structured summary with citations + source list
//
// All FREE — no API keys needed for search
// ========================================

import { NextRequest, NextResponse } from 'next/server';
import { createChatCompletion, streamChatCompletion } from '@/lib/ai-client';

const QWEN_CONFIG = {
  baseUrl: process.env.QWEN_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.QWEN_API_KEY || '',
  model: process.env.QWEN_MODEL || 'qwen/qwen-turbo',
};

interface SearchResult {
  position: number;
  url: string;
  title: string;
  snippet: string;
  score: number;
}

// ========================================
// HELPER: Strip HTML to plain text (Edge-compatible)
// ========================================
function stripHtml(html: string, maxLen = 4000): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '');

  text = text
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/br>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');

  text = text.replace(/<[^>]+>/g, '');

  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));

  text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n');

  return text.trim().substring(0, maxLen);
}

// ========================================
// HELPER: Extract meaningful text from HTML
// ========================================
function extractArticleText(html: string): string {
  const articleMatch = html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch) return stripHtml(articleMatch[1], 5000);

  const mainMatch = html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (mainMatch) return stripHtml(mainMatch[1], 5000);

  const cleaned = html
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  return stripHtml(cleaned, 4000);
}

// ========================================
// STEP 1: Search DuckDuckGo HTML (Lite has CAPTCHA)
// ========================================
const SEARCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es,es-419;q=0.9,en;q=0.8',
};

function cleanSnippet(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

// MULTI-ENGINE SEARCH: Brave + Bing + DuckDuckGo with fallback
async function searchBrave(query: string, maxResults = 8): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://search.brave.com/search?q=${encodedQuery}&source=web`;
  try {
    const res = await fetch(url, { headers: SEARCH_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const html = await res.text();
    const sources: SearchResult[] = [];
    const resultPattern = /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultPattern.exec(html)) !== null && sources.length < maxResults) {
      const resultUrl = match[1];
      const title = cleanSnippet(match[2]).substring(0, 200);
      if (title.length > 3 && !resultUrl.includes('search.brave.com') && !resultUrl.includes('brave.com/')) {
        sources.push({ position: sources.length + 1, url: resultUrl, title, snippet: '', score: 1 - (sources.length * 0.05) });
      }
    }
    return sources;
  } catch { return []; }
}

async function searchBing(query: string, maxResults = 8): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encodedQuery}&setlang=es`;
  try {
    const res = await fetch(url, { headers: SEARCH_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const html = await res.text();
    const sources: SearchResult[] = [];
    const bAlgoBlocks = html.split(/<li[^>]*class="b_algo"[^>]*>/i);
    for (let i = 1; i < bAlgoBlocks.length && sources.length < maxResults; i++) {
      const block = bAlgoBlocks[i];
      const urlMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/i);
      if (!urlMatch) continue;
      const resultUrl = urlMatch[1];
      if (resultUrl.includes('bing.com') || resultUrl.includes('microsoft.com')) continue;
      const titleMatch = block.match(/<a[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanSnippet(titleMatch[1]).substring(0, 200) : '';
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 250) : '';
      if (resultUrl && title && title.length > 3) {
        sources.push({ position: sources.length + 1, url: resultUrl, title, snippet, score: 1 - (sources.length * 0.05) });
      }
    }
    return sources;
  } catch { return []; }
}

async function searchDuckDuckGo(query: string, maxResults = 8): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
  try {
    const ddgRes = await fetch(ddgUrl, { headers: SEARCH_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!ddgRes.ok) return [];
    const html = await ddgRes.text();
    const sources: SearchResult[] = [];
    const resultBlocks = html.split(/<div class="result results_links[\s\S]*?web-result\s*"/i);
    for (let i = 1; i < resultBlocks.length && sources.length < maxResults; i++) {
      const block = resultBlocks[i];
      const urlMatch = block.match(/class="result__a"[^>]*href="(?:\/\/|https?:\/\/)duckduckgo\.com\/l\/?uddg=([^"&]+)/i);
      if (!urlMatch) continue;
      let url = urlMatch[1];
      try { url = decodeURIComponent(url); } catch {}
      if (!url || url.includes('duckduckgo.com') || url.includes('bing.com') || url.includes('microsoft.com')) continue;
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanSnippet(titleMatch[1]) : '';
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 250) : '';
      if (url && title) {
        sources.push({ position: sources.length + 1, url, title, snippet: snippet || '', score: 1 - (sources.length * 0.05) });
      }
    }
    return sources;
  } catch { return []; }
}

// Multi-engine merge with dedup
async function searchAllEngines(query: string, maxResults = 8): Promise<SearchResult[]> {
  const [brave, bing, ddg] = await Promise.all([
    searchBrave(query, maxResults),
    searchBing(query, maxResults),
    searchDuckDuckGo(query, maxResults),
  ]);
  const seenDomains = new Set<string>();
  const merged: SearchResult[] = [];
  function addSources(sources: SearchResult[]) {
    for (const src of sources) {
      try {
        const domain = new URL(src.url).hostname.replace(/^www\./, '');
        if (seenDomains.has(domain)) continue;
        seenDomains.add(domain);
        merged.push(src);
      } catch {}
    }
  }
  addSources(brave);
  addSources(bing);
  addSources(ddg);
  console.log(`[RESEARCH] Merged ${merged.length} unique sources (Brave:${brave.length} Bing:${bing.length} DDG:${ddg.length})`);
  return merged.slice(0, maxResults);
}

// ========================================
// STEP 2: Fetch page content (with timeout)
// ========================================
async function fetchPageContent(url: string, timeoutMs = 6000): Promise<{ text: string; success: boolean }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AtlasBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,es-419,en;q=0.5',
      },
    });

    clearTimeout(timer);

    if (!res.ok) return { text: '', success: false };

    const html = await res.text();
    const text = extractArticleText(html);

    return { text, success: text.length > 100 };
  } catch (err) {
    console.warn(`[RESEARCH] Failed to fetch ${url}:`, err instanceof Error ? err.message : 'unknown');
    return { text: '', success: false };
  }
}

// ========================================
// POST /api/research — Full research pipeline
// ========================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, maxResults = 8 } = body;

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: 'La consulta debe tener al menos 2 caracteres' },
        { status: 400 }
      );
    }

    if (!QWEN_CONFIG.apiKey) {
      return NextResponse.json(
        { error: 'Servicio de IA no configurado' },
        { status: 500 }
      );
    }

    // ---- STEP 1: Search ----
    console.log('[RESEARCH] Step 1: Searching all engines for:', query.trim());
    const sources = await searchAllEngines(query.trim(), maxResults);

    if (sources.length === 0) {
      return NextResponse.json({
        query: query.trim(),
        summary: 'No se encontraron resultados para esta consulta. Intenta con otros terminos.',
        sources: [],
        totalSources: 0,
      });
    }

    // ---- STEP 2: Fetch top 5 pages content in parallel ----
    console.log('[RESEARCH] Step 2: Fetching content from top sources...');
    const topSources = sources.slice(0, 5);
    const fetchResults = await Promise.all(
      topSources.map(async (src) => {
        const { text, success } = await fetchPageContent(src.url);
        return {
          ...src,
          content: text,
          contentFetched: success,
        };
      })
    );

    // Build context for AI from successfully fetched pages
    const fetchedSources = fetchResults.filter(s => s.contentFetched);
    let sourcesContext = '';
    for (const src of fetchedSources) {
      sourcesContext += `\n---\nFUENTE ${src.position}: ${src.title}\nURL: ${src.url}\n${src.content}\n`;
    }

    // Also include snippets from sources we couldn't fetch
    const unfetchedSources = fetchResults.filter(s => !s.contentFetched);
    if (unfetchedSources.length > 0) {
      sourcesContext += '\n---\nFUENTES ADICIONALES (solo resumen disponible):\n';
      for (const src of unfetchedSources) {
        sourcesContext += `\n- ${src.title}: ${src.snippet}\n  URL: ${src.url}\n`;
      }
    }

    // Include remaining sources (6-8) as URLs only
    const remainingSources = sources.slice(5);
    if (remainingSources.length > 0) {
      sourcesContext += '\nOTRAS FUENTES ENCONTRADAS:\n';
      for (const src of remainingSources) {
        sourcesContext += `- ${src.title}: ${src.url}\n`;
      }
    }

    // ---- STEP 3: Generate AI summary with citations ----
    console.log('[RESEARCH] Step 3: Generating AI summary...');
    // Detect if it's a football query for specialized handling
    const isFootballQ = /futbol|fútbol|soccer|partido|goles?|liga|champions|libertadores|premier|bundesliga|serie a|ligue 1|messi|ronaldo|mbappe|haaland|balon de oro|mundial|seleccion|equipo|jugador|entrenador|marcador|posiciones|clasificacion|goleador|transferencia|fichaje/i.test(query);
    
    const researchPrompt = `Eres un asistente de investigacion experto. Analiza las siguientes fuentes web y responde a la consulta del usuario de forma completa y bien estructurada.

REGLAS IMPORTANTES:
- Responde en español
- Usa negritas con **texto** para conceptos clave
- Usa viñetas (-) para listas
- Incluye citas numeradas [1], [2], etc. cuando uses información de una fuente
- Al final, incluye una seccion "Fuentes" con los enlaces reales
- Da una conclusion o resumen final
- Sé objetivo y basado en las fuentes proporcionadas
- Si las fuentes no son suficientes, indicalo claramente
- NO inventes información que no este en las fuentes
${isFootballQ ? `- PARA TEMAS DE FUTBOL: Eres un experto en futbol. Si la consulta es sobre futbol, da datos especificos (marcadores, goleadores, posiciones, estadisticas). Usa formato "EquipoA X-Y EquipoB" para resultados. Incluye nombres de jugadores, fechas y datos tacticos si estan disponibles.` : ''}

CONSULTA DEL USUARIO: ${query.trim()}

CONTENIDO DE LAS FUENTES:
${sourcesContext}

Responde ahora de forma completa y detallada:`;

    // Try streaming first
    let qwenStream: ReadableStream<Uint8Array> | null = null;
    try {
      qwenStream = await streamChatCompletion({
        messages: [
          { role: 'system', content: 'Eres Atlas, un asistente de investigacion experto que analiza fuentes web y genera respuestas estructuradas con citas.' },
          { role: 'user', content: researchPrompt },
        ],
        temperature: 0.5,
        max_tokens: 1500,
      });
    } catch (streamErr) {
      console.error('[RESEARCH] Streaming failed, trying non-streaming:', streamErr);
    }

    if (qwenStream) {
      return createResearchStream(qwenStream, sources);
    }

    // Fallback: non-streaming
    console.log('[RESEARCH] Falling back to non-streaming');
    const completion = await createChatCompletion({
      messages: [
        { role: 'system', content: 'Eres Atlas, un asistente de investigacion experto que analiza fuentes web y genera respuestas estructuradas con citas.' },
        { role: 'user', content: researchPrompt },
      ],
      temperature: 0.5,
      max_tokens: 1500,
    });

    const summary = completion.choices?.[0]?.message?.content?.trim() || 'No se pudo generar un resumen.';

    return NextResponse.json({
      query: query.trim(),
      summary,
      sources: sources.map(s => ({
        position: s.position,
        url: s.url,
        title: s.title,
        snippet: s.snippet,
      })),
      totalSources: sources.length,
    });
  } catch (error) {
    console.error('[RESEARCH] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor de investigacion' },
      { status: 500 }
    );
  }
}

// ========================================
// STREAMING RESEARCH — SSE stream for research results
// ========================================
function createResearchStream(
  upstream: ReadableStream<Uint8Array>,
  sources: SearchResult[],
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        try { controller.enqueue(encoder.encode(data)); } catch {}
      };

      try {
        const reader = upstream.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice(6);
            if (payload === '[DONE]') continue;

            try {
              const json = JSON.parse(payload);
              const token = json.choices?.[0]?.delta?.content || '';
              if (token) {
                fullText += token;
                send(`data: ${JSON.stringify({ token })}\n\n`);
              }
            } catch {}
          }
        }

        send(`data: ${JSON.stringify({ done: true, full: fullText, sources: sources })}\n\n`);
      } catch (error) {
        console.error('[RESEARCH] Stream error:', error);
        send(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
