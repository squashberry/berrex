type Env = {
  FMP_API_KEY: string;
  TWELVE_DATA_API_KEY?: string;
  ALLOWED_ORIGIN?: string;
};

type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const TWELVE_BASE = 'https://api.twelvedata.com';

function headers(origin: string, env: Env) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  const access = allowed === '*' || origin === allowed || origin.startsWith('http://localhost:') ? origin || '*' : allowed;
  return {
    'Access-Control-Allow-Origin': access,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

function json(value: unknown, status = 200, origin = '', env: Env) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...headers(origin, env),
    },
  });
}

function aggregate(candles: Candle[], bucketMs: number): Candle[] {
  if (!candles.length) return [];
  const result: Candle[] = [];
  let bucket = Math.floor(candles[0].time / bucketMs) * bucketMs;
  let current: Candle | null = null;
  for (const candle of candles) {
    const nextBucket = Math.floor(candle.time / bucketMs) * bucketMs;
    if (current && nextBucket !== bucket) {
      result.push(current);
      current = null;
      bucket = nextBucket;
    }
    if (!current) {
      current = { time: nextBucket, open: candle.open, high: candle.high, low: candle.low, close: candle.close };
    } else {
      current.high = Math.max(current.high, candle.high);
      current.low = Math.min(current.low, candle.low);
      current.close = candle.close;
    }
  }
  if (current) result.push(current);
  return result;
}

async function cachedFetch(request: Request, cacheSeconds: number): Promise<Response> {
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const response = await fetch(request);
  if (!response.ok) return response;
  const clone = response.clone();
  const cacheResponse = new Response(clone.body, clone);
  cacheResponse.headers.set('Cache-Control', 'public, max-age=' + cacheSeconds);
  await cache.put(cacheKey, cacheResponse.clone());
  return cacheResponse;
}

async function fmp(path: string, env: Env, cacheSeconds: number) {
  const url = new URL(FMP_BASE + path);
  url.searchParams.set('apikey', env.FMP_API_KEY);
  return cachedFetch(new Request(url.toString()), cacheSeconds);
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin') || '';

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: headers(origin, env) });
  }

  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, origin, env);
  if (!env.FMP_API_KEY) return json({ error: 'FMP_API_KEY is not configured' }, 503, origin, env);

  if (url.pathname === '/health') {
    return json({ ok: true, service: 'berrex-data' }, 200, origin, env);
  }

  if (url.pathname === '/quotes') {
    const response = await fmp('/batch-forex-quotes', env, 10);
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', ...headers(origin, env) } });
  }

  if (url.pathname === '/news') {
    const response = await fmp('/news/forex-latest?page=0&limit=20', env, 120);
    const rows = await response.json() as any[];
    const mapped = rows.map((row) => ({
      title: row.title ?? 'Untitled market article',
      source: row.publisher ?? row.site ?? 'Market source',
      time: row.publishedDate ? new Date(row.publishedDate).toLocaleString([], { hour: '2-digit', minute: '2-digit' }) : 'Latest',
      impact: 'Medium',
      currency: String(row.symbol ?? 'FX').replace('/', ''),
      url: row.url,
      publishedDate: row.publishedDate,
      text: row.text ?? row.content ?? '',
    }));
    return json(mapped, 200, origin, env);
  }

  if (url.pathname === '/calendar') {
    const from = new Date();
    const to = new Date(Date.now() + 7 * 86400000);
    const iso = (value: Date) => value.toISOString().slice(0, 10);
    const response = await fmp('/economic-calendar?from=' + iso(from) + '&to=' + iso(to), env, 900);
    const rows = await response.json() as any[];
    const mapped = rows.slice(0, 40).map((row) => ({
      event: row.event ?? row.name ?? 'Economic event',
      country: row.country ?? '',
      currency: row.currency ?? '',
      date: row.date ? new Date(row.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Upcoming',
      impact: String(row.impact ?? 'Medium').toLowerCase().includes('high') ? 'High' : String(row.impact ?? '').toLowerCase().includes('low') ? 'Low' : 'Medium',
      actual: row.actual,
      estimate: row.estimate,
      previous: row.previous,
    }));
    return json(mapped, 200, origin, env);
  }

  if (url.pathname === '/candles') {
    const symbol = (url.searchParams.get('symbol') || 'EURUSD').replace('/', '').toUpperCase();
    const timeframe = url.searchParams.get('timeframe') || '1h';
    const intervalMap: Record<string, string> = {
      '1m': '1min',
      '5m': '5min',
      '15m': '5min',
      '1h': '1hour',
      '4h': '1hour',
    };

    if (timeframe === '1D') {
      const response = await fmp('/historical-price-eod/full?symbol=' + encodeURIComponent(symbol), env, 300);
      const rows = await response.json() as any[];
      const result = rows.map((row) => ({
        time: new Date(row.date ?? Date.now()).getTime(),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
      })).filter((row) => Object.values(row).every(Number.isFinite)).reverse().slice(-160);
      return json(result, 200, origin, env);
    }

    const response = await fmp('/historical-chart/' + intervalMap[timeframe], env, 60);
    const rows = await response.json() as any[];
    const result = rows.map((row) => ({
      time: new Date(row.date ?? Date.now()).getTime(),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    })).filter((row) => Object.values(row).every(Number.isFinite)).reverse();

    const final = timeframe === '15m'
      ? aggregate(result, 15 * 60 * 1000).slice(-160)
      : timeframe === '4h'
        ? aggregate(result, 4 * 60 * 60 * 1000).slice(-160)
        : result.slice(-160);

    return json(final, 200, origin, env);
  }

  if (url.pathname === '/convert' && env.TWELVE_DATA_API_KEY) {
    const symbol = url.searchParams.get('symbol') || 'EUR/USD';
    const amount = url.searchParams.get('amount') || '100';
    const endpoint = TWELVE_BASE + '/currency_conversion?symbol=' + encodeURIComponent(symbol) + '&amount=' + encodeURIComponent(amount) + '&apikey=' + encodeURIComponent(env.TWELVE_DATA_API_KEY);
    const response = await fetch(endpoint);
    const body = await response.json();
    return json(body, response.status, origin, env);
  }

  return json({ error: 'Not found' }, 404, origin, env);
}

export default {
  async fetch(request: Request, env: Env) {
    try {
      return await handle(request, env);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unexpected proxy error' }, 500, request.headers.get('Origin') || '', env);
    }
  },
};
