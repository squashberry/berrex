export type MarketBias = 'bullish' | 'neutral' | 'bearish';

export type MarketPair = {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  change24h: number;
  bias: MarketBias;
  sparkline: number[];
};

export type NewsItem = {
  title: string;
  source: string;
  time: string;
  impact: 'High' | 'Medium' | 'Low';
  currency: string;
};
