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

export function bollinger(values: number[], period = 20, multiplier = 2) {
  const middle = sma(values, period);
  return values.map((_, index) => {
    if (index + 1 < period) return { upper: null, middle: middle[index], lower: null };
    const slice = values.slice(index + 1 - period, index + 1);
    const mean = slice.reduce((sum, value) => sum + value, 0) / period;
    const variance = slice.reduce((sum, value) => sum + (value - mean) ** 2, 0) / period;
    const deviation = Math.sqrt(variance) * multiplier;
    return { upper: mean + deviation, middle: mean, lower: mean - deviation };
  });
}

export function atr(candles: Candle[], period = 14) {
  if (candles.length <= period) return candles.length ? Math.abs(candles.at(-1)!.high - candles.at(-1)!.low) : 0;
  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    const previous = candles[index - 1].close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous), Math.abs(candle.low - previous));
  });
  let value = ranges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < ranges.length; i += 1) value = ((value * (period - 1)) + ranges[i]) / period;
  return value;
}

export function stochastic(candles: Candle[], period = 14) {
  if (candles.length < period) return 50;
  const slice = candles.slice(-period);
  const high = Math.max(...slice.map(c => c.high));
  const low = Math.min(...slice.map(c => c.low));
  return high === low ? 50 : ((candles.at(-1)!.close - low) / (high - low)) * 100;
}

export function adx(candles: Candle[], period = 14) {
  if (candles.length <= period + 1) return 0;
  let trSum = 0;
  let plusSum = 0;
  let minusSum = 0;
  for (let i = candles.length - period; i < candles.length; i += 1) {
    const current = candles[i];
    const previous = candles[i - 1];
    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;
    const tr = Math.max(current.high - current.low, Math.abs(current.high - previous.close), Math.abs(current.low - previous.close));
    trSum += tr;
    plusSum += upMove > downMove && upMove > 0 ? upMove : 0;
    minusSum += downMove > upMove && downMove > 0 ? downMove : 0;
  }
  if (!trSum) return 0;
  const plus = 100 * plusSum / trSum;
  const minus = 100 * minusSum / trSum;
  const denominator = plus + minus;
  return denominator ? 100 * Math.abs(plus - minus) / denominator : 0;
}

export function vwap(candles: Candle[]) {
  let cumulativeVolume = 0;
  let cumulativePriceVolume = 0;
  return candles.map((candle) => {
    const typical = (candle.high + candle.low + candle.close) / 3;
    const proxyVolume = Math.max(candle.high - candle.low, 0.0000001);
    cumulativeVolume += proxyVolume;
    cumulativePriceVolume += typical * proxyVolume;
    return cumulativePriceVolume / cumulativeVolume;
  });
}
