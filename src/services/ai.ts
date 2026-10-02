import type { MarketPair } from '../types';

export async function requestAiInsight(pair: MarketPair): Promise<string> {
  const endpoint = import.meta.env.VITE_AI_ENDPOINT;

  if (!endpoint) {
    return `${pair.symbol} is currently showing a ${pair.bias} short-term structure. RSI, MACD and price action should be evaluated together with upcoming macro events before making a trading decision. This preview is informational and not financial advice.`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbol: pair.symbol,
      price: pair.price,
      change24h: pair.change24h,
      bias: pair.bias,
    }),
  });

  if (!response.ok) {
    throw new Error('AI endpoint unavailable');
  }

  const body = await response.json() as { text?: string };
  return body.text ?? 'No analysis was returned.';
}
