// ========================================
// CINEMA API — Multi-provider movie data with caching
// Free providers: TMDb (unlimited), OMDB (1000/day), Enhanced Web Search
// Optimized for current releases + structured ratings
// Token-efficient: concise context blocks, 5-min cache
//
// Setup (free API keys — set in Cloudflare env vars):
// - TMDb: https://www.themoviedb.org/settings/api (free, unlimited)
// - OMDB: https://www.omdbapi.com/apikey.aspx (free, 1000/day)
// ========================================

import { performAutoResearch, type AutoSource } from './auto-research';

// ---- Types ----
export interface CinemaMovie {
  title: string;
  year: string;
  imdbRating?: string;
  rtRating?: string;
  tmdbRating?: string;
  metascore?: string;
  synopsis: string;
  director?: string;
  cast?: string;
  genre?: string;
  source: string;
  url?: string;
}

export interface CinemaResult {
  needed: boolean;
  contextBlock: string;
  sources: AutoSource[];
  movies: CinemaMovie[];
}

// ---- Config ----
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const OMDB_KEY = process.env.OMDB_API_KEY || '';

// Server-side cache (Edge: per-instance, short-lived)
const cinemaCache = new Map<string, { data: CinemaResult; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ========================================
// 1. INTENT DETECTION
// ========================================

type CinemaIntent = {
  type: 'now_playing' | 'popular' | 'genre' | 'search';
  query: string;
  genre?: string;
};

function detectCinemaIntent(message: string): CinemaIntent | null {
  const msg = message.trim();
  if (msg.length < 4) return null;

  const lower = msg.toLowerCase();

  // Now playing / current releases
  if (/\b(estrenos?|cartelera|ahora en cine|en cines?|que hay ahora|nuevas peliculas|peliculas nuevas|que se estrena|estreno del|proximo estreno|ultimos estrenos|que estrenos hay)\b/i.test(lower)) {
    return { type: 'now_playing', query: lower };
  }

  // Popular / trending / recommendations
  if (/\b(popular(?:es)?|tendencia|trending|recomiend\w+|que ver\b|mejores peliculas|top peliculas|las mejores|imperdib\w+|que peliculas ver|que vale la pena|peliculas imperdibles)\b/i.test(lower)) {
    return { type: 'popular', query: lower };
  }

  // Year-based queries (e.g., "peliculas 2026", "mejores 2025")
  if (/\b(peliculas?|películas?|films?|movies?)\s+(del?|de)\s*(20[0-9]{2})\b/i.test(lower)) {
    return { type: 'popular', query: lower };
  }

  // Best/worst queries
  if (/\b(mejor|peor|top)\s+(pelicula|película|film|movie)\s+(de|del)/i.test(lower)) {
    return { type: 'popular', query: lower };
  }

  // Specific genre
  const genreMatch = lower.match(/\b(peliculas?|películas?|films?|movies?)\s+(de|del)\s+(terror|accion|comedia|drama|ciencia ficcion|thriller|romance|animacion|fantasia|documental|aventura|musical|crimen|misterio|guerra|biografia|historica|western|noir|suspenso|sci-fi|ficcion)\b/i);
  if (genreMatch) {
    return { type: 'genre', query: lower, genre: genreMatch[2] };
  }

  // Specific movie (has movie-related keywords + enough context)
  if (/\b(pelicula|película|cine|film|movie|imdb|oscar(?:es)?|premio|director(?:a)?|actor|actriz|guionista|banda sonora|soundtrack|estrella|protagonista|nominad\w+|ganador)\b/i.test(lower) && msg.length > 8) {
    return { type: 'search', query: lower };
  }

  // Queries about specific movie titles (quoted or with year)
  if (/\b\d{4}\b/.test(lower) && /\b(pelicula|película|film|movie|ver|vi|viste|voy a ver|viendo|quiere ver)\b/i.test(lower)) {
    return { type: 'search', query: lower };
  }

  return null;
}

// ========================================
// 2. TMDb API (Free, comprehensive movie database)
// 50 requests/sec, unlimited daily — the gold standard
// ========================================

const TMDB_BASE = 'https://api.themoviedb.org/3';

const TMDb_GENRES: Record<number, string> = {
  28: 'Accion', 12: 'Aventura', 16: 'Animacion', 35: 'Comedia',
  80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia',
  14: 'Fantasia', 36: 'Historia', 27: 'Terror', 10402: 'Musica',
  9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia Ficcion',
  10770: 'TV Movie', 53: 'Suspenso', 10752: 'Guerra', 37: 'Western',
};

const GENRE_ID_MAP: Record<string, number> = {
  'terror': 27, 'horror': 27,
  'accion': 28, 'action': 28,
  'comedia': 35, 'comedy': 35,
  'drama': 18,
  'ciencia ficcion': 878, 'ficcion': 878, 'sci-fi': 878, 'sci fi': 878,
  'thriller': 53, 'suspenso': 53,
  'romance': 10749,
  'animacion': 16, 'animación': 16,
  'fantasia': 14, 'fantasía': 14,
  'documental': 99,
  'aventura': 12,
  'musical': 10402,
  'crimen': 80,
  'misterio': 9648,
  'guerra': 10752,
  'biografia': 18, 'histórica': 36, 'historica': 36,
  'western': 37,
  'noir': 80,
};

async function searchTMDb(intent: CinemaIntent): Promise<CinemaMovie[]> {
  if (!TMDB_KEY) {
    console.log('[CINEMA] TMDb: No API key (set TMDB_API_KEY env var)');
    return [];
  }

  try {
    let url = '';
    switch (intent.type) {
      case 'now_playing':
        url = `${TMDB_BASE}/movie/now_playing?api_key=${TMDB_KEY}&language=es-ES&region=US&page=1`;
        break;
      case 'popular':
        url = `${TMDB_BASE}/movie/popular?api_key=${TMDB_KEY}&language=es-ES&page=1`;
        break;
      case 'genre': {
        const genreId = GENRE_ID_MAP[intent.genre?.toLowerCase() || ''];
        if (!genreId) {
          // Fallback: search by genre name
          url = `${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&language=es-ES&query=${encodeURIComponent(intent.genre || intent.query)}&page=1`;
        } else {
          url = `${TMDB_BASE}/discover/movie?api_key=${TMDB_KEY}&language=es-ES&sort_by=popularity.desc&with_genres=${genreId}&page=1`;
        }
        break;
      }
      case 'search': {
        const searchQuery = extractMovieTitle(intent.query);
        if (searchQuery.length < 2) return [];
        url = `${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&language=es-ES&query=${encodeURIComponent(searchQuery)}&page=1`;
        break;
      }
    }

    if (!url) return [];

    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) {
      console.warn('[CINEMA] TMDb API error:', res.status);
      return [];
    }

    const data = await res.json();
    const results = data.results || [];

    return results.slice(0, 8).map((m: any) => ({
      title: m.title || 'Sin titulo',
      year: (m.release_date || '').substring(0, 4) || '?',
      tmdbRating: m.vote_average ? `${(m.vote_average / 2).toFixed(1)}/10` : undefined,
      synopsis: m.overview || 'Sin sinopsis disponible.',
      genre: Array.isArray(m.genre_ids)
        ? m.genre_ids.map((id: number) => TMDb_GENRES[id]).filter(Boolean).join(', ')
        : undefined,
      source: 'TMDb',
      url: `https://www.themoviedb.org/movie/${m.id}`,
    }));
  } catch (err) {
    console.warn('[CINEMA] TMDb fetch error:', err instanceof Error ? err.message : 'unknown');
    return [];
  }
}

// ========================================
// 3. OMDB API (Free, 1000/day — has IMDb + Rotten Tomatoes scores)
// Best source for individual movie ratings
// ========================================

async function searchOMDB(title: string): Promise<CinemaMovie | null> {
  if (!OMDB_KEY) {
    console.log('[CINEMA] OMDB: No API key (set OMDB_API_KEY env var)');
    return null;
  }

  try {
    const url = `https://www.omdbapi.com/?t=${encodeURIComponent(title)}&apikey=${OMDB_KEY}&plot=short&r=json`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) return null;

    const data: any = await res.json();
    if (data.Response !== 'True') return null;

    const ratings: Array<{ Source: string; Value: string }> = data.Ratings || [];
    const rtRating = ratings.find(r => r.Source === 'Rotten Tomatoes');

    return {
      title: data.Title,
      year: data.Year,
      imdbRating: data.imdbRating !== 'N/A' ? `${data.imdbRating}/10` : undefined,
      rtRating: rtRating?.Value || undefined,
      metascore: data.Metascore !== 'N/A' ? data.Metascore : undefined,
      synopsis: data.Plot !== 'N/A' ? data.Plot : '',
      director: data.Director !== 'N/A' ? data.Director : undefined,
      cast: data.Actors !== 'N/A' ? data.Actors : undefined,
      genre: data.Genre !== 'N/A' ? data.Genre : undefined,
      source: 'OMDB',
      url: `https://www.imdb.com/title/${data.imdbID}/`,
    };
  } catch (err) {
    console.warn('[CINEMA] OMDB fetch error:', err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

// ========================================
// 4. ENHANCED WEB SEARCH (fallback, always available)
// Optimized queries targeting movie databases
// ========================================

function buildCinemaSearchQuery(intent: CinemaIntent): string {
  switch (intent.type) {
    case 'now_playing':
      return 'estrenos peliculas 2026 cartelera cines actuales IMDb ratings Rotten Tomatoes';
    case 'popular':
      return 'mejores peliculas 2025 2026 IMDb top rated Rotten Tomatoes populares';
    case 'genre': {
      const cleaned = extractMovieTitle(intent.query);
      return `mejores peliculas ${intent.genre || cleaned} 2025 2026 IMDb rating recomendadas`;
    }
    case 'search': {
      const cleaned = extractMovieTitle(intent.query);
      return `${cleaned || intent.query} IMDb rating Rotten Tomatoes review pelicula`;
    }
  }
}

async function cinemaWebSearch(intent: CinemaIntent): Promise<AutoSource[]> {
  const optimizedQuery = buildCinemaSearchQuery(intent);

  try {
    const result = await Promise.race([
      performAutoResearch(optimizedQuery),
      new Promise<{ needed: false; sources: []; contextBlock: '' }>(r =>
        setTimeout(() => r({ needed: false, sources: [], contextBlock: '' }), 6000)
      ),
    ]);
    return result.sources || [];
  } catch {
    return [];
  }
}

// ========================================
// 5. BUILD CONTEXT BLOCK (token-efficient, concise)
// ========================================

function buildCinemaContext(movies: CinemaMovie[], webSources: AutoSource[]): string {
  const parts: string[] = [];

  parts.push(
    `[DATOS DE CINE EN TIEMPO REAL — BASE UNICA PARA TU RESPUESTA]
REGLAS CRITICAS:
1. Estos son datos REALES y ACTUALIZADOS. USALOS como base UNICA. No los inventes ni contradigas.
2. Sigue el FORMATO CINE del Modulo de Cine: Titulo (Ano), Puntuacion con fuente, Resumen Ejecutivo, Opinion del Publico, Enlace.
3. Cita las fuentes: (IMDb), (Rotten Tomatoes), (TMDb), o [1] [2] para web.
4. Si una pelicula no esta en esta lista, usa tu conocimiento pero indica "(dato aprox.)".
5. Manten la respuesta CORTA (max 100 palabras como siempre). El formato business NO es excusa para alargar.`
  );

  if (movies.length > 0) {
    parts.push('\n--- PELICULAS ENCONTRADAS ---');
    for (let i = 0; i < Math.min(movies.length, 8); i++) {
      const m = movies[i];
      let entry = `${i + 1}. **${m.title}** (${m.year})`;

      // Ratings (most important data)
      const ratings: string[] = [];
      if (m.imdbRating) ratings.push(`${m.imdbRating} (IMDb)`);
      if (m.rtRating) ratings.push(`${m.rtRating} (RT)`);
      if (m.tmdbRating) ratings.push(`${m.tmdbRating} (TMDb)`);
      if (m.metascore) ratings.push(`${m.metascore} (Metacritic)`);
      if (ratings.length > 0) entry += ` — ${ratings.join(', ')}`;

      if (m.genre) entry += ` — ${m.genre}`;
      if (m.director) entry += ` — Dir: ${m.director}`;
      if (m.synopsis) entry += `\n   ${m.synopsis.substring(0, 200)}`;
      if (m.url) entry += `\n   ${m.url}`;

      parts.push(entry);
    }
  }

  if (webSources.length > 0) {
    parts.push('\n--- FUENTES WEB ADICIONALES ---');
    for (let i = 0; i < Math.min(webSources.length, 3); i++) {
      const s = webSources[i];
      parts.push(`[${i + 1}] ${s.title}\n   ${s.url}\n   ${s.snippet.substring(0, 150)}`);
    }
  }

  parts.push('\nFIN DE DATOS DE CINE.');
  return parts.join('\n');
}

// ========================================
// 6. MAIN ORCHESTRATOR
// Parallel fetch from all providers, merge, cache, return
// ========================================

export async function fetchCinemaData(message: string): Promise<CinemaResult> {
  // Step 1: Detect cinema intent
  const intent = detectCinemaIntent(message);
  if (!intent) {
    return { needed: false, contextBlock: '', sources: [], movies: [] };
  }

  // Step 2: Check cache (5-min TTL)
  const cacheKey = `cinema:${intent.type}:${intent.query.substring(0, 60)}`;
  const cached = cinemaCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    console.log('[CINEMA] Cache hit:', cacheKey.substring(0, 40));
    return cached.data;
  }

  console.log(`[CINEMA] Intent: ${intent.type} | Query: ${intent.query.substring(0, 50)}`);

  // Step 3: Parallel fetch from ALL providers
  const [tmdbMovies, omdbResult, webSources] = await Promise.all([
    searchTMDb(intent),
    intent.type === 'search' && intent.query.length > 3
      ? searchOMDB(extractMovieTitle(intent.query))
      : Promise.resolve(null),
    cinemaWebSearch(intent),
  ]);

  const movies: CinemaMovie[] = [];

  // Add TMDb results (up to 8)
  if (tmdbMovies.length > 0) {
    movies.push(...tmdbMovies);
  }

  // Merge OMDB ratings into matching TMDb result or add as new
  if (omdbResult) {
    const matchIdx = movies.findIndex(m =>
      m.title.toLowerCase().includes(omdbResult.title.toLowerCase()) ||
      omdbResult.title.toLowerCase().includes(m.title.toLowerCase())
    );
    if (matchIdx >= 0) {
      // Merge: OMDB has the best ratings (IMDb + RT + Metacritic)
      movies[matchIdx].imdbRating = omdbResult.imdbRating || movies[matchIdx].imdbRating;
      movies[matchIdx].rtRating = omdbResult.rtRating || movies[matchIdx].rtRating;
      movies[matchIdx].metascore = omdbResult.metascore || movies[matchIdx].metascore;
      movies[matchIdx].director = omdbResult.director || movies[matchIdx].director;
      movies[matchIdx].cast = omdbResult.cast || movies[matchIdx].cast;
      movies[matchIdx].synopsis = omdbResult.synopsis || movies[matchIdx].synopsis;
      movies[matchIdx].url = omdbResult.url || movies[matchIdx].url;
    } else {
      movies.unshift(omdbResult); // OMDB result is authoritative for ratings
    }
  }

  // Step 4: If nothing found, return empty
  if (movies.length === 0 && webSources.length === 0) {
    console.log('[CINEMA] No results from any provider');
    return { needed: false, contextBlock: '', sources: [], movies: [] };
  }

  // Log which providers succeeded
  const providers: string[] = [];
  if (tmdbMovies.length > 0) providers.push('TMDb');
  if (omdbResult) providers.push('OMDB');
  if (webSources.length > 0) providers.push('Web');
  console.log(`[CINEMA] Success: ${movies.length} movies, ${webSources.length} web sources [${providers.join(', ')}]`);

  // Step 5: Build context block
  const result: CinemaResult = {
    needed: true,
    contextBlock: buildCinemaContext(movies, webSources),
    sources: webSources,
    movies,
  };

  // Step 6: Cache result (5-min TTL)
  cinemaCache.set(cacheKey, { data: result, ts: Date.now() });

  return result;
}

// ---- Helper: Extract meaningful movie title from query ----
function extractMovieTitle(query: string): string {
  return query
    .replace(/\b(pelicula|película|cine|film|movie|sobre|que|opinas|imdb|rating|review|ver|vi|viste|creo|buenas|mejor|peor|recomiend|estrenos|cartelera|popular|imperdible|prohibida|de|del|la|el|las|los|un|una|en|es|y|o|con|por|para|como|esta|este|esa|ese|hay|alguna|buena|mala|ahi|ahi)\b/gi, '')
    .replace(/\b\d{4}\b/g, '') // Remove year
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 100);
}
