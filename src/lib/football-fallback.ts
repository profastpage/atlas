// ========================================
// FOOTBALL FALLBACK (Plan B) — Web Search + AI Structuring
// Activates when football-data.org API fails or returns empty.
//
// Priority sources per section:
//   Scorers:    Transfermarkt, ESPN, official league sites
//   Live/Calendar: Flashscore, Sporticos, Sofascore
//   Standings:  FotMob, Soccerway, FBref
//
// Geographic priority: Liga 1 Perú > Top European leagues
// All times in UTC-5 (America/Lima)
// Uses Qwen AI to structure extracted web data into API format
// ========================================

import { createChatCompletion } from '@/lib/ai-client';

// ========================================
// LEAGUE NAME MAPPING (competition code → display name)
// ========================================

const LEAGUE_NAMES: Record<number, string> = {
  2021: 'Premier League',
  2014: 'La Liga',
  2019: 'Serie A',
  2002: 'Bundesliga',
  2015: 'Ligue 1',
  2001: 'UEFA Champions League',
  2003: 'UEFA Europa League',
  2028: 'Liga 1 Perú',
  2022: 'Liga MX',
  2013: 'MLS',
  2017: 'Primeira Liga',
};

// ========================================
// SEARCH QUERIES — Tailored per action + league
// ========================================

function buildSearchQuery(action: string, leagueCode?: number | null): string {
  const leagueName = leagueCode ? LEAGUE_NAMES[leagueCode] : null;

  switch (action) {
    case 'live':
      if (leagueName === 'Liga 1 Perú') return 'partidos en vivo Liga 1 Perú hoy resultados marcadores';
      if (leagueName) return `live scores ${leagueName} today matches results`;
      return 'fútbol partidos en vivo hoy resultados marcadores Liga 1 Perú Champions League';
    case 'standings':
      if (leagueName === 'Liga 1 Perú') return 'tabla de posiciones Liga 1 Perú 2025 clasificación';
      if (leagueName) return `${leagueName} standings table 2025 positions`;
      return 'tabla de posiciones Liga 1 Perú 2025 clasificación fútbol';
    case 'fixtures':
      if (leagueName === 'Liga 1 Perú') return 'calendario Liga 1 Perú próximos partidos jornada';
      if (leagueName) return `${leagueName} upcoming fixtures next matches schedule`;
      return 'calendario fútbol próximos partidos Liga 1 Perú Champions League';
    case 'scorers':
      if (leagueName === 'Liga 1 Perú') return 'goleadores Liga 1 Perú 2025 tabla de artilleros goles';
      if (leagueName) return `${leagueName} top scorers 2025 goals assists`;
      return 'goleadores Liga 1 Perú 2025 tabla artilleros fútbol goles';
    default:
      return 'fútbol resultados hoy Liga 1 Perú partidos en vivo';
  }
}

// ========================================
// MULTI-ENGINE WEB SEARCH (Edge-compatible)
// Reuses pattern from research route
// ========================================

const SEARCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es,es-419;q=0.9,en;q=0.8',
};

function cleanSnippet(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Priority sources by action
const PRIORITY_DOMAINS: Record<string, string[]> = {
  live: ['flashscore.com', 'sofascore.com', 'sporticos.com', 'live-result.com', 'livesoccertv.com', 'scorebat.com'],
  standings: ['fbref.com', 'soccerway.com', 'fotmob.com', 'flashscore.com', 'transfermarkt.com', 'espn.com'],
  fixtures: ['flashscore.com', 'sofascore.com', 'sporticos.com', 'soccerway.com', 'espn.com', 'goal.com'],
  scorers: ['transfermarkt.com', 'espn.com', 'fbref.com', 'sofascore.com', 'liga1.pe', 'adexperu.org.pe'],
};

// SearXNG instances for JSON search
const SEARXNG_INSTANCES = [
  'https://search.sapti.me',
  'https://searx.be',
  'https://search.bus-hit.me',
  'https://searx.tiekoetter.com',
];

interface SearchResult {
  position: number;
  url: string;
  title: string;
  snippet: string;
  domain: string;
}

async function searchSearXNG(query: string, maxResults = 8): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  for (const instance of SEARXNG_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodedQuery}&format=json&categories=general&language=es`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'AtlasBot/2.0 (Football Fallback)' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const results: SearchResult[] = [];
      for (const item of (data.results || [])) {
        if (results.length >= maxResults) break;
        const itemUrl = item.url || '';
        const title = cleanSnippet(item.title || '').substring(0, 200);
        const snippet = cleanSnippet(item.content || '').substring(0, 300);
        if (!itemUrl || !title || title.length < 3 || itemUrl.includes('searx')) continue;
        let domain = '';
        try { domain = new URL(itemUrl).hostname.replace(/^www\./, ''); } catch {}
        results.push({ position: results.length + 1, url: itemUrl, title, snippet, domain });
      }
      if (results.length > 0) return results;
    } catch { continue; }
  }
  return [];
}

async function searchDDGInstant(query: string, maxResults = 8): Promise<SearchResult[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=atlas_football`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000), headers: { 'Accept': 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    const results: SearchResult[] = [];
    if (data.Abstract && data.AbstractURL) {
      let domain = '';
      try { domain = new URL(data.AbstractURL).hostname.replace(/^www\./, ''); } catch {}
      results.push({ position: results.length + 1, url: data.AbstractURL, title: data.Heading || 'DuckDuckGo', snippet: data.Abstract.substring(0, 300), domain });
    }
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (results.length >= maxResults) break;
        if (topic.Text && topic.FirstURL) {
          let domain = '';
          try { domain = new URL(topic.FirstURL).hostname.replace(/^www\./, ''); } catch {}
          results.push({ position: results.length + 1, url: topic.FirstURL, title: topic.Text.substring(0, 200), snippet: topic.Text.substring(0, 300), domain });
        }
      }
    }
    return results;
  } catch { return []; }
}

async function searchDuckDuckGo(query: string, maxResults = 8): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
  try {
    const ddgRes = await fetch(ddgUrl, { headers: SEARCH_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!ddgRes.ok) return [];
    const html = await ddgRes.text();
    const results: SearchResult[] = [];
    const resultBlocks = html.split(/<div class="result results_links[\s\S]*?web-result\s*"/i);
    for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
      const block = resultBlocks[i];
      const urlMatch = block.match(/class="result__a"[^>]*href="(?:\/\/|https?:\/\/)duckduckgo\.com\/l\/?uddg=([^"&]+)/i);
      if (!urlMatch) continue;
      let url = urlMatch[1];
      try { url = decodeURIComponent(url); } catch {}
      if (!url || url.includes('duckduckgo.com') || url.includes('bing.com') || url.includes('microsoft.com')) continue;
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanSnippet(titleMatch[1]) : '';
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 300) : '';
      if (url && title) {
        let domain = '';
        try { domain = new URL(url).hostname.replace(/^www\./, ''); } catch {}
        results.push({ position: results.length + 1, url, title, snippet, domain });
      }
    }
    return results;
  } catch { return []; }
}

async function searchBrave(query: string, maxResults = 8): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://search.brave.com/search?q=${encodedQuery}&source=web`;
  try {
    const res = await fetch(url, { headers: SEARCH_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchResult[] = [];
    const resultPattern = /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultPattern.exec(html)) !== null && results.length < maxResults) {
      const resultUrl = match[1];
      const title = cleanSnippet(match[2]).substring(0, 200);
      if (title.length > 3 && !resultUrl.includes('search.brave.com')) {
        let domain = '';
        try { domain = new URL(resultUrl).hostname.replace(/^www\./, ''); } catch {}
        results.push({ position: results.length + 1, url: resultUrl, title, snippet: '', domain });
      }
    }
    return results;
  } catch { return []; }
}

async function searchBing(query: string, maxResults = 8): Promise<SearchResult[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encodedQuery}&setlang=es`;
  try {
    const res = await fetch(url, { headers: SEARCH_HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const html = await res.text();
    const results: SearchResult[] = [];
    const bAlgoBlocks = html.split(/<li[^>]*class="b_algo"[^>]*>/i);
    for (let i = 1; i < bAlgoBlocks.length && results.length < maxResults; i++) {
      const block = bAlgoBlocks[i];
      const urlMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/i);
      if (!urlMatch) continue;
      const resultUrl = urlMatch[1];
      if (resultUrl.includes('bing.com') || resultUrl.includes('microsoft.com')) continue;
      const titleMatch = block.match(/<a[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanSnippet(titleMatch[1]).substring(0, 200) : '';
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 300) : '';
      if (resultUrl && title && title.length > 3) {
        let domain = '';
        try { domain = new URL(resultUrl).hostname.replace(/^www\./, ''); } catch {}
        results.push({ position: results.length + 1, url: resultUrl, title, snippet, domain });
      }
    }
    return results;
  } catch { return []; }
}

// Cascading search with domain priority
async function searchFootball(action: string, leagueCode?: number | null): Promise<SearchResult[]> {
  const query = buildSearchQuery(action, leagueCode);
  const priorityDomains = PRIORITY_DOMAINS[action] || [];

  // Phase 1: Fast engines in parallel
  const [searxng, ddgInstant, ddg] = await Promise.all([
    searchSearXNG(query, 10),
    searchDDGInstant(query, 10),
    searchDuckDuckGo(query, 10),
  ]);

  // Deduplicate by domain, prioritize known football sources
  const seenDomains = new Set<string>();
  const merged: SearchResult[] = [];

  function addResults(results: SearchResult[]) {
    for (const r of results) {
      if (seenDomains.has(r.domain)) continue;
      seenDomains.add(r.domain);
      merged.push(r);
    }
  }

  // First: add results from priority domains
  const allFast = [...searxng, ...ddgInstant, ...ddg];
  const priority = allFast.filter(r => priorityDomains.some(d => r.domain.includes(d)));
  const others = allFast.filter(r => !priorityDomains.some(d => r.domain.includes(d)));
  addResults(priority);
  addResults(others);

  // Phase 2: Slow engines only if < 5 results
  if (merged.length < 5) {
    const [brave, bing] = await Promise.all([
      searchBrave(query, 10),
      searchBing(query, 10),
    ]);
    addResults(brave);
    addResults(bing);
  }

  console.log(`[FOOTBALL_FALLBACK] Search "${action}" found ${merged.length} results (query: "${query}")`);
  return merged.slice(0, 10);
}

// ========================================
// PAGE CONTENT EXTRACTION (Edge-compatible)
// ========================================

function stripHtml(html: string, maxLen = 5000): string {
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
    .replace(/<\/tr>/gi, '\n')
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

async function fetchPageContent(url: string, timeoutMs = 6000): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AtlasBot/1.0 Football Fallback)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,es-419,en;q=0.5',
      },
    });

    clearTimeout(timer);
    if (!res.ok) return '';

    const html = await res.text();

    // Try to extract article/main content first
    const articleMatch = html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
    if (articleMatch) return stripHtml(articleMatch[1], 5000);

    const mainMatch = html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
    if (mainMatch) return stripHtml(mainMatch[1], 5000);

    // Fallback: clean entire page
    const cleaned = html
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');

    return stripHtml(cleaned, 4000);
  } catch {
    return '';
  }
}

// ========================================
// AI STRUCTURING — Qwen formats raw text into API response
// ========================================

type FootballAction = 'live' | 'standings' | 'fixtures' | 'scorers';

interface FallbackResult {
  type: string;
  _fallback: true;
  _source: string;
  [key: string]: any;
}

function buildAIPrompt(action: FootballAction, rawContent: string, leagueName: string | null): string {
  const now = new Date();
  const limaTime = now.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  switch (action) {
    case 'live':
      return `Eres un extractor de datos deportivos. Analiza el siguiente contenido web extraído de fuentes deportivas y extrae TODOS los partidos en vivo o resultados de hoy que encuentres.

HORA ACTUAL EN LIMA (Perú): ${limaTime}

INSTRUCCIONES:
- Formato de cada partido: "Equipo Local X-Y Equipo Visitante [ESTADO] (Liga)" 
- ESTADO puede ser: minutos con "'" (ej: "45'"), "Descanso", "Final", "Por jugar HH:MM"
- TODAS las horas deben estar en UTC-5 (hora de Perú)
- Prioriza Liga 1 Perú y luego ligas europeas (Premier, La Liga, Serie A, Bundesliga, Ligue 1, Champions)
- Si no hay partidos en vivo, muestra los próximos partidos programados para hoy
- Máximo 15 partidos
- Un partido por línea
- NO inventes datos que no estén en las fuentes
- Si no hay datos de partidos, responde SOLO con: "__NO_DATA__"${leagueName ? `\nLiga solicitada: ${leagueName}` : '\nLiga solicitada: todas (priorizar Liga 1 Perú)'}

CONTENIDO WEB:
${rawContent}

OUTPUT (un partido por línea):`;

    case 'standings':
      return `Eres un extractor de datos deportivos. Analiza el siguiente contenido web y extrae la TABLA DE POSICIONES completa.

INSTRUCCIONES:
- Formato de tabla con columnas: Pos | Equipo | PJ | G | E | P | GF | GC | DG | Pts
- Separador de columna: " | "
- Header: "Pos | Equipo                    | PJ  | G  | E  | P  | GF | GC | DG  | Pts"
- Línea separadora: "---"
- Máximo 20 equipos
- Los nombres de equipos deben ser completos
- NO inventes datos
- Si no hay tabla de posiciones, responde SOLO con: "__NO_DATA__"${leagueName ? `\nLiga solicitada: ${leagueName}` : '\nLiga solicitada: todas (priorizar Liga 1 Perú)'}

CONTENIDO WEB:
${rawContent}

OUTPUT (tabla completa):`;

    case 'fixtures':
      return `Eres un extractor de datos deportivos. Analiza el siguiente contenido web y extrae los PRÓXIMOS PARTIDOS programados.

HORA ACTUAL EN LIMA (Perú): ${limaTime}

INSTRUCCIONES:
- Formato de cada partido: "Equipo Local vs Equipo Visitante — DIA HORA (Liga)"
- Los DÍAS en español: lun, mar, mié, jue, vie, sáb, dom
- TODAS las horas en UTC-5 (hora de Perú)
- Prioriza Liga 1 Perú y luego ligas europeas
- Máximo 15 partidos
- Un partido por línea
- NO inventes datos
- Si no hay fixtures, responde SOLO con: "__NO_DATA__"${leagueName ? `\nLiga solicitada: ${leagueName}` : '\nLiga solicitada: todas (priorizar Liga 1 Perú)'}

CONTENIDO WEB:
${rawContent}

OUTPUT (un partido por línea):`;

    case 'scorers':
      return `Eres un extractor de datos deportivos. Analiza el siguiente contenido web y extrae la TABLA DE GOLEADORES.

INSTRUCCIONES:
- Formato de cada goleador: "Nombre del Jugador (Equipo) — X goles, Y asistencias"
- Máximo 15 goleadores
- Ordenar por goles (mayor a menor)
- Los nombres deben ser completos
- Para cada goleador incluir: Nombre, Equipo, Goles
- Si no hay datos de asistencias, solo muestra goles
- NO inventes datos
- Si no hay goleadores, responde SOLO con: "__NO_DATA__"${leagueName ? `\nLiga solicitada: ${leagueName}` : '\nLiga solicitada: todas (priorizar Liga 1 Perú)'}

CONTENIDO WEB:
${rawContent}

OUTPUT (un goleador por línea):`;

    default:
      return '';
  }
}

async function structureWithAI(
  action: FootballAction,
  rawContent: string,
  leagueName: string | null
): Promise<string | null> {
  try {
    const prompt = buildAIPrompt(action, rawContent, leagueName);

    const completion = await createChatCompletion({
      messages: [
        {
          role: 'system',
          content: 'Eres un extractor de datos deportivos. Extrae datos de fuentes web de forma precisa. Responde SOLO con los datos extraídos, sin explicaciones adicionales.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() || '';

    if (!text || text.includes('__NO_DATA__')) return null;

    console.log(`[FOOTBALL_FALLBACK] AI structured ${text.length} chars for "${action}"`);
    return text;
  } catch (err) {
    console.warn('[FOOTBALL_FALLBACK] AI structuring failed:', err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

// ========================================
// NEWS SUMMARY FALLBACK (when no data at all)
// ========================================

async function generateNewsSummary(action: string): Promise<string | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const query = `últimas noticias deportivas fútbol hoy ${today} Liga 1 Perú`;

    const results = await searchSearXNG(query, 5);
    if (results.length === 0) return null;

    // Collect snippets as news context
    const newsContext = results
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title} — ${r.snippet} (${r.domain})`)
      .join('\n');

    const completion = await createChatCompletion({
      messages: [
        {
          role: 'system',
          content: 'Eres un redactor deportivo peruano. Genera un resumen conciso de las últimas noticias deportivas basándote en los titulares proporcionados. Responde en español, máximo 5 líneas, enfocado en fútbol.',
        },
        {
          role: 'user',
          content: `Genera un resumen deportivo actual con estos titulares:\n\n${newsContext}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 400,
    });

    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ========================================
// MAIN ENTRY POINT — Football Fallback
// ========================================

export async function getFootballFallback(
  action: FootballAction,
  leagueCode?: number | null
): Promise<FallbackResult | null> {
  console.log(`[FOOTBALL_FALLBACK] Activating Plan B for "${action}"${leagueCode ? ` (league: ${leagueCode})` : ''}`);

  const leagueName = leagueCode ? LEAGUE_NAMES[leagueCode] || null : null;

  // Step 1: Search the web
  const searchResults = await searchFootball(action, leagueCode);
  if (searchResults.length === 0) {
    console.log('[FOOTBALL_FALLBACK] No search results found');

    // Last resort: generate news summary
    const newsSummary = await generateNewsSummary(action);
    if (newsSummary) {
      return {
        type: action,
        _fallback: true,
        _source: 'news_summary',
        newsSummary,
      };
    }

    return null;
  }

  // Step 2: Fetch content from top 5 results in parallel
  const topResults = searchResults.slice(0, 5);
  const fetchPromises = topResults.map(async (result) => {
    const content = await fetchPageContent(result.url, 5000);
    return {
      url: result.url,
      title: result.title,
      domain: result.domain,
      content: content || result.snippet,
      hasContent: content.length > 100,
    };
  });

  const fetchResults = await Promise.all(fetchPromises);
  const successfulFetches = fetchResults.filter(r => r.hasContent);

  // Build combined content for AI
  let rawContent = '';
  for (const page of successfulFetches) {
    rawContent += `\n=== FUENTE: ${page.title} (${page.domain}) ===\n${page.content}\n`;
  }

  // Also include snippets from pages we couldn't fetch
  const failedFetches = fetchResults.filter(r => !r.hasContent);
  if (failedFetches.length > 0) {
    rawContent += '\n=== RESÚMENES ADICIONALES ===\n';
    for (const page of failedFetches) {
      rawContent += `- ${page.title}: ${page.snippet || 'Sin resumen'}\n`;
    }
  }

  if (rawContent.trim().length < 50) {
    console.log('[FOOTBALL_FALLBACK] Insufficient content from pages');
    return null;
  }

  // Step 3: Use AI to structure the data
  const structuredText = await structureWithAI(action, rawContent, leagueName);
  if (!structuredText) {
    console.log('[FOOTBALL_FALLBACK] AI could not structure data');

    // Last resort: news summary
    const newsSummary = await generateNewsSummary(action);
    if (newsSummary) {
      return {
        type: action,
        _fallback: true,
        _source: 'news_summary',
        newsSummary,
      };
    }

    return null;
  }

  // Step 4: Format into API response
  const lines = structuredText.split('\n').filter(l => l.trim());
  const sourcesUsed = successfulFetches.map(f => f.domain).slice(0, 3);

  switch (action) {
    case 'live': {
      const live: string[] = [];
      const finished: string[] = [];
      const scheduled: string[] = [];

      for (const line of lines) {
        if (line.includes("'") && !line.includes('Final') && !line.includes('Descanso')) {
          live.push(line.trim());
        } else if (line.includes('Final')) {
          finished.push(line.trim());
        } else if (line.includes('Por jugar') || line.includes('vs')) {
          scheduled.push(line.trim());
        } else {
          // Default to scheduled
          scheduled.push(line.trim());
        }
      }

      return {
        type: 'live',
        _fallback: true,
        _source: sourcesUsed.join(', '),
        date: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', weekday: 'long', day: 'numeric', month: 'long' }),
        time: new Date().toLocaleString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' }),
        live: live.slice(0, 10),
        finished: finished.slice(0, 8),
        scheduled: scheduled.slice(0, 10),
        total: live.length + finished.length + scheduled.length,
        noLive: live.length === 0,
      };
    }

    case 'standings': {
      const table = lines.join('\n');
      if (lines.length < 3) return null;

      return {
        type: 'standings',
        _fallback: true,
        _source: sourcesUsed.join(', '),
        league: leagueName || 'Fútbol',
        table,
      };
    }

    case 'fixtures': {
      const fixtures = lines.slice(0, 15);
      if (fixtures.length === 0) return null;

      return {
        type: 'fixtures',
        _fallback: true,
        _source: sourcesUsed.join(', '),
        fixtures,
        total: fixtures.length,
      };
    }

    case 'scorers': {
      const scorers = lines.slice(0, 15);
      if (scorers.length === 0) return null;

      return {
        type: 'scorers',
        _fallback: true,
        _source: sourcesUsed.join(', '),
        league: leagueName || 'Fútbol',
        scorers,
      };
    }

    default:
      return null;
  }
}
