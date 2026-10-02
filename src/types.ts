export type MarketBias = 'bullish' | 'neutral' | 'bearish';

export type MarketPair = {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  change24h: number;
  bias: MarketBias;
  sparkline: number[];
  dayHigh?: number;
  dayLow?: number;
  timestamp?: number;
};

export type NewsItem = {
  title: string;
  source: string;
  time: string;
  impact: 'High' | 'Medium' | 'Low';
  currency: string;
  url?: string;
  publishedDate?: string;
  text?: string;
};

export type EconomicEvent = {
  event: string;
  country: string;
  currency: string;
  date: string;
  impact: 'High' | 'Medium' | 'Low';
  actual?: string;
  estimate?: string;
  previous?: string;
};