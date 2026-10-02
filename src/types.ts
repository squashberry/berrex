export type MarketBias = 'bullish' | 'neutral' | 'bearish';

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D';

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type PriceAlertCondition = 'above' | 'below';

export type PriceAlert = {
  symbol: string;
  condition: PriceAlertCondition;
  target: number;
  createdAt: number;
};

export type MarketPair = {
  symbol: string;
  base: string;
  quote: string;
  price: number;
  bid?: number;
  ask?: number;
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