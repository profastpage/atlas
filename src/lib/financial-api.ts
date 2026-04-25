// ========================================
// FINANCIAL API — Atlas Real-Time Market Data
// Crypto (CoinGecko) + Gold + Stock Indices
// 100% Edge-compatible (Cloudflare Workers)
// Sin API keys, solo fetch + AbortSignal.timeout
// ========================================

// ========================================
// INTERFACES
// ========================================

export interface CryptoPrice {
  symbol: string;
  name: string;
  price: number;
  change24h: number; // porcentaje
  marketCap: number;
  url: string;
}

export interface GoldPrice {
  price: number;
  change: number; // porcentaje
  url: string;
}

export interface StockIndex {
  name: string;
  symbol: string;
  price: number;
  change: number;
  url: string;
}

// ========================================
// CONSTANTES — Mapeos y configuración
// ========================================

// CoinGecko ID → símbolo y nombre legible
const CRYPTO_MAP: Record<string, { symbol: string; name: string }> = {
  bitcoin:      { symbol: 'BTC',  name: 'Bitcoin' },
  ethereum:     { symbol: 'ETH',  name: 'Ethereum' },
  solana:       { symbol: 'SOL',  name: 'Solana' },
  binancecoin:  { symbol: 'BNB',  name: 'BNB' },
  tether:       { symbol: 'USDT', name: 'Tether' },
  ripple:       { symbol: 'XRP',  name: 'XRP' },
  cardano:      { symbol: 'ADA',  name: 'Cardano' },
  dogecoin:     { symbol: 'DOGE', name: 'Dogecoin' },
};

// Símbolo → CoinGecko ID (para filtrar por símbolo si el usuario pide solo algunos)
const SYMBOL_TO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(CRYPTO_MAP).map(([id, { symbol }]) => [symbol.toLowerCase(), id])
);

// Crypto por defecto si no se especifican símbolos
const DEFAULT_CRYPTO_IDS = Object.keys(CRYPTO_MAP).join(',');

// Índices bursátiles a consultar
const STOCK_INDICES: Array<{ name: string; symbol: string; yahooSymbol: string; url: string }> = [
  { name: 'S&P 500',    symbol: 'SPX',    yahooSymbol: '%5EGSPC', url: 'https://finance.yahoo.com/quote/%5EGSPC/' },
  { name: 'Nasdaq 100', symbol: 'NDX',    yahooSymbol: '%5ENDX',  url: 'https://finance.yahoo.com/quote/%5ENDX/' },
  { name: 'Dow Jones',  symbol: 'DJI',    yahooSymbol: '%5EDJI',  url: 'https://finance.yahoo.com/quote/%5EDJI/' },
];

// Timeout estándar para todas las llamadas externas (5 segundos)
const API_TIMEOUT = 5000;

// ========================================
// UTILIDADES
// ========================================

/** Formatea un número como precio USD con comas */
function formatPrice(price: number): string {
  return price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formatea un número grande como market cap (billones/millones) */
function formatMarketCap(cap: number): string {
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(2)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(2)}M`;
  return `$${formatPrice(cap)}`;
}

/** Formatea el cambio porcentual con signo */
function formatChange(change: number): string {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

// ========================================
// FETCH FUNCTIONS
// ========================================

// ---- 1. Criptomonedas via CoinGecko (gratuito, sin API key) ----
export async function fetchCryptoPrices(symbols?: string[]): Promise<CryptoPrice[]> {
  try {
    // Determinar qué IDs consultar
    let ids: string;

    if (symbols && symbols.length > 0) {
      // Convertir símbolos a CoinGecko IDs
      const matchedIds = symbols
        .map(s => SYMBOL_TO_ID[s.toLowerCase().trim()])
        .filter((id): id is string => !!id);

      // Si no hay coincidencias, usar todos los por defecto
      ids = matchedIds.length > 0 ? matchedIds.join(',') : DEFAULT_CRYPTO_IDS;
    } else {
      ids = DEFAULT_CRYPTO_IDS;
    }

    const url =
      `https://api.coingecko.com/api/v3/simple/price` +
      `?ids=${ids}` +
      `&vs_currencies=usd` +
      `&include_24hr_change=true` +
      `&include_market_cap=true`;

    const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT) });
    if (!res.ok) return [];

    const data = await res.json();
    if (!data || typeof data !== 'object') return [];

    // Mapear respuesta de CoinGecko a nuestra interfaz
    const results: CryptoPrice[] = [];

    for (const [coinId, coinData] of Object.entries(data)) {
      const mapping = CRYPTO_MAP[coinId];
      if (!mapping) continue;

      const raw = coinData as Record<string, number>;
      const price = raw.usd ?? 0;
      const change24h = raw.usd_24h_change ?? 0;
      const marketCap = raw.usd_market_cap ?? 0;

      results.push({
        symbol: mapping.symbol,
        name: mapping.name,
        price,
        change24h,
        marketCap,
        url: `https://www.coingecko.com/en/coins/${coinId}`,
      });
    }

    return results;
  } catch (err) {
    console.warn(
      '[FINANCIAL_API] fetchCryptoPrices falló:',
      err instanceof Error ? err.message : 'desconocido'
    );
    return [];
  }
}

// ---- 2. Precio del Oro (XAU) via CoinGecko (tether-gold) ----
export async function fetchGoldPrice(): Promise<GoldPrice | null> {
  // Intento 1: CoinGecko con tether-gold
  try {
    const url =
      `https://api.coingecko.com/api/v3/simple/price` +
      `?ids=tether-gold` +
      `&vs_currencies=usd` +
      `&include_24hr_change=true`;

    const res = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT) });
    if (res.ok) {
      const data = await res.json();
      const raw = data['tether-gold'] as Record<string, number> | undefined;

      if (raw?.usd && raw.usd > 0) {
        return {
          price: raw.usd,
          change: raw.usd_24h_change ?? 0,
          url: 'https://www.investing.com/commodities/gold',
        };
      }
    }
  } catch (err) {
    console.warn(
      '[FINANCIAL_API] CoinGecko gold falló:',
      err instanceof Error ? err.message : 'desconocido'
    );
  }

  // Intento 2: GoldAPI.io (requiere API key — si no existe, saltar)
  const goldApiKey = process.env.GOLD_API_KEY;
  if (goldApiKey) {
    try {
      const url = 'https://www.goldapi.io/api/XAU/USD';
      const res = await fetch(url, {
        signal: AbortSignal.timeout(API_TIMEOUT),
        headers: {
          'x-access-token': goldApiKey,
          'Accept': 'application/json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const price = data.price as number | undefined;
        const changePercent = data.chg_pct as number | undefined;

        if (price && price > 0) {
          return {
            price,
            change: changePercent ?? 0,
            url: 'https://www.investing.com/commodities/gold',
          };
        }
      }
    } catch (err) {
      console.warn(
        '[FINANCIAL_API] GoldAPI.io falló:',
        err instanceof Error ? err.message : 'desconocido'
      );
    }
  }

  // Ambos intentos fallaron
  return null;
}

// ---- 3. Índices bursátiles via Yahoo Finance ----
export async function fetchStockIndices(): Promise<StockIndex[]> {
  const results: StockIndex[] = [];

  // Consultar cada índice en paralelo
  const promises = STOCK_INDICES.map(async (index): Promise<StockIndex | null> => {
    try {
      const url =
        `https://query1.finance.yahoo.com/v8/finance/chart/${index.yahooSymbol}` +
        `?interval=1d&range=1d`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(API_TIMEOUT),
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!res.ok) return null;

      const data = await res.json();
      const meta = data.chart?.result?.[0]?.meta;

      if (!meta) return null;

      // Precio actual y cambio porcentual
      const price = meta.regularMarketPrice as number;
      const previousClose = meta.chartPreviousClose as number ?? meta.previousClose as number;

      if (!price || !previousClose || previousClose === 0) return null;

      const change = ((price - previousClose) / previousClose) * 100;

      return {
        name: index.name,
        symbol: index.symbol,
        price,
        change: parseFloat(change.toFixed(2)),
        url: index.url,
      };
    } catch (err) {
      console.warn(
        `[FINANCIAL_API] Yahoo Finance falló para ${index.name}:`,
        err instanceof Error ? err.message : 'desconocido'
      );
      return null;
    }
  });

  const settled = await Promise.all(promises);

  for (const result of settled) {
    if (result) results.push(result);
  }

  return results;
}

// ========================================
// DETECCIÓN DE CONSULTAS FINANCIERAS
// ========================================

/** Palabras clave que indican que el usuario pregunta sobre mercados financieros */
const FINANCIAL_KEYWORDS = [
  // Criptomonedas
  'bitcoin', 'btc', 'ethereum', 'eth', 'crypto', 'cripto', 'criptomoneda',
  'moneda digital', 'token', 'blockchain', 'solana', 'sol', 'bnb', 'xrp',
  'dogecoin', 'doge', 'cardano', 'ada', 'usdt', 'tether', 'altcoin',
  'defi', 'nft', 'stablecoin', 'binance',
  // Metales preciosos
  'oro', 'gold', 'xau', 'plata', 'silver', 'xag',
  // Bolsa e índices
  'bolsa', 'stock', 'mercado', 'sp500', 's&p', 'nasdaq', 'dow jones',
  'dji', 'índice', 'indice', 'acciones', 'shares',
  // Divisas
  'dolar', 'dólar', 'usd', 'euro', 'tipo de cambio', 'divisa',
  // Materias primas
  'petroleo', 'petróleo', 'oil', 'commodity', 'materia prima',
  // Inversión / trading
  'inversion', 'inversión', 'invertir', 'trading', 'trader',
  'profit', 'pérdida', 'perdida', 'ganancia', 'rendimiento',
  'hold', 'buy', 'sell', 'comprar', 'vender', 'hodl',
  'pumping', 'dumping', 'bear', 'bull', 'alcista', 'bajista',
  // Variación de precio
  'precio de', 'cotización', 'cotizacion', 'variación', 'variacion',
  'cayó', 'cayo', 'subió', 'subio', 'bajó', 'bajo',
  'precio actual', 'cuanto vale', 'cuánto vale',
  'está caro', 'esta caro', 'está barato', 'esta barato',
  'volumen', 'capitalización', 'capitalizacion', 'market cap',
  ' ATH ', 'all time high', 'maximo historico', 'máximo histórico',
];

/** Normaliza texto removiendo acentos para comparación flexible */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Detecta si un mensaje del usuario está preguntando sobre mercados financieros.
 * Busca palabras clave en el texto normalizado (sin acentos).
 */
export function isFinancialQuery(message: string): boolean {
  const normalized = normalize(message);

  return FINANCIAL_KEYWORDS.some(keyword => normalized.includes(normalize(keyword)));
}

// ========================================
// CONSTRUIR CONTEXTO PARA SYSTEM PROMPT
// ========================================

/**
 * Construye el bloque de contexto financiero para inyectar en el system prompt.
 * Formato Markdown con emojis y enlaces a fuentes.
 */
export function buildFinancialContext(
  crypto: CryptoPrice[],
  gold: GoldPrice | null,
  indices: StockIndex[]
): string {
  const lines: string[] = [];

  lines.push('[DATOS FINANCIEROS EN TIEMPO REAL]');
  lines.push('ESTOS DATOS SON REALES Y ACTUALES. USALOS COMO BASE UNICA.');
  lines.push('');

  // ---- Criptomonedas ----
  if (crypto.length > 0) {
    for (const coin of crypto) {
      const changeStr = formatChange(coin.change24h);
      const changeEmoji = coin.change24h >= 0 ? '🟢' : '🔴';
      const coinEmoji = coin.symbol === 'BTC' ? '🪙'
        : coin.symbol === 'ETH' ? '🟣'
        : coin.symbol === 'SOL' ? '🟠'
        : coin.symbol === 'DOGE' ? '🐕'
        : '🔷';

      lines.push(
        `${coinEmoji} **${coin.name} (${coin.symbol})**: $${formatPrice(coin.price)} USD (${changeStr})`
      );

      // Solo mostrar market cap si es significativo (> $1B)
      if (coin.marketCap >= 1e9) {
        lines.push(`   Cap. de mercado: ${formatMarketCap(coin.marketCap)}`);
      }

      lines.push(`   🔗 Fuente: [CoinGecko](${coin.url})`);
      lines.push('');
    }
  }

  // ---- Oro ----
  if (gold) {
    const changeStr = formatChange(gold.change);
    const changeEmoji = gold.change >= 0 ? '🟢' : '🔴';

    lines.push(`🥇 **Oro (XAU)**: $${formatPrice(gold.price)} USD (${changeStr})`);
    lines.push(`   🔗 [Investing.com](${gold.url})`);
    lines.push('');
  }

  // ---- Índices bursátiles ----
  if (indices.length > 0) {
    for (const idx of indices) {
      const changeStr = formatChange(idx.change);
      const changeEmoji = idx.change >= 0 ? '🟢' : '🔴';
      const indexEmoji = idx.symbol === 'SPX' ? '📊'
        : idx.symbol === 'NDX' ? '📈'
        : '📉';

      lines.push(
        `${indexEmoji} **${idx.name}**: ${formatPrice(idx.price)} (${changeStr})`
      );
      lines.push(`   🔗 [Yahoo Finance](${idx.url})`);
      lines.push('');
    }
  }

  // ---- Regla crítica para el modelo ----
  lines.push('---');
  lines.push(
    'REGLA CRITICA: Responde SOLO con estos datos reales. ' +
    'NUNCA inventes precios. ' +
    'Formatea con emojis y hipervinculos Markdown [Texto](URL). ' +
    'Si no tienes datos de un activo que el usuario pregunta, ' +
    'aclara que no tienes informacion actualizada de ese activo en particular.'
  );

  return lines.join('\n');
}

// ========================================
// FETCH TODO EN PARALELO (función de conveniencia)
// ========================================

/** Resultado consolidado de todas las fuentes financieras */
export interface FinancialData {
  crypto: CryptoPrice[];
  gold: GoldPrice | null;
  indices: StockIndex[];
  context: string;
}

/**
 * Obtiene todos los datos financieros en paralelo y construye el contexto.
 * Ideal para llamar una sola vez por request cuando se detecta una consulta financiera.
 */
export async function fetchAllFinancialData(
  cryptoSymbols?: string[]
): Promise<FinancialData> {
  const [crypto, gold, indices] = await Promise.all([
    fetchCryptoPrices(cryptoSymbols),
    fetchGoldPrice(),
    fetchStockIndices(),
  ]);

  const context = buildFinancialContext(crypto, gold, indices);

  return { crypto, gold, indices, context };
}
