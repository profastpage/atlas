// ========================================
// CONTEXT API — Weather (Open-Meteo) + News (GNews)
// Injected into Atlas system prompt when keywords match
// ========================================

// ---- City → Coordinates mapping ----
const CITY_COORDS: Record<string, { lat: number; lon: number }> = {
  'lima':              { lat: -12.0464, lon: -77.0428 },
  'arequipa':          { lat: -16.4090, lon: -71.5375 },
  'cusco':             { lat: -13.5319, lon: -71.9675 },
  'trujillo':          { lat: -8.1110,  lon: -79.0287 },
  'bogota':            { lat: 4.7110,   lon: -74.0721 },
  'bogota':            { lat: 4.7110,   lon: -74.0721 },
  'medellin':          { lat: 6.2442,   lon: -75.5812 },
  'santiago':          { lat: -33.4489, lon: -70.6693 },
  'buenos aires':      { lat: -34.6037, lon: -58.3816 },
  'mexico':            { lat: 19.4326,  lon: -99.1332 },
  'ciudad de mexico':  { lat: 19.4326,  lon: -99.1332 },
  'quito':             { lat: -0.1807,  lon: -78.4678 },
  'guayaquil':         { lat: -2.1700,  lon: -79.9224 },
  'caracas':           { lat: 10.4806,  lon: -66.9036 },
  'la paz':            { lat: -16.4897, lon: -68.1193 },
  'montevideo':        { lat: -34.9011, lon: -56.1645 },
  'sao paulo':         { lat: -23.5505, lon: -46.6333 },
  'panama':            { lat: 8.9824,   lon: -79.5199 },
  'san jose':          { lat: 9.9281,   lon: -84.0907 },
};

const WEATHERCODES: Record<string, string> = {
  '0':  'despejado',
  '1':  'mayormente despejado',
  '2':  'parcialmente nublado',
  '3':  'nublado',
  '45': 'neblina',
  '48': 'neblina con escarcha',
  '51': 'llovizna ligera',
  '53': 'llovizna moderada',
  '55': 'llovizna intensa',
  '61': 'lluvia ligera',
  '63': 'lluvia moderada',
  '65': 'lluvia fuerte',
  '71': 'nieve ligera',
  '73': 'nieve moderada',
  '75': 'nieve fuerte',
  '80': 'chubascos ligeros',
  '81': 'chubascos moderados',
  '82': 'chubascos fuertes',
  '95': 'tormenta electrica',
  '96': 'tormenta con granizo',
  '99': 'tormenta con granizo fuerte',
};

// ---- Weather: Open-Meteo (no API key needed) ----
export async function fetchWeather(city?: string): Promise<string | null> {
  try {
    const key = (city || 'lima').toLowerCase().trim();
    const coords = CITY_COORDS[key] || CITY_COORDS['lima'];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(4000), // 4s timeout
    });
    if (!res.ok) return null;

    const data = await res.json();
    const temp = data.current_weather?.temperature;
    const code = String(data.current_weather?.weathercode ?? 0);
    const desc = WEATHERCODES[code] || 'condiciones desconocidas';

    if (temp === undefined) return null;

    const cityName = city ? city.charAt(0).toUpperCase() + city.slice(1) : 'Lima';
    return `El clima en ${cityName} es de ${temp}°C y esta ${desc}.`;
  } catch {
    return null;
  }
}

// ---- News: GNews API (requires API key) ----
export async function fetchNews(query: string): Promise<string | null> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=es&country=pe&max=3&apikey=${apiKey}`;

    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000), // 5s timeout
    });
    if (!res.ok) return null;

    const data = await res.json();
    const articles = data.articles;
    if (!articles || articles.length === 0) return null;

    const headlines = articles
      .slice(0, 3)
      .map((a: any, i: number) => `${i + 1}. ${a.title}`)
      .join(' | ');

    return headlines;
  } catch {
    return null;
  }
}

// ---- Keyword detection ----
const WEATHER_KEYWORDS = [
  'clima', 'llueve', 'lluvia', 'temperatura', 'soleado', 'frio', 'calor',
  'llover', 'paraguas', 'que hago hoy', 'plan del dia', 'salir',
  'correr', 'jogging', 'ejercicio al aire', 'que tiempo hace',
  'calles', 'trafico', 'calles mojadas',
];

const NEWS_KEYWORDS = [
  'noticias', 'actualidad', 'gobierno', 'congreso', 'presidente',
  'empresa', 'sector', 'economia', 'inflacion', 'dolar', 'tipo de cambio',
  'bolsa', 'mercado', 'startup', 'tecnologia', 'ley', 'reforma',
  'ultimas noticias', 'que pasa en', 'situacion del pais',
];

function containsKeyword(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function extractNewsQuery(text: string): string {
  const lower = text.toLowerCase();
  // Check for specific entities
  if (lower.includes('dolar') || lower.includes('tipo de cambio')) return 'dolar tipo de cambio Peru';
  if (lower.includes('inflacion')) return 'inflacion Peru';
  if (lower.includes('gobierno') || lower.includes('presidente') || lower.includes('congreso')) return 'gobierno Peru politica';
  if (lower.includes('economia') || lower.includes('bolsa') || lower.includes('mercado')) return 'economia Peru';
  if (lower.includes('tecnologia') || lower.includes('startup')) return 'tecnologia Peru startups';
  if (lower.includes('ley') || lower.includes('reforma')) return 'leyes reformas Peru';
  // Default: use the full text truncated
  return text.slice(0, 60);
}

// ---- Main: Detect context needs and fetch in parallel ----
export interface ContextResult {
  weatherContext: string | null;
  newsContext: string | null;
}

export async function enrichContext(
  userMessage: string,
  userCity?: string
): Promise<ContextResult> {
  const lower = userMessage.toLowerCase();
  const needsWeather = containsKeyword(userMessage, WEATHER_KEYWORDS);
  const needsNews = containsKeyword(userMessage, NEWS_KEYWORDS);

  if (!needsWeather && !needsNews) {
    return { weatherContext: null, newsContext: null };
  }

  const results = await Promise.all([
    needsWeather ? fetchWeather(userCity) : Promise.resolve(null),
    needsNews ? fetchNews(extractNewsQuery(userMessage)) : Promise.resolve(null),
  ]);

  return {
    weatherContext: results[0],
    newsContext: results[1],
  };
}

// ---- Build context injection string for system prompt ----
export function buildContextInjection(context: ContextResult): string {
  const parts: string[] = [];

  if (context.weatherContext) {
    parts.push(`[CONTEXTO CLIMATICO ACTUAL]\n${context.weatherContext}\nUsa esta informacion si el usuario pregunta sobre actividades al aire libre, planes del dia, o clima.`);
  }

  if (context.newsContext) {
    parts.push(`[CONTEXTO DE NOTICIAS]\nTitulares recientes: ${context.newsContext}\nUsa esto si es relevante para la respuesta del usuario. No menciones que leiste las noticias, simplemente incorpora la informacion naturalmente.`);
  }

  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : '';
}
