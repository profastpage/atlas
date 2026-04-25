// ========================================
// AUTO-RESEARCH — Investigación automática antes de responder
// Previene alucinaciones: busca web, lee páginas, inyecta fuentes en contexto
// 100% GRATIS — usa múltiples motores con fallback
//
// Motor primario:   SearXNG (API JSON, sin API key, confiable desde Edge)
// Fallback 1:       DuckDuckGo Lite (HTML scraping mejorado)
// Fallback 2:       DuckDuckGo Instant Answer API (JSON, confiable)
// Fallback 3:       Wikipedia API (JSON, altamente confiable)
// Fallback 4:       Brave Search HTML (scraping, puede fallar desde CF Workers)
// Fallback 5:       Bing Search HTML (scraping, puede fallar desde CF Workers)
// ========================================

interface AutoResearchResult {
  needed: boolean;
  sources: AutoSource[];
  contextBlock: string;
}

export interface AutoSource {
  position: number;
  url: string;
  title: string;
  snippet: string;
}

// ========================================
// DETECTOR: ¿Esta pregunta necesita investigación?
// ========================================

const NO_RESEARCH_PATTERNS = [
  /^(hola|hey|buenos dias|buenas tardes|buenas noches|que tal|hi|hello|saludos|ey|oye|che|claro|si|no|ok|vale|gracias|thanks|genial|perfecto|excelente|creo|quizas|tal vez|mmhmm|aja|mmm|jaja|jeje|lol|nice|cool|bien|mal|regular)\b/i,
  /^(me siento|estoy triste|estoy feliz|estoy contento|estoy enojado|estoy cansado|estoy aburrido|estoy estresado|estoy motivado|me da miedo|tengo miedo|estoy nervioso|estoy ansioso|me preocupo|no se que hacer|estoy confundido)/i,
  /^(adios|chau|nos vemos|hasta luego|buenas noches|me voy|me tengo que ir|descanso)/i,
  /^(que opinas|que me recomiendas|que me sugieres|ayudame con|quiero que me|necesito que me|por favor|podrias)/i,
  /^.{1,15}$/i, // Very short messages (less than 15 chars) — likely casual
];

const RESEARCH_TRIGGER_PATTERNS = [
  // Question patterns
  /\?/i,
  /^(que|quien|como|cuando|donde|por que|cual|cuantos|cuantas|cuan)\b/i,
  /^(what|who|how|when|where|why|which|how many|how much)\b/i,
  // Research commands
  /\b(busca|buscame|investiga|investigame|busca en internet|busca en la web|googlea|look up|search)\b/i,
  // Data/factual keywords
  /\b(dato|datos|estadistica|estadisticas|numero|numeros|cifra|cifras|porcentaje|ranking|record|records|historico)\b/i,
  // Current events
  /\b(noticia|noticias|hoy|ayer|semana|mes|actual|reciente|ultim[oa]|2024|2025|2026)\b/i,
  // Medical/health
  /\b(sintoma|sintomas|tratamiento|diagnostico|enfermedad|condicion|medicamento|vitamina|mineral|suplemento|proteina|carbohidrato|caloria|calorias|macronutriente|micronutriente|glucosa|insulina|colesterol|presion arterial|imc|indice de masa)\b/i,
  // Nutrition
  /\b(nutricion|nutricional|dieta|alimentacion|alimento|comida|receta|proteinas|grasas|carbohidratos|fibra|vitaminas|minerales|hidratacion|agua|suplemento|creatina|whey|caseina|bcaa|glutamina|cafeina|preentreno|postentreno|meal prep|ayuno intermitente|keto|ketogenica|vegano|vegetariano|macro|mikro)\b/i,
  // Physiology
  /\b(fisiologia|fisiologico|musculo|musculo|tendon|tendinitis|ligamento|articulacion|rotura|lesion|recuperacion|rehabilitacion|estiramiento|calentamiento|enfriamiento|flexibilidad|movilidad|vo2|frecuencia cardiaca|ritmo cardiaco|metabolismo|anabolismo|catabolismo|testosterona|cortisol|melatonina|serotonina|dopamina)\b/i,
  // Football
  /\b(futbol|futbol|soccer|partido|partidos|goles|gol|liga|champions|libertadores|premier|bundesliga|serie a|ligue 1|marcador|resultado|posiciones|clasificacion|goleador|transferencia|fichaje|entrenador|jugador|seleccion|mundial|balon de oro|copa america|eurocopa|convocatoria|alineacion|tactica|formacion|xG|asistencia)\b/i,
  // Teams and players
  /\b(real madrid|barcelona|atletico|manchester city|liverpool|arsenal|chelsea|bayern|psg|juventus|inter|milan|river plate|boca juniors|alianza lima|universitario|sporting cristal|flamengo|palmeiras)\b/i,
  /\b(messi|ronaldo|cristiano|mbappe|haaland|vinicius|bellingham|rodri|salah|neymar|de bruyne|pedri|gavi|valverde|ollie watkins|saka|palmer|isak|lewandowski)\b/i,
  // Cinema / Movies — triggers auto-research for real-time scores, reviews, testimonials
  /\b(pelicula|película|cine|film|movie|peliculas|películas|peliculon|taquillera|estreno|cartelera|direct[oa]r?|actor|actriz|guionista|productora|oscar|premio cannes|festival de cine|sundance|venecia|berlin)\b/i,
  /\b(netflix|hbo|max|disney\+?|prime video|apple tv|paramount\+?|peacock|crunchyroll|stan|hulu|mubi|filmaffinity|imdb|rotten tomatoes|letterboxd|metacritic)\b/i,
  /\b(que pelicula|que peli|recomend[ae]s? pelicula|mejores peliculas|peliculas del (ano|2024|2025|2026)|estrenos (del mes|de |de este|2024|2025|2026)|vale la pena ver|que ver en|pelicula de (terror|accion|comedia|drama|ciencia ficcion|thriller|romance|animacion|fantasia|documental))\b/i,
];

export function needsAutoResearch(message: string): boolean {
  const trimmed = message.trim();
  if (!trimmed || trimmed.length < 3) return false;

  // Check NO_RESEARCH first
  for (const pattern of NO_RESEARCH_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }

  // Check RESEARCH triggers
  for (const pattern of RESEARCH_TRIGGER_PATTERNS) {
    if (pattern.test(trimmed)) return true;
  }

  // Default: messages longer than 50 chars that look like questions/statements about topics
  if (trimmed.length > 50 && /\b(es|son|fue|fueron|tiene|tienen|hay|estan|era|sera|puede|pueden|deberia|deberian)\b/i.test(trimmed)) {
    return true;
  }

  return false;
}

// ========================================
// HELPERS: Strip HTML and extract article text
// ========================================

function stripHtml(html: string, maxLen = 3000): string {
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

function extractArticleText(html: string): string {
  const articleMatch = html.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch) return stripHtml(articleMatch[1], 4000);

  const mainMatch = html.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (mainMatch) return stripHtml(mainMatch[1], 4000);

  const cleaned = html
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  return stripHtml(cleaned, 3000);
}

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

const SEARCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es,es-419;q=0.9,en;q=0.8,en-US;q=0.7',
};

// ========================================
// SEARCH ENGINE 1: SearXNG Public API (JSON, most reliable from Edge)
// Multiple public instances for redundancy
// ========================================

const SEARXNG_INSTANCES = [
  'https://search.sapti.me',
  'https://searx.be',
  'https://search.bus-hit.me',
  'https://searx.tiekoetter.com',
];

async function searchSearXNG(query: string, maxResults = 5): Promise<AutoSource[]> {
  const encodedQuery = encodeURIComponent(query);

  for (const instance of SEARXNG_INSTANCES) {
    try {
      const url = `${instance}/search?q=${encodedQuery}&format=json&categories=general&language=es`;
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AtlasBot/2.0 (Research Agent)',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) continue;

      const data = await res.json();
      const results: AutoSource[] = [];

      for (const item of (data.results || [])) {
        if (results.length >= maxResults) break;
        const itemUrl = item.url || '';
        const title = cleanSnippet(item.title || '').substring(0, 200);
        const snippet = cleanSnippet(item.content || '').substring(0, 250);

        // Skip low-quality results
        if (!itemUrl || !title || title.length < 3) continue;
        if (itemUrl.includes('searx') || itemUrl.includes('search.')) continue;

        results.push({
          position: results.length + 1,
          url: itemUrl,
          title,
          snippet,
        });
      }

      if (results.length > 0) {
        console.log(`[AUTO-RESEARCH] SearXNG (${instance}) found ${results.length} results`);
        return results;
      }
    } catch (err) {
      console.warn(`[AUTO-RESEARCH] SearXNG ${instance} failed:`, err instanceof Error ? err.message : 'unknown');
      continue; // Try next instance
    }
  }

  console.log('[AUTO-RESEARCH] All SearXNG instances failed');
  return [];
}

// ========================================
// SEARCH ENGINE 2: DuckDuckGo Instant Answer API (JSON, reliable)
// Returns instant answers and abstract for queries
// ========================================

async function searchDDGInstant(query: string, maxResults = 5): Promise<AutoSource[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1&t=atlas_research`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) return [];

    const data = await res.json();
    const sources: AutoSource[] = [];

    // Abstract (main result)
    if (data.Abstract && data.AbstractURL) {
      sources.push({
        position: sources.length + 1,
        url: data.AbstractURL,
        title: data.Heading || 'DuckDuckGo',
        snippet: data.Abstract.substring(0, 250),
      });
    }

    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (sources.length >= maxResults) break;
        if (topic.Text && topic.FirstURL) {
          sources.push({
            position: sources.length + 1,
            url: topic.FirstURL,
            title: topic.Text.substring(0, 200),
            snippet: topic.Text.substring(0, 250),
          });
        }
      }
    }

    // Results (standard search results)
    if (data.Results) {
      for (const result of data.Results) {
        if (sources.length >= maxResults) break;
        if (result.FirstURL && result.Text) {
          sources.push({
            position: sources.length + 1,
            url: result.FirstURL,
            title: result.Text.substring(0, 200),
            snippet: result.Text.substring(0, 250),
          });
        }
      }
    }

    console.log(`[AUTO-RESEARCH] DDG Instant API found ${sources.length} results`);
    return sources;
  } catch (err) {
    console.warn('[AUTO-RESEARCH] DDG Instant API failed:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

// ========================================
// SEARCH ENGINE 3: DuckDuckGo Lite HTML (improved parser)
// ========================================

async function searchDuckDuckGoLite(query: string, maxResults = 5): Promise<AutoSource[]> {
  const encodedQuery = encodeURIComponent(query);
  const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodedQuery}&kl=es-ar`;

  try {
    const ddgRes = await fetch(ddgUrl, {
      headers: SEARCH_HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (!ddgRes.ok) return [];

    const html = await ddgRes.text();
    const sources: AutoSource[] = [];

    // DuckDuckGo Lite uses <table class="result-link"> and <td class="result-snippet">
    // Alternative: parse all <a> tags within result tables
    const resultLinks = html.match(/<a[^>]*class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
    if (resultLinks) {
      for (const linkHtml of resultLinks) {
        if (sources.length >= maxResults) break;

        const hrefMatch = linkHtml.match(/href="([^"]+)"/i);
        const titleMatch = linkHtml.match(/>([\s\S]*?)<\/a>/i);

        if (!hrefMatch || !titleMatch) continue;

        let url = hrefMatch[1];
        // DDG Lite uses relative URLs, prepend the DDG redirect prefix if needed
        if (url.startsWith('/')) {
          url = `https://duckduckgo.com${url}`;
        }
        // Skip DDG internal URLs
        if (url.includes('duckduckgo.com') || url.includes('duck.co')) continue;

        const title = cleanSnippet(titleMatch[1]).substring(0, 200);

        // Try to find snippet nearby
        const idx = html.indexOf(linkHtml);
        const nearbyHtml = html.substring(idx, idx + 3000);
        const snippetMatch = nearbyHtml.match(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/i);
        const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 250) : '';

        if (url && title && title.length > 3) {
          sources.push({ position: sources.length + 1, url, title, snippet });
        }
      }
    }

    // Fallback parser: look for standard link patterns in tables
    if (sources.length === 0) {
      // Try to parse all external links from the page
      const allLinks = html.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
      if (allLinks) {
        for (const link of allLinks) {
          if (sources.length >= maxResults) break;
          const hrefMatch = link.match(/href="(https?:\/\/[^"]+)"/i);
          const titleMatch = link.match(/>([\s\S]*?)<\/a>/i);
          if (!hrefMatch || !titleMatch) continue;

          const url = hrefMatch[1];
          if (url.includes('duckduckgo.com') || url.includes('duck.co') || url.includes('ddg.gg')) continue;

          const title = cleanSnippet(titleMatch[1]).substring(0, 200);
          if (url && title && title.length > 5) {
            sources.push({ position: sources.length + 1, url, title, snippet: '' });
          }
        }
      }
    }

    console.log(`[AUTO-RESEARCH] DDG Lite found ${sources.length} results`);
    return sources;
  } catch (err) {
    console.warn('[AUTO-RESEARCH] DDG Lite failed:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

// ========================================
// SEARCH ENGINE 4: DuckDuckGo HTML (classic parser, improved)
// ========================================

async function searchDuckDuckGo(query: string, maxResults = 5): Promise<AutoSource[]> {
  const encodedQuery = encodeURIComponent(query);
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

  try {
    const ddgRes = await fetch(ddgUrl, {
      headers: SEARCH_HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (!ddgRes.ok) return [];

    const html = await ddgRes.text();
    const sources: AutoSource[] = [];

    // Improved pattern: DDG uses <div class="result results_links results_links_deep web-result">
    // and <a class="result__a" href="//duckduckgo.com/l/?uddg=ENCODED_URL">
    const resultPattern = /<a[^>]*class="result__a"[^>]*href="(?:\/\/|https?:\/\/)duckduckgo\.com\/l\/\?uddg=([^"&]+)"/gi;
    let urlMatch;

    while ((urlMatch = resultPattern.exec(html)) !== null && sources.length < maxResults) {
      let url = urlMatch[1];
      try { url = decodeURIComponent(url); } catch {}

      if (!url || url.includes('duckduckgo.com') || url.includes('bing.com') || url.includes('microsoft.com')) continue;

      // Get the title from the same <a> tag
      const titleMatch = html.substring(urlMatch.index, urlMatch.index + 500).match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanSnippet(titleMatch[1]) : '';

      // Get the snippet
      const snippetMatch = html.substring(urlMatch.index, urlMatch.index + 2000).match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|span|div)/i);
      const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 250) : '';

      if (url && title) {
        sources.push({ position: sources.length + 1, url, title, snippet: snippet || '' });
      }
    }

    // Alternative pattern: direct URLs without DDG redirect
    if (sources.length === 0) {
      const directPattern = /<a[^>]*class="result__a"[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi;
      while ((urlMatch = directPattern.exec(html)) !== null && sources.length < maxResults) {
        const url = urlMatch[1];
        if (url.includes('duckduckgo.com')) continue;
        const titleMatch = html.substring(urlMatch.index, urlMatch.index + 500).match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
        const title = titleMatch ? cleanSnippet(titleMatch[1]) : '';
        if (url && title) {
          sources.push({ position: sources.length + 1, url, title, snippet: '' });
        }
      }
    }

    console.log(`[AUTO-RESEARCH] DDG HTML found ${sources.length} results`);
    return sources;
  } catch (err) {
    console.warn('[AUTO-RESEARCH] DDG HTML failed:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

// ========================================
// SEARCH ENGINE 5: Brave Search HTML (scraping, may fail from CF Workers)
// ========================================

async function searchBrave(query: string, maxResults = 5): Promise<AutoSource[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://search.brave.com/search?q=${encodedQuery}&source=web`;

  try {
    const res = await fetch(url, {
      headers: SEARCH_HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const html = await res.text();
    const sources: AutoSource[] = [];

    // Try multiple patterns for Brave's HTML structure
    const patterns = [
      /<div[^>]*class="[^"]*snippet[^"]*"[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<div[^>]*class="[^"]*snippet[^"]*"[^>]*>/gi,
      /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && sources.length < maxResults) {
        const resultUrl = match[1];
        const title = cleanSnippet(match[2]).substring(0, 200);
        if (resultUrl.includes('search.brave.com') || resultUrl.includes('brave.com/search') || resultUrl.includes('brave.com/ads')) continue;
        if (resultUrl && title && title.length > 3) {
          sources.push({ position: sources.length + 1, url: resultUrl, title, snippet: '' });
        }
      }
      if (sources.length > 0) break;
    }

    console.log(`[AUTO-RESEARCH] Brave Search found ${sources.length} results`);
    return sources;
  } catch (err) {
    console.warn('[AUTO-RESEARCH] Brave search failed:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

// ========================================
// SEARCH ENGINE 6: Bing Search HTML (fallback)
// ========================================

async function searchBing(query: string, maxResults = 5): Promise<AutoSource[]> {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.bing.com/search?q=${encodedQuery}&setlang=es`;

  try {
    const res = await fetch(url, {
      headers: SEARCH_HEADERS,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const html = await res.text();
    const sources: AutoSource[] = [];

    const bAlgoBlocks = html.split(/<li[^>]*class="b_algo"[^>]*>/i);

    for (let i = 1; i < bAlgoBlocks.length && sources.length < maxResults; i++) {
      const block = bAlgoBlocks[i];
      const urlMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/i);
      if (!urlMatch) continue;

      let resultUrl = urlMatch[1];
      if (resultUrl.includes('bing.com') || resultUrl.includes('microsoft.com')) continue;

      const titleMatch = block.match(/<a[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanSnippet(titleMatch[1]).substring(0, 200) : '';

      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 200) : '';

      if (resultUrl && title && title.length > 3) {
        sources.push({ position: sources.length + 1, url: resultUrl, title, snippet });
      }
    }

    console.log(`[AUTO-RESEARCH] Bing Search found ${sources.length} results`);
    return sources;
  } catch (err) {
    console.warn('[AUTO-RESEARCH] Bing search failed:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

// ========================================
// STEP: Fetch page content
// ========================================

async function fetchPageContent(url: string, timeoutMs = 5000): Promise<{ text: string; success: boolean }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es,es-419,en;q=0.5',
      },
    });

    if (!res.ok) return { text: '', success: false };

    const html = await res.text();
    const text = extractArticleText(html);
    return { text, success: text.length > 80 };
  } catch {
    return { text: '', success: false };
  }
}

// ========================================
// STEP: Wikipedia search + summary
// ========================================

async function fetchWikipedia(query: string): Promise<{ text: string; url: string } | null> {
  try {
    // Search Spanish Wikipedia first, fallback to English
    const searches = [
      `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query.trim())}&format=json&srlimit=1&utf8=1`,
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query.trim())}&format=json&srlimit=1&utf8=1`,
    ];

    let pageTitle = '';
    let snippet = '';
    let langPrefix = 'es';

    for (let si = 0; si < searches.length; si++) {
      try {
        const searchRes = await fetch(searches[si], { signal: AbortSignal.timeout(4000) });
        if (!searchRes.ok) continue;
        const searchData = await searchRes.json();
        const searchResults = searchData?.query?.search;
        if (searchResults && searchResults.length > 0) {
          pageTitle = searchResults[0].title;
          snippet = searchResults[0].snippet?.replace(/<[^>]+>/g, '') || '';
          langPrefix = si === 0 ? 'es' : 'en';
          break;
        }
      } catch {}
    }

    if (!pageTitle) return null;

    // Get article summary
    const summaryUrl = `https://${langPrefix}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`;
    try {
      const summaryRes = await fetch(summaryUrl, { signal: AbortSignal.timeout(4000) });
      if (!summaryRes.ok) {
        return {
          text: snippet.substring(0, 1500),
          url: `https://${langPrefix}.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
        };
      }

      const summaryData = await summaryRes.json();
      const extract = summaryData.extract;
      if (!extract || extract.length < 50) return null;

      return {
        text: extract.substring(0, 1500),
        url: summaryData.content_urls?.desktop?.page || `https://${langPrefix}.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
      };
    } catch {
      return {
        text: snippet.substring(0, 1500),
        url: `https://${langPrefix}.wikipedia.org/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`,
      };
    }
  } catch {
    return null;
  }
}

// ========================================
// MAIN: Perform auto-research with cascading engine fallback
// Strategy: try engines in order, stop as soon as we get results
// ========================================

export async function performAutoResearch(message: string): Promise<AutoResearchResult> {
  if (!needsAutoResearch(message)) {
    return { needed: false, sources: [], contextBlock: '' };
  }

  const trimmed = message.trim();

  console.log('[AUTO-RESEARCH] Starting cascading search for:', trimmed.substring(0, 60));

  // ---- PHASE 1: Run all fast engines in parallel ----
  const [searxngResults, ddgInstantResults, ddgLiteResults, wikiResult] = await Promise.all([
    searchSearXNG(trimmed, 5),
    searchDDGInstant(trimmed, 5),
    searchDuckDuckGoLite(trimmed, 5),
    fetchWikipedia(trimmed),
  ]);

  // ---- PHASE 2: If no results from fast engines, try slow ones ----
  let ddgHtmlResults: AutoSource[] = [];
  let braveResults: AutoSource[] = [];
  let bingResults: AutoSource[] = [];

  const fastTotal = searxngResults.length + ddgInstantResults.length + ddgLiteResults.length;

  if (fastTotal === 0) {
    console.log('[AUTO-RESEARCH] Fast engines returned 0 results, trying slow fallbacks...');
    [ddgHtmlResults, braveResults, bingResults] = await Promise.all([
      searchDuckDuckGo(trimmed, 5),
      searchBrave(trimmed, 5),
      searchBing(trimmed, 5),
    ]);
  }

  // ---- PHASE 3: Merge all results, deduplicate by domain ----
  const seenDomains = new Set<string>();
  const mergedSources: AutoSource[] = [];

  function addSources(sources: AutoSource[]) {
    for (const src of sources) {
      try {
        const domain = new URL(src.url).hostname.replace(/^www\./, '');
        if (seenDomains.has(domain)) continue;
        seenDomains.add(domain);
        mergedSources.push(src);
      } catch {
        // Invalid URL, skip
      }
    }
  }

  // Priority order: SearXNG > DDG Instant > DDG Lite > DDG HTML > Brave > Bing
  addSources(searxngResults);
  addSources(ddgInstantResults);
  addSources(ddgLiteResults);
  addSources(ddgHtmlResults);
  addSources(braveResults);
  addSources(bingResults);

  console.log(`[AUTO-RESEARCH] Merged ${mergedSources.length} unique sources (SearXNG:${searxngResults.length} DDG-Instant:${ddgInstantResults.length} DDG-Lite:${ddgLiteResults.length} DDG-HTML:${ddgHtmlResults.length} Brave:${braveResults.length} Bing:${bingResults.length})`);

  // ---- PHASE 4: Fetch content from top 2 merged sources in parallel (max 2 sources to avoid saturation) ----
  const topSources = mergedSources.slice(0, 2);
  const fetchResults = await Promise.all(
    topSources.map(async (src) => {
      const { text, success } = await fetchPageContent(src.url);
      return { ...src, content: text, contentFetched: success };
    })
  );

  // ---- PHASE 5: Build context block for LLM ----
  const parts: string[] = [];
  const allSources: AutoSource[] = [];

  // Wikipedia source (highest quality for factual topics)
  if (wikiResult) {
    parts.push(`FUENTE [W]: ${wikiResult.text}\n  URL: ${wikiResult.url}`);
    allSources.push({
      position: 0,
      url: wikiResult.url,
      title: 'Wikipedia',
      snippet: wikiResult.text.substring(0, 150),
    });
  }

  // Web sources with fetched content
  let sourceIndex = 1;
  for (const src of fetchResults) {
    if (src.contentFetched) {
      parts.push(`FUENTE [${sourceIndex}]: ${src.title}\n  URL: ${src.url}\n  ${src.content}`);
      allSources.push({
        position: sourceIndex,
        url: src.url,
        title: src.title,
        snippet: src.snippet || src.content.substring(0, 150),
      });
      sourceIndex++;
    }
  }

  // NO additional sources — max 2 precise sources to avoid saturation

  if (parts.length === 0) {
    console.log('[AUTO-RESEARCH] No sources found from any engine');
    return { needed: false, sources: [], contextBlock: '' };
  }

  const contextBlock = `[FUENTES DE INVESTIGACION — USA ESTAS FUENTES COMO BASE PARA TU RESPUESTA]
Las siguientes fuentes fueron encontradas mediante busqueda web para responder la pregunta del usuario.
REGLAS CRITICAS:
1. USA la informacion de estas fuentes como base PRINCIPAL para tu respuesta.
2. Cita las fuentes usando [W] para Wikipedia o [1], [2] para web.
3. Si la informacion de las fuentes contradice tu conocimiento propio, PRIORIZA las fuentes.
4. NUNCA inventes datos. Si las fuentes no cubren algo, di que no tienes esa informacion exacta.
5. Al final de tu respuesta, incluye UNA SOLA linea: "Fuente: [W](url) Wikipedia" o "Fuentes: [1](url) titulo, [2](url) titulo" — MAXIMO 2 fuentes.
6. Responde en espanol, con formato de vinetas y negritas como siempre.
7. NO repitas fuentes que ya citaste en respuestas anteriores del mismo chat.
8. Solo cita la fuente MAS RELEVANTE de donde extrajiste cada dato. No copies la misma fuente varias veces.
9. Manten tu respuesta CORTA y directa. Las fuentes son para verificar, no para alargar la respuesta.

${parts.join('\n\n---\n')}

FIN DE FUENTES.`;

  return {
    needed: true,
    sources: allSources,
    contextBlock,
  };
}
