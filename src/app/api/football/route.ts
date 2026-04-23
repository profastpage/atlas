export const runtime = 'edge';

// ========================================
// FOOTBALL API — Real-time football data
// Uses football-data.org (free tier: 10 req/min)
// Covers: Live scores, Standings, Fixtures, Scorers
// Leagues: Premier League, La Liga, Serie A, Bundesliga,
//           Ligue 1, Champions League, Libertadores, Liga 1 Peru, etc.
// ========================================

import { NextRequest, NextResponse } from 'next/server';

const FOOTBALL_API_BASE = 'https://api.football-data.org/v4';

// Popular team name → league code mapping
const TEAM_LEAGUES: Record<string, number> = {
  'manchester city': 2021, 'man city': 2021, 'arsenal': 2021, 'liverpool': 2021,
  'chelsea': 2021, 'manchester united': 2021, 'man utd': 2021, 'tottenham': 2021,
  'newcastle': 2021, 'aston villa': 2021, 'brighton': 2021, 'west ham': 2021,
  'real madrid': 2014, 'barcelona': 2014, 'atletico madrid': 2014, 'atletico': 2014,
  'sevilla': 2014, 'real sociedad': 2014, 'villarreal': 2014, 'betis': 2014,
  'juventus': 2019, 'inter': 2019, 'internazionale': 2019, 'milan': 2019, 'ac milan': 2019,
  'napoli': 2019, 'roma': 2019, 'lazio': 2019, 'fiorentina': 2019,
  'bayern': 2002, 'bayern munich': 2002, 'borussia dortmund': 2002, 'dortmund': 2002,
  'leverkusen': 2002, 'bayer leverkusen': 2002, 'rb leipzig': 2002,
  'psg': 2015, 'paris saint-germain': 2015, 'paris sg': 2015, 'marseille': 2015,
  'lyon': 2015, 'monaco': 2015, 'lille': 2015,
  'benfica': 2017, 'porto': 2017, 'sporting': 2017, 'sporting lisbon': 2017,
  'universitario': 2028, 'alianza lima': 2028, 'sporting cristal': 2028,
  'melgar': 2028, 'cienciano': 2028,
  'flamengo': 2028, 'palmeiras': 2028, 'santos': 2028, 'sao paulo': 2028,
  'corinthians': 2028, 'gremio': 2028, 'internacional': 2028,
  'river plate': 2028, 'boca juniors': 2028, 'boca': 2028, 'river': 2028,
  'racing': 2028, 'independiente': 2028, 'san lorenzo': 2028,
  'america': 2022, 'club america': 2022, 'chivas': 2022, 'cruz azul': 2022,
  'pumas': 2022, 'tigres': 2022, 'monterrey': 2022,
};

function getApiKey(): string {
  return process.env.FOOTBALL_API_KEY || '';
}

// ========================================
// HELPER: Fetch from football-data.org
// ========================================
async function fetchFootballAPI(endpoint: string, timeoutMs = 6000): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(`${FOOTBALL_API_BASE}${endpoint}`, {
      signal: controller.signal,
      headers: {
        'X-Auth-Token': apiKey,
      },
    });

    clearTimeout(timer);

    if (res.status === 429) {
      console.warn('[FOOTBALL] Rate limited');
      return null;
    }
    if (!res.ok) return null;

    return await res.json();
  } catch (err) {
    console.warn('[FOOTBALL] Fetch error:', err instanceof Error ? err.message : 'unknown');
    return null;
  }
}

// ========================================
// DETECTORS
// ========================================

function detectLeagueFromMessage(message: string): number | null {
  const lower = message.toLowerCase();

  for (const [team, leagueCode] of Object.entries(TEAM_LEAGUES)) {
    if (lower.includes(team)) return leagueCode;
  }

  if (lower.includes('premier') || lower.includes('premier league')) return 2021;
  if (lower.includes('la liga') || lower.includes('laliga')) return 2014;
  if (lower.includes('serie a') || lower.includes('calcio')) return 2019;
  if (lower.includes('bundesliga')) return 2002;
  if (lower.includes('ligue 1')) return 2015;
  if (lower.includes('champions') || lower.includes('ucl')) return 2001;
  if (lower.includes('europa league') || lower.includes('uefa')) return 2003;
  if (lower.includes('liga 1') || lower.includes('liga peru') || lower.includes('futbol peruano')) return 2028;
  if (lower.includes('libertadores')) return 2028;
  if (lower.includes('liga mx') || lower.includes('futbol mexicano')) return 2022;
  if (lower.includes('mls')) return 2013;
  if (lower.includes('brasileirao') || lower.includes('futbol brasil')) return 2028;
  if (lower.includes('futbol argentino') || lower.includes('liga argentina') || lower.includes('liga profesional')) return 2028;

  return null;
}

type FootballAction = 'live' | 'standings' | 'fixtures' | 'scorers' | 'general';

function detectActionFromMessage(message: string): FootballAction {
  const lower = message.toLowerCase();

  if (/en vivo|live|jugando|partido ahora|marcador|resultado de hoy|resultados de hoy|goles de hoy|playing now|que marcan/.test(lower)) return 'live';
  if (/tabla|posiciones|clasificacion|standing|ranking|puesto|lider|campeon/.test(lower)) return 'standings';
  if (/fixture|calendario|proxim[oa]|siguiente|jornada|fecha|cuando juega|agenda|programacion|schedule/.test(lower)) return 'fixtures';
  if (/goleador|goleadores|artillero|top scorer|maximo goleador|bota de oro|botin/.test(lower)) return 'scorers';

  return 'general';
}

// ========================================
// FORMATTERS
// ========================================

function formatLiveMatch(match: any): string {
  const home = match.homeTeam?.shortName || match.homeTeam?.name || '?';
  const away = match.awayTeam?.shortName || match.awayTeam?.name || '?';
  const homeScore = match.score?.fullTime?.home ?? '?';
  const awayScore = match.score?.fullTime?.away ?? '?';
  const status = match.status || 'UNKNOWN';
  const minute = match.minute;
  const league = match.competition?.name || '';

  let statusText = '';
  if (status === 'IN_PLAY') statusText = minute ? `${minute}'` : 'En vivo';
  else if (status === 'PAUSED') statusText = 'Descanso';
  else if (status === 'FINISHED') statusText = 'Final';
  else if (status === 'SCHEDULED') statusText = match.utcDate ? new Date(match.utcDate).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : 'Por jugar';
  else if (status === 'POSTPONED') statusText = 'Postergado';
  else statusText = status;

  return `${home} ${homeScore}-${awayScore} ${away} [${statusText}] (${league})`;
}

function formatStandingsTable(standings: any[]): string {
  if (!standings || standings.length === 0) return '';

  const table = standings[0]?.table;
  if (!table || table.length === 0) return '';

  const lines: string[] = [];
  lines.push('Pos | Equipo                    | PJ  | G  | E  | P  | GF | GC | DG  | Pts');
  lines.push('---');

  for (const row of table.slice(0, 15)) {
    const pos = String(row.position).padStart(2);
    const team = (row.team?.shortName || row.team?.name || '?').padEnd(24);
    const pj = String(row.playedGames || 0).padStart(3);
    const g = String(row.won || 0).padStart(3);
    const e = String(row.draw || 0).padStart(3);
    const p = String(row.lost || 0).padStart(3);
    const gf = String(row.goalsFor || 0).padStart(3);
    const gc = String(row.goalsAgainst || 0).padStart(3);
    const dg = String(row.goalDifference || 0).padStart(4);
    const pts = String(row.points || 0).padStart(4);
    lines.push(`${pos}  | ${team} | ${pj} | ${g} | ${e} | ${p} | ${gf} | ${gc} | ${dg} | ${pts}`);
  }

  return lines.join('\n');
}

function formatFixture(match: any): string {
  const home = match.homeTeam?.shortName || match.homeTeam?.name || '?';
  const away = match.awayTeam?.shortName || match.awayTeam?.name || '?';
  const date = match.utcDate ? new Date(match.utcDate).toLocaleString('es-PE', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  }) : 'Por confirmar';
  const league = match.competition?.name || '';

  return `${home} vs ${away} — ${date} (${league})`;
}

function formatScorer(scorer: any): string {
  const name = scorer.player?.name || '?';
  const team = scorer.team?.shortName || scorer.team?.name || '';
  const goals = scorer.goals || 0;
  const assists = scorer.assists || 0;
  return `${name} (${team}) — ${goals} goles${assists > 0 ? `, ${assists} asist` : ''}`;
}

// ========================================
// CONTEXT PROVIDER — Called from context-api.ts
// Auto-enriches football queries with real data
// ========================================

export async function getFootballContext(message: string): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const action = detectActionFromMessage(message);
  const leagueCode = detectLeagueFromMessage(message);

  try {
    // ---- LIVE SCORES ----
    if (action === 'live') {
      const today = new Date().toISOString().split('T')[0];
      let endpoint = `/matches?dateFrom=${today}&dateTo=${today}`;
      if (leagueCode) endpoint += `&competitions=${leagueCode}`;

      const data = await fetchFootballAPI(endpoint);
      if (data?.matches?.length > 0) {
        const matches = data.matches.slice(0, 10).map(formatLiveMatch).join('\n');
        return `[PARTIDOS EN VIVO - ${new Date().toLocaleDateString('es-PE')}]\n${matches}\n\nDato en tiempo real. Responde con analisis actualizado.`;
      }
      return null;
    }

    // ---- STANDINGS ----
    if (action === 'standings' && leagueCode) {
      const data = await fetchFootballAPI(`/competitions/${leagueCode}/standings`);
      if (data?.standings) {
        const leagueName = data.competition?.name || 'Liga';
        const table = formatStandingsTable(data.standings);
        return `[POSICIONES - ${leagueName}]\n${table}\n\nUsa esta tabla para responder sobre posiciones y rendimiento.`;
      }
      return null;
    }

    // ---- FIXTURES ----
    if (action === 'fixtures') {
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      const dateFrom = today.toISOString().split('T')[0];
      const dateTo = nextWeek.toISOString().split('T')[0];

      let endpoint = `/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`;
      if (leagueCode) endpoint += `&competitions=${leagueCode}`;

      const data = await fetchFootballAPI(endpoint);
      if (data?.matches?.length > 0) {
        const fixtures = data.matches.slice(0, 12).map(formatFixture).join('\n');
        return `[PROXIMOS PARTIDOS]\n${fixtures}\n\nDato de calendario oficial.`;
      }
      return null;
    }

    // ---- TOP SCORERS ----
    if (action === 'scorers' && leagueCode) {
      const data = await fetchFootballAPI(`/competitions/${leagueCode}/scorers`);
      if (data?.scorers?.length > 0) {
        const scorersList = data.scorers.slice(0, 10).map(formatScorer).join('\n');
        const leagueName = data.competition?.name || 'Liga';
        return `[GOLEADORES - ${leagueName}]\n${scorersList}\n\nDato oficial de goleadores.`;
      }
      return null;
    }

    // ---- GENERAL: Today's matches as context ----
    const today = new Date().toISOString().split('T')[0];
    let endpoint = `/matches?dateFrom=${today}&dateTo=${today}`;
    if (leagueCode) endpoint += `&competitions=${leagueCode}`;

    const data = await fetchFootballAPI(endpoint);
    if (data?.matches?.length > 0) {
      const matches = data.matches.slice(0, 8).map(formatLiveMatch).join('\n');
      return `[PARTIDOS DE HOY - ${new Date().toLocaleDateString('es-PE')}]\n${matches}\n\nContexto actual de futbol.`;
    }

    return null;
  } catch (err) {
    console.warn('[FOOTBALL] Context error:', err);
    return null;
  }
}

// ========================================
// POST /api/football — Manual query
// ========================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, action, league } = body;

    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json({
        error: 'API de futbol no configurada. Se necesita FOOTBALL_API_KEY.',
        setup: 'Registrate gratis en football-data.org y agrega FOOTBALL_API_KEY como variable de entorno.',
      }, { status: 503 });
    }

    const searchQuery = query?.toLowerCase() || '';
    const detectedAction = (action as FootballAction) || detectActionFromMessage(searchQuery);
    const detectedLeague = (typeof league === 'number') ? league : detectLeagueFromMessage(searchQuery);

    if (detectedAction === 'live') {
      const today = new Date().toISOString().split('T')[0];
      let endpoint = `/matches?dateFrom=${today}&dateTo=${today}`;
      if (detectedLeague) endpoint += `&competitions=${detectedLeague}`;

      const data = await fetchFootballAPI(endpoint);
      if (data?.matches) {
        return NextResponse.json({
          type: 'live',
          date: today,
          live: data.matches.filter((m: any) => m.status === 'IN_PLAY' || m.status === 'PAUSED').map(formatLiveMatch),
          finished: data.matches.filter((m: any) => m.status === 'FINISHED').map(formatLiveMatch),
          scheduled: data.matches.filter((m: any) => m.status === 'SCHEDULED').map(formatLiveMatch),
          total: data.matches.length,
        });
      }
    }

    if (detectedAction === 'standings') {
      if (!detectedLeague) {
        return NextResponse.json({
          error: 'Especifica una liga.',
        });
      }
      const data = await fetchFootballAPI(`/competitions/${detectedLeague}/standings`);
      if (data?.standings) {
        return NextResponse.json({
          type: 'standings',
          league: data.competition?.name,
          table: formatStandingsTable(data.standings),
        });
      }
    }

    if (detectedAction === 'fixtures') {
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      const dateFrom = today.toISOString().split('T')[0];
      const dateTo = nextWeek.toISOString().split('T')[0];

      let endpoint = `/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`;
      if (detectedLeague) endpoint += `&competitions=${detectedLeague}`;

      const data = await fetchFootballAPI(endpoint);
      if (data?.matches) {
        return NextResponse.json({
          type: 'fixtures',
          fixtures: data.matches.slice(0, 20).map(formatFixture),
          total: data.matches.length,
        });
      }
    }

    if (detectedAction === 'scorers') {
      if (!detectedLeague) {
        return NextResponse.json({ error: 'Especifica una liga.' });
      }
      const data = await fetchFootballAPI(`/competitions/${detectedLeague}/scorers`);
      if (data?.scorers) {
        return NextResponse.json({
          type: 'scorers',
          league: data.competition?.name,
          scorers: data.scorers.slice(0, 15).map(formatScorer),
        });
      }
    }

    // Default: today's matches
    const today = new Date().toISOString().split('T')[0];
    const data = await fetchFootballAPI(`/matches?dateFrom=${today}&dateTo=${today}`);
    if (data?.matches) {
      return NextResponse.json({
        type: 'today',
        date: today,
        matches: data.matches.slice(0, 15).map(formatLiveMatch),
        total: data.matches.length,
      });
    }

    return NextResponse.json({ error: 'No se encontraron datos' }, { status: 404 });
  } catch (error) {
    console.error('[FOOTBALL] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

// ========================================
// GET /api/football — Quick access
// ========================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'today';
    const league = searchParams.get('league');

    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json({
        error: 'FOOTBALL_API_KEY no configurada',
        setup: 'Registrate gratis en football-data.org y configura FOOTBALL_API_KEY',
      }, { status: 503 });
    }

    const leagueCode = league ? parseInt(league) : null;

    if (action === 'live' || action === 'today') {
      const today = new Date().toISOString().split('T')[0];
      let endpoint = `/matches?dateFrom=${today}&dateTo=${today}`;
      if (leagueCode) endpoint += `&competitions=${leagueCode}`;

      const data = await fetchFootballAPI(endpoint);
      if (data?.matches) {
        return NextResponse.json({
          type: action,
          date: today,
          live: data.matches.filter((m: any) => m.status === 'IN_PLAY' || m.status === 'PAUSED').map(formatLiveMatch),
          finished: data.matches.filter((m: any) => m.status === 'FINISHED').map(formatLiveMatch),
          scheduled: data.matches.filter((m: any) => m.status === 'SCHEDULED').map(formatLiveMatch),
          total: data.matches.length,
        });
      }
    }

    if (action === 'standings' && leagueCode) {
      const data = await fetchFootballAPI(`/competitions/${leagueCode}/standings`);
      if (data?.standings) {
        return NextResponse.json({
          type: 'standings',
          league: data.competition?.name,
          table: formatStandingsTable(data.standings),
        });
      }
    }

    if (action === 'scorers' && leagueCode) {
      const data = await fetchFootballAPI(`/competitions/${leagueCode}/scorers`);
      if (data?.scorers) {
        return NextResponse.json({
          type: 'scorers',
          league: data.competition?.name,
          scorers: data.scorers.slice(0, 15).map(formatScorer),
        });
      }
    }

    if (action === 'fixtures') {
      const today = new Date();
      const nextWeek = new Date(today);
      nextWeek.setDate(today.getDate() + 7);
      const dateFrom = today.toISOString().split('T')[0];
      const dateTo = nextWeek.toISOString().split('T')[0];

      let endpoint = `/matches?dateFrom=${dateFrom}&dateTo=${dateTo}&status=SCHEDULED`;
      if (leagueCode) endpoint += `&competitions=${leagueCode}`;

      const data = await fetchFootballAPI(endpoint);
      if (data?.matches) {
        return NextResponse.json({
          type: 'fixtures',
          fixtures: data.matches.slice(0, 20).map(formatFixture),
          total: data.matches.length,
        });
      }
    }

    return NextResponse.json({ error: 'Accion no reconocida. Usa: live, today, standings, fixtures, scorers' }, { status: 400 });
  } catch (error) {
    console.error('[FOOTBALL] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
