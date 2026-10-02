import type { EconomicEvent, MarketPair, NewsItem } from '../types';

const FMP_BASE = 'https://financialmodelingprep.com/stable';
const FMP_KEY = import.meta.env.VITE_FMP_API_KEY as string | undefined;
const TWELVE_KEY = import.meta.env.VITE_TWELVEDATA_API_KEY as string | undefined;

function INITIAL_SYMBOLS() {
  return ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'XAUUSD'];
}

function pairFromFmp(row: any, fallback: MarketPair): MarketPair {
  const price = Number(row.price ?? fallback.price);
  const change = Number(row.changePercentage ?? row.change ?? fallback.change24h);
  const spark = [...fallback.sparkline.slice(1), price];
  return {
    ...fallback,
    price,
    change24h: Number(change.toFixed(2)),
    bias: change > 0.08 ? 'bullish' : change < -0.08 ? 'bearish' : 'neutral',
    sparkline: spark,
    dayHigh: Number(row.dayHigh ?? fallback.dayHigh ?? price),
    dayLow: Number(row.dayLow ?? fallback.dayLow ?? price),
    timestamp: Number(row.timestamp ?? Date.now() / 1000),
  };
}

export async function fetchLiveMarkets(fallback: MarketPair[]): Promise<MarketPair[]> {
  if (!FMP_KEY) return fallback;
  const response = await fetch(`${FMP_BASE}/batch-forex-quotes?apikey=${encodeURIComponent(FMP_KEY)}`);
  if (!response.ok) throw new Error(`FMP market request failed: ${response.status}`);
  const rows = await response.json() as any[];
  const bySymbol = new Map(rows.map((row) => [String(row.symbol).toUpperCase(), row]));
  return fallback.map((pair) => pairFromFmp(bySymbol.get(pair.symbol.replace('/', '')) ?? {}, pair));
}

export async function fetchLiveNews(): Promise<NewsItem[]> {
  if (!FMP_KEY) return [];
  const response = await fetch(`${FMP_BASE}/news/forex-latest?page=0&limit=20&apikey=${encodeURIComponent(FMP_KEY)}`);
  if (!response.ok) throw new Error(`FMP news request failed: ${response.status}`);
  const rows = await response.json() as any[];
  return rows.map((row) => ({
    title: row.title ?? 'Untitled market article',
    source: row.publisher ?? row.site ?? 'Market source',
    time: row.publishedDate ? new Date(row.publishedDate).toLocaleString([], { hour: '2-digit', minute: '2-digit' }) : 'Latest',
    impact: 'Medium' as const,
    currency: String(row.symbol ?? 'FX').replace('/', ''),
    url: row.url,
    publishedDate: row.publishedDate,
    text: row.text ?? row.content ?? '',
  }));
}

export async function fetchEconomicCalendar(): Promise<EconomicEvent[]> {\n  if (!FMP_KEY) return [];\n  const from = new Date();\n  const to = new Date(Date.now() + 7 * 86400000);\n  const iso = (value: Date) => value.toISOString().slice(0, 10);\n  const response = await fetch(\`\${FMP_BASE}/economic-calendar?from=\${iso(from)}&to=\${iso(to)}&apikey=\${encodeURIComponent(FMP_KEY)}\`);\n  if (!response.ok) throw new Error(\`FMP calendar request failed: \${response.status}\`);\n  const rows = await response.json() as any[];\n  return rows.slice(0, 30).map((row) => ({\n    event: row.event ?? row.name ?? 'Economic event', country: row.country ?? '', currency: row.currency ?? '',\n    date: row.date ? new Date(row.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Upcoming',\n    impact: (String(row.impact ?? 'Medium').toLowerCase().includes('high') ? 'High' : String(row.impact ?? '').toLowerCase().includes('low') ? 'Low' : 'Medium') as EconomicEvent['impact'],\n    actual: row.actual, estimate: row.estimate, previous: row.previous,\n  }));\n}\n\nexport async function fetchTwelveSeries(symbol: string): Promise<number[]> {
  if (!TWELVE_KEY) return [];
  const response = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1h&outputsize=48&apikey=${encodeURIComponent(TWELVE_KEY)}`);
  if (!response.ok) throw new Error(`Twelve Data request failed: ${response.status}`);
  const body = await response.json() as { values?: Array<{ close: string }> };
  return (body.values ?? []).map((item) => Number(item.close)).reverse();
}

export async function convertCurrency(amount: number, symbol: string): Promise<number> {
  if (!TWELVE_KEY) return amount;
  const response = await fetch(`https://api.twelvedata.com/currency_conversion?symbol=${encodeURIComponent(symbol)}&amount=${encodeURIComponent(amount)}&apikey=${encodeURIComponent(TWELVE_KEY)}`);
  if (!response.ok) throw new Error(`Conversion request failed: ${response.status}`);
  const body = await response.json() as { amount?: number; rate?: number };
  return Number(body.amount ?? amount * Number(body.rate ?? 1));
}

export function simulatedTick(markets: MarketPair[]): MarketPair[] {
  return markets.map((pair) => {
    const volatility = pair.symbol === 'XAU/USD' ? 0.0007 : pair.symbol === 'USD/JPY' ? 0.00025 : 0.00022;
    const drift = (Math.random() - 0.47) * volatility;
    const nextPrice = pair.price * (1 + drift);
    const nextChange = pair.change24h + drift * 100 * 0.7;
    return { ...pair, price: nextPrice, change24h: Number(nextChange.toFixed(2)), sparkline: [...pair.sparkline.slice(1), nextPrice] };
  });
}

export function connectMarketWebSocket(onMessage: (payload: unknown) => void) {
  const url = import.meta.env.VITE_MARKET_WS_URL;
  if (!url) return () => undefined;
  const ws = new WebSocket(url);
  ws.addEventListener('message', (event) => {
    try { onMessage(JSON.parse(event.data)); } catch { /* provider message ignored */ }
  });
  return () => ws.close();
}