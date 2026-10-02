import type { Candle, MarketPair } from '../types';

export function sma(values: number[], period: number): Array<number | null> {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

export function ema(values: number[], period: number): Array<number | null> {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  const result: Array<number | null> = Array(values.length).fill(null);
  let previous = values[0];
  result[0] = previous;
  for (let index = 1; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    result[index] = previous;
  }
  return result;
}

export function rsi(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= period; index += 1) {
    const delta = values[index] - values[index - 1];
    gains += Math.max(0, delta);
    losses += Math.max(0, -delta);
  }
  let averageGain = gains / period;
  let averageLoss = losses / period;
  for (let index = period + 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = Math.max(0, delta);
    const loss = Math.max(0, -delta);
    averageGain = ((averageGain * (period - 1)) + gain) / period;
    averageLoss = ((averageLoss * (period - 1)) + loss) / period;
  }
  if (averageLoss === 0) return 100;
  return 100 - (100 / (1 + averageGain / averageLoss));
}

export function macd(values: number[]): { line: number; signal: number; histogram: number } {
  const fast = ema(values, 12).map((value) => value ?? values[0] ?? 0);
  const slow = ema(values, 26).map((value) => value ?? values[0] ?? 0);
  const line = fast.map((value, index) => value - slow[index]);
  const signalSeries = ema(line, 9).map((value) => value ?? 0);
  const macdLine = line[line.length - 1] ?? 0;
  const signal = signalSeries[signalSeries.length - 1] ?? 0;
  return { line: macdLine, signal, histogram: macdLine - signal };
}

export function previewCandles(pair: MarketPair, count = 64): Candle[] {
  const prices = pair.sparkline.length > 2 ? pair.sparkline : [pair.price];
  const seed = Math.round(pair.price * 1000);
  let state = seed >>> 0;
  const nextRandom = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const step = 60 * 60 * 1000;
  let close = prices[0] ?? pair.price;
  const start = Date.now() - (count - 1) * step;
  const candles: Candle[] = [];
  for (let index = 0; index < count; index += 1) {
    const anchor = prices[index % prices.length] ?? close;
    const drift = (anchor - close) * 0.36;
    const noise = (nextRandom() - 0.5) * pair.price * (pair.symbol === 'USD/JPY' || pair.symbol === 'XAU/USD' ? 0.0014 : 0.0011);
    const open = close;
    close = Math.max(0.00001, close + drift + noise);
    const high = Math.max(open, close) + Math.abs(noise) * (0.7 + nextRandom());
    const low = Math.min(open, close) - Math.abs(noise) * (0.7 + nextRandom());
    candles.push({ time: start + index * step, open, high, low, close });
  }
  const last = candles[candles.length - 1];
  candles[candles.length - 1] = { ...last, close: pair.price, high: Math.max(last.high, pair.price), low: Math.min(last.low, pair.price) };
  return candles;
}

export function aggregateCandles(candles: Candle[], bucketMs: number): Candle[] {
  if (!candles.length) return [];
  const grouped: Candle[] = [];
  let bucketStart = Math.floor(candles[0].time / bucketMs) * bucketMs;
  let current: Candle | null = null;
  for (const candle of candles) {
    const nextBucket = Math.floor(candle.time / bucketMs) * bucketMs;
    if (current && nextBucket !== bucketStart) {
      grouped.push(current);
      current = null;
      bucketStart = nextBucket;
    }
    if (!current) {
      current = { time: nextBucket, open: candle.open, high: candle.high, low: candle.low, close: candle.close };
    } else {
      current.high = Math.max(current.high, candle.high);
      current.low = Math.min(current.low, candle.low);
      current.close = candle.close;
    }
  }
  if (current) grouped.push(current);
  return grouped;
}
