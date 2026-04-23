// ========================================
// AUTO-RESEARCH — Investigación automática antes de responder
// Previene alucinaciones: busca web, lee páginas, inyecta fuentes en contexto
// 100% GRATIS — usa DuckDuckGo Lite + Wikipedia
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
  /\b(fisiologia|fisiologico|musculo|musculo|tendón|tendinitis|ligamento|articulacion|rotura|lesion|recuperacion|rehabilitacion|estiramiento|calentamiento|enfriamiento|flexibilidad|movilidad|vo2|frecuencia cardiaca|ritmo cardiaco|metabolismo|anabolismo|catabolismo|testosterona|cortisol|melatonina|serotonina|dopamina)\b/i,
  // Football (already in context-api but double-check here for auto-research)
  /\b(futbol|fútbol|soccer|partido|partidos|goles|gol|liga|champions|libertadores|premier|bundesliga|serie a|ligue 1|marcador|resultado|posiciones|clasificacion|goleador|transferencia|fichaje|entrenador|jugador|seleccion|mundial|balon de oro|copa america|eurocopa|convocatoria|alineacion|tactica|formacion|xG|asistencia)\b/i,
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
  // tend to be factual and benefit from research
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

// ========================================
// STEP 1: Search DuckDuckGo Lite
// ========================================

async function searchDuckDuckGo(query: string, maxResults = 5): Promise<AutoSource[]> {
  const trimmed = query.trim();

  // Enrich football queries
  const footballTerms = ['futbol', 'fútbol', 'soccer', 'partido', 'goles', 'liga', 'champions', 'libertadores', 'premier', 'la liga', 'bundesliga', 'serie a', 'messi', 'ronaldo', 'mbappe', 'haaland', 'balon de oro', 'mundial', 'seleccion', 'goleador', 'marcador', 'posiciones', 'clasificacion', 'transferencia', 'fichaje', 'convocatoria', 'tactica', 'formacion'];
  const isFootball = footballTerms.some(t => trimmed.toLowerCase().includes(t));

  // Enrich nutrition queries
  const nutritionTerms = ['nutricion', 'dieta', 'proteina', 'caloria', 'macronutriente', 'suplemento', 'creatina', 'vitamina', 'meal prep', 'alimentacion', 'hidratacion', 'ayuno intermitente', 'keto', 'whey', 'bcaa'];
  const isNutrition = nutritionTerms.some(t => trimmed.toLowerCase().includes(t));

  // Enrich physiology queries
  const physioTerms = ['fisiologia', 'musculo', 'lesion', 'recuperacion', 'rehabilitacion', 'estiramiento', 'vo2', 'metabolismo', 'testosterona', 'cortisol', 'frecuencia cardiaca', 'anabolismo', 'catabolismo', 'tendinitis', 'articulacion'];
  const isPhysio = physioTerms.some(t => trimmed.toLowerCase().includes(t));

  let enrichedQuery = trimmed;
  if (isFootball) {
    enrichedQuery = `${trimmed} (transfermarkt OR flashscore OR sofascore OR marca OR goal OR espn OR fotmob)`;
  } else if (isNutrition) {
    enrichedQuery = `${trimmed} (nutricion deportiva OR dieta deportiva OR ISSN OR academia de nutricion OR myfitnesspal OR fatsecret)`;
  } else if (isPhysio) {
    enrichedQuery = `${trimmed} (fisiologia del ejercicio OR medicina deportiva OR PubMed OR ACE fitness OR NSF)`;
  }

  const encodedQuery = encodeURIComponent(enrichedQuery);
  const ddgUrl = `https://lite.duckduckgo.com/lite/?q=${encodedQuery}`;

  try {
    const ddgRes = await fetch(ddgUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AtlasBot/1.0)',
        'Accept': 'text/html',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!ddgRes.ok) return [];

    const html = await ddgRes.text();
    const sources: AutoSource[] = [];
    const resultBlocks = html.split(/<td[^>]*class="result-snippet"[^>]*>/i);

    for (let i = 1; i < resultBlocks.length && sources.length < maxResults; i++) {
      const block = resultBlocks[i];
      const prevBlock = resultBlocks[i - 1];
      const urlMatch = prevBlock.match(/href="(https?:\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)[^"]*)"/);

      if (urlMatch) {
        let url = urlMatch[2];
        try { url = decodeURIComponent(url); } catch {}

        const titleMatch = prevBlock.match(/<a[^>]*class="result-link"[^>]*>([\s\S]*?)<\/a>/i);
        const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';

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
          });
        }
      }
    }

    return sources;
  } catch (err) {
    console.warn('[AUTO-RESEARCH] DDG search failed:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

// ========================================
// STEP 2: Fetch page content
// ========================================

async function fetchPageContent(url: string, timeoutMs = 5000): Promise<{ text: string; success: boolean }> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AtlasBot/1.0)',
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
// STEP 3: Wikipedia quick lookup
// ========================================

async function fetchWikipedia(query: string): Promise<{ text: string; url: string } | null> {
  try {
    // Search Wikipedia first to find the right article
    const searchUrl = `https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query.trim())}`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;

    const data = await res.json();
    const extract = data.extract;
    if (!extract || extract.length < 50) return null;

    return {
      text: extract.substring(0, 1500),
      url: data.content_urls?.desktop?.page || `https://es.wikipedia.org/wiki/${encodeURIComponent(query.trim())}`,
    };
  } catch {
    return null;
  }
}

// ========================================
// MAIN: Perform auto-research
// Returns context block + sources for injection into LLM prompt
// ========================================

export async function performAutoResearch(message: string): Promise<AutoResearchResult> {
  if (!needsAutoResearch(message)) {
    return { needed: false, sources: [], contextBlock: '' };
  }

  const trimmed = message.trim();

  // Run DuckDuckGo search AND Wikipedia in parallel
  const [ddgSources, wikiResult] = await Promise.all([
    searchDuckDuckGo(trimmed, 5),
    fetchWikipedia(trimmed),
  ]);

  // Fetch content from top 3 DDG sources in parallel
  const topSources = ddgSources.slice(0, 3);
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

  // Web sources
  let sourceIndex = wikiResult ? 1 : 1;
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

  // Add remaining DDG sources as URL-only references
  for (const src of ddgSources.slice(3)) {
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
6. Responde en espanol, con formato de viñetas y negritas como siempre.
7. Incluye los enlaces reales de las fuentes en tu respuesta final como hipervinculos.

${parts.join('\n\n---\n')}

FIN DE FUENTES.`;

  return {
    needed: true,
    sources: allSources,
    contextBlock,
  };
}
