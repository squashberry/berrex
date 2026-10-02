import type { MarketPair, NewsItem } from '../types';

export const INITIAL_MARKETS: MarketPair[] = [
  { symbol: 'EUR/USD', base: 'EUR', quote: 'USD', price: 1.17482, change24h: 0.24, bias: 'bullish', sparkline: [1.1712,1.1721,1.1718,1.1730,1.1726,1.1740,1.1734,1.1749,1.1742,1.1748] },
  { symbol: 'GBP/USD', base: 'GBP', quote: 'USD', price: 1.34621, change24h: -0.18, bias: 'neutral', sparkline: [1.3488,1.3484,1.3476,1.3481,1.3469,1.3472,1.3459,1.3467,1.3458,1.3462] },
  { symbol: 'USD/JPY', base: 'USD', quote: 'JPY', price: 147.82, change24h: 0.31, bias: 'bullish', sparkline: [146.9,147.2,147.1,147.5,147.3,147.6,147.8,147.7,147.9,147.8] },
  { symbol: 'AUD/USD', base: 'AUD', quote: 'USD', price: 0.65842, change24h: 0.09, bias: 'bullish', sparkline: [0.6568,0.6571,0.6570,0.6577,0.6574,0.6580,0.6578,0.6586,0.6581,0.6584] },
  { symbol: 'USD/CAD', base: 'USD', quote: 'CAD', price: 1.38120, change24h: -0.12, bias: 'bearish', sparkline: [1.3838,1.3831,1.3826,1.3830,1.3824,1.3818,1.3820,1.3814,1.3816,1.3812] },
  { symbol: 'XAU/USD', base: 'XAU', quote: 'USD', price: 3825.60, change24h: 0.71, bias: 'bullish', sparkline: [3796,3801,3808,3804,3813,3818,3811,3820,3823,3825] },
];

export const NEWS: NewsItem[] = [
  { title: 'U.S. labor data keeps rate-cut expectations in focus', source: 'BerreX Macro Desk', time: '18 min', impact: 'High', currency: 'USD' },
  { title: 'Euro area inflation preview: what markets are watching', source: 'Global Wire', time: '44 min', impact: 'Medium', currency: 'EUR' },
  { title: 'BoJ commentary keeps yen volatility elevated', source: 'Market Brief', time: '1 h', impact: 'Medium', currency: 'JPY' },
  { title: 'Gold tracks softer dollar ahead of U.S. data', source: 'Commodities Desk', time: '2 h', impact: 'Low', currency: 'XAU' },
];

export const DEFAULT_SELECTED = INITIAL_MARKETS[0].symbol;
