// ========================================
// AUTO-RESEARCH — Investigación automática antes de responder
// Previene alucinaciones: busca web, lee páginas, inyecta fuentes en contexto
// 100% GRATIS — usa Brave Search HTML + Bing HTML + DuckDuckGo HTML + Wikipedia Search API
// Fallback chain: Brave -> Bing -> DuckDuckGo -> Wikipedia
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
// SEARCH ENGINE 1: Brave Search HTML (most reliable from edge)
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

    // Brave search results are in <div class="snippet ..."> with <a> inside
    // Pattern: <div class="snippet"><a href="URL">TITLE</a>...description...</div>
    // Also: <div class="result-header"><a href="URL">TITLE</a></div>
    const resultPattern = /<div[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    let parsed = 0;

    while ((match = resultPattern.exec(html)) !== null && parsed < maxResults) {
      let resultUrl = match[1];
      const titleRaw = match[2];

      // Skip Brave internal URLs
      if (resultUrl.includes('search.brave.com') || resultUrl.includes('brave.com/search')) continue;
      if (resultUrl.includes('account.brave.com') || resultUrl.includes('brave.com/ads')) continue;

      const title = cleanSnippet(titleRaw).substring(0, 200);

      // Try to extract snippet from nearby content
      const blockStart = match.index;
      const blockHtml = html.substring(blockStart, blockStart + 2000);
      const snippetMatch = blockHtml.match(/<div[^>]*class="[^"]*(?:snippet-description|result-description|description)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 200) : '';

      if (resultUrl && title && title.length > 3) {
        sources.push({
          position: sources.length + 1,
          url: resultUrl,
          title,
          snippet,
        });
        parsed++;
      }
    }

    // Alternative parsing: look for structured result divs
    if (sources.length === 0) {
      // Try div id="search" approach
      const divPattern = /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*class="[^"]*[^"]*"[^>]*>([\s\S]*?)<\/a>\s*<\/div>/gi;
      while ((match = divPattern.exec(html)) !== null && sources.length < maxResults) {
        let resultUrl = match[1];
        const title = cleanSnippet(match[2]).substring(0, 200);
        if (resultUrl.includes('search.brave.com') || resultUrl.includes('brave.com/')) continue;
        if (resultUrl && title && title.length > 5) {
          sources.push({ position: sources.length + 1, url: resultUrl, title, snippet: '' });
        }
      }
    }

    console.log(`[AUTO-RESEARCH] Brave Search found ${sources.length} results`);
    return sources;
  } catch (err) {
    console.warn('[AUTO-RESEARCH] Brave search failed:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

// ========================================
// SEARCH ENGINE 2: Bing Search HTML (fallback)
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

    // Bing results are in <li class="b_algo"> blocks
    // <a href="URL">TITLE</a>
    // <div class="b_caption"><p>DESCRIPTION</p></div>
    const bAlgoBlocks = html.split(/<li[^>]*class="b_algo"[^>]*>/i);

    for (let i = 1; i < bAlgoBlocks.length && sources.length < maxResults; i++) {
      const block = bAlgoBlocks[i];

      // Extract URL from first <a> tag with href
      const urlMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>/i);
      if (!urlMatch) continue;

      let resultUrl = urlMatch[1];
      // Skip Bing internal URLs
      if (resultUrl.includes('bing.com') || resultUrl.includes('microsoft.com')) continue;

      // Extract title from same <a> tag
      const titleMatch = block.match(/<a[^>]*href="[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanSnippet(titleMatch[1]).substring(0, 200) : '';

      // Extract snippet/description
      const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 200) : '';

      if (resultUrl && title && title.length > 3) {
        sources.push({
          position: sources.length + 1,
          url: resultUrl,
          title,
          snippet,
        });
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
// SEARCH ENGINE 3: DuckDuckGo HTML (last resort)
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

    const resultBlocks = html.split(/<div class="result results_links[\s\S]*?web-result\s*"/i);

    for (let i = 1; i < resultBlocks.length && sources.length < maxResults; i++) {
      const block = resultBlocks[i];

      const urlMatch = block.match(/class="result__a"[^>]*href="(?:\/\/|https?:\/\/)duckduckgo\.com\/l\/\?uddg=([^"&]+)/i);
      if (!urlMatch) continue;

      let url = urlMatch[1];
      try { url = decodeURIComponent(url); } catch {}

      if (!url || url.includes('duckduckgo.com') || url.includes('bing.com') || url.includes('microsoft.com')) continue;

      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
      const title = titleMatch ? cleanSnippet(titleMatch[1]) : '';

      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
      const snippet = snippetMatch ? cleanSnippet(snippetMatch[1]).substring(0, 200) : '';

      if (url && title) {
        sources.push({
          position: sources.length + 1,
          url,
          title,
          snippet,
        });
      }
    }

    console.log(`[AUTO-RESEARCH] DuckDuckGo found ${sources.length} results`);
    return sources;
  } catch (err) {
    console.warn('[AUTO-RESEARCH] DuckDuckGo search failed:', err instanceof Error ? err.message : 'unknown');
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
// MAIN: Perform auto-research with multi-engine fallback
// Returns context block + sources for injection into LLM prompt
// ========================================

export async function performAutoResearch(message: string): Promise<AutoResearchResult> {
  if (!needsAutoResearch(message)) {
    return { needed: false, sources: [], contextBlock: '' };
  }

  const trimmed = message.trim();

  // Run all search engines AND Wikipedia in parallel (race for speed)
  console.log('[AUTO-RESEARCH] Starting multi-engine search for:', trimmed.substring(0, 60));

  const [braveSources, bingSources, ddgSources, wikiResult] = await Promise.all([
    searchBrave(trimmed, 5),
    searchBing(trimmed, 5),
    searchDuckDuckGo(trimmed, 5),
    fetchWikipedia(trimmed),
  ]);

  // Merge results: prefer Brave > Bing > DDG, deduplicate by URL domain
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

  addSources(braveSources);
  addSources(bingSources);
  addSources(ddgSources);

  console.log(`[AUTO-RESEARCH] Merged ${mergedSources.length} unique sources (Brave:${braveSources.length} Bing:${bingSources.length} DDG:${ddgSources.length})`);

  // Fetch content from top 3 merged sources in parallel
  const topSources = mergedSources.slice(0, 3);
  const fetchResults = await Promise.all(
    topSources.map(async (src) => {
      const { text, success } = await fetchPageContent(src.url);
      return { ...src, content: text, contentFetched: success };
    })
  );

  // Build context block for LLM
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

  // Add remaining merged sources as URL-only references
  for (const src of mergedSources.slice(3)) {
    parts.push(`FUENTE [${sourceIndex}]: ${src.title}\n  URL: ${src.url}\n  Resumen: ${src.snippet}`);
    allSources.push({
      position: sourceIndex,
      url: src.url,
      title: src.title,
      snippet: src.snippet,
    });
    sourceIndex++;
  }

  if (parts.length === 0) {
    console.log('[AUTO-RESEARCH] No sources found from any engine');
    return { needed: false, sources: [], contextBlock: '' };
  }

  const contextBlock = `[FUENTES DE INVESTIGACION — USA ESTAS FUENTES COMO BASE PARA TU RESPUESTA]
Las siguientes fuentes fueron encontradas mediante busqueda web para responder la pregunta del usuario.
REGLAS CRITICAS:
1. USA la informacion de estas fuentes como base PRINCIPAL para tu respuesta.
2. Cita las fuentes usando [W] para Wikipedia o [1], [2], [3] para web.
3. Si la informacion de las fuentes contradice tu conocimiento propio, PRIORIZA las fuentes.
4. NUNCA inventes datos. Si las fuentes no cubren algo, di que no tienes esa informacion exacta.
5. Al final de tu respuesta, incluye una linea con "Fuentes: [W] Wikipedia, [1] titulo, [2] titulo..."
6. Responde en espanol, con formato de vinetas y negritas como siempre.
7. Incluye los enlaces reales de las fuentes en tu respuesta final como hipervinculos.

${parts.join('\n\n---\n')}

FIN DE FUENTES.`;

  return {
    needed: true,
    sources: allSources,
    contextBlock,
  };
}
