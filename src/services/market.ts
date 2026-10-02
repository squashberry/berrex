import type { MarketPair } from '../types';

export function tickMarkets(markets: MarketPair[]): MarketPair[] {
  return markets.map((pair) => {
    const volatility = pair.symbol === 'XAU/USD' ? 0.0007 : pair.symbol === 'USD/JPY' ? 0.00025 : 0.00022;
    const drift = (Math.random() - 0.47) * volatility;
    const nextPrice = pair.price * (1 + drift);
    const nextChange = pair.change24h + drift * 100 * 0.7;
    const nextSpark = [...pair.sparkline.slice(1), nextPrice];
    return {
      ...pair,
      price: nextPrice,
      change24h: Number(nextChange.toFixed(2)),
      sparkline: nextSpark,
    };
  });
}

export function connectMarketWebSocket(onMessage: (payload: unknown) => void) {
  const url = import.meta.env.VITE_MARKET_WS_URL;
  if (!url) return () => undefined;

  const ws = new WebSocket(url);
  ws.addEventListener('message', (event) => {
    try {
      onMessage(JSON.parse(event.data));
    } catch {
      // Ignore malformed provider messages in the starter build.
    }
  });

  return () => ws.close();
}
