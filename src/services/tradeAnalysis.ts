import type { MarketPair } from '../types';

export type TradeSide = 'BUY' | 'SELL';
export type TradeAction = 'TRADE_NOW' | 'WAIT';

export type TradeAnalysis = {
  symbol: string;
  action: TradeAction;
  side: TradeSide;
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  confidence: number;
  timeframe: string;
  createdAt: number;
  validUntil: number;
  source: 'Technical model' | 'AI-assisted technical model';
  live: boolean;
  reasons: string[];
  commentary?: string;
};

const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT;
const VALIDITY_MS = 10 * 60 * 1000;

function average(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

function signWithNoise(value: number, threshold: number) {
  if (Math.abs(value) <= threshold) return 0;
  return value > 0 ? 1 : -1;
}

function decimalsFor(pair: MarketPair) {
  return pair.symbol === 'USD/JPY' || pair.symbol === 'XAU/USD' ? 2 : 5;
}

function roundPrice(value: number, pair: MarketPair) {
  return Number(value.toFixed(decimalsFor(pair)));
}

function levelsFor(pair: MarketPair, side: TradeSide) {
  const price = Number.isFinite(pair.price) && pair.price > 0 ? pair.price : 0;
  const entry = side === 'BUY' ? Number(pair.ask ?? price) : Number(pair.bid ?? price);
  const points = [...pair.sparkline, price].filter((value) => Number.isFinite(value) && value > 0).slice(-12);
  const movements = points.slice(1).map((value, index) => Math.abs(value - points[index])).filter((value) => value > 0);
  const averageMove = average(movements);
  const floorRatio = pair.symbol === 'XAU/USD' ? 0.00055 : pair.symbol === 'USD/JPY' ? 0.00032 : 0.00024;
  const riskDistance = Math.max(averageMove * 2.1, price * floorRatio);
  const rewardDistance = riskDistance * 1.8;

  return {
    entry: roundPrice(entry, pair),
    stopLoss: roundPrice(side === 'BUY' ? entry - riskDistance : entry + riskDistance, pair),
    takeProfit: roundPrice(side === 'BUY' ? entry + rewardDistance : entry - rewardDistance, pair),
  };
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function isValidLevels(side: TradeSide, entry: number | null, stopLoss: number | null, takeProfit: number | null) {
  if (entry === null || stopLoss === null || takeProfit === null || entry <= 0 || stopLoss <= 0 || takeProfit <= 0) return false;
  return side === 'BUY' ? stopLoss < entry && takeProfit > entry : stopLoss > entry && takeProfit < entry;
}

function deriveTechnicalSetup(pair: MarketPair, live: boolean) {
  const prices = [...pair.sparkline, pair.price].filter((value) => Number.isFinite(value) && value > 0).slice(-12);
  const half = Math.max(2, Math.floor(prices.length / 2));
  const earlier = average(prices.slice(0, half));
  const recent = average(prices.slice(-half));
  const recentPast = prices.slice(-4, -1);
  const last = prices[prices.length - 1] ?? pair.price;
  const typicalMove = average(prices.slice(1).map((value, index) => Math.abs(value - prices[index])));
  const trendSign = signWithNoise(recent - earlier, Math.max(pair.price * 0.000015, typicalMove * 0.12));
  const momentumSign = signWithNoise(last - average(recentPast), Math.max(pair.price * 0.000008, typicalMove * 0.10));
  const biasSign = pair.bias === 'bullish' ? 1 : pair.bias === 'bearish' ? -1 : 0;
  const dailySign = signWithNoise(pair.change24h, 0.025);
  const score = trendSign * 0.35 + momentumSign * 0.30 + biasSign * 0.20 + dailySign * 0.15;
  const side: TradeSide = score >= 0 ? 'BUY' : 'SELL';
  const aligned = trendSign !== 0 && trendSign === momentumSign;
  const signalStrength = Math.max(42, Math.min(84, Math.round(50 + Math.abs(score) * 32 + (aligned ? 5 : 0))));
  const action: TradeAction = live && prices.length >= 5 && aligned && Math.abs(score) >= 0.32 ? 'TRADE_NOW' : 'WAIT';
  const levels = levelsFor(pair, side);
  const reasons = [
    trendSign === 0 ? 'The recent price path is mixed rather than clearly directional.' : `Recent price structure leans ${trendSign > 0 ? 'upward' : 'downward'}.`,
    momentumSign === 0 ? 'Short-term momentum is not decisive.' : `Latest momentum points ${momentumSign > 0 ? 'up' : 'down'}.`,
    `The pair is ${pair.change24h >= 0 ? 'up' : 'down'} ${Math.abs(pair.change24h).toFixed(2)}% over the reported 24-hour move.`,
    'Stop-loss and take-profit distances are estimated from recent price movement; they are not guaranteed levels.',
  ];
  if (!live) reasons.unshift('Live market data is not connected. Treat these levels as an illustration and do not trade this preview setup.');
  else if (action === 'WAIT') reasons.unshift('Wait for price confirmation before considering an entry.');
  else reasons.unshift('Trend and recent momentum currently agree; check spread and event risk before acting.');

  return { side, action: live ? action : 'WAIT' as TradeAction, confidence: signalStrength, levels, reasons };
}

export async function analyseTrade(pair: MarketPair, live: boolean): Promise<TradeAnalysis> {
  const createdAt = Date.now();
  const technical = deriveTechnicalSetup(pair, live);
  let side = technical.side;
  let action = technical.action;
  let entry = technical.levels.entry;
  let stopLoss = technical.levels.stopLoss;
  let takeProfit = technical.levels.takeProfit;
  let confidence = technical.confidence;
  let source: TradeAnalysis['source'] = 'Technical model';
  let commentary: string | undefined;
  const reasons = [...technical.reasons];

  // Only ask the configured model to reason over quotes from a confirmed live feed.
  // The local technical model remains available when no model endpoint is configured.
  if (live && AI_ENDPOINT) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          task: 'trade-analysis',
          responseFormat: 'json',
          instruction: 'Analyse this live FX/metal quote and recent price series. Return concise commentary and, when sufficiently supported, a directional setup with side BUY or SELL, action TRADE_NOW or WAIT, entry, stopLoss, takeProfit, confidence (0-100), and timeframe. Do not invent live prices or guarantee outcomes. Levels must be on the correct side of entry.',
          symbol: pair.symbol,
          price: pair.price,
          bid: pair.bid,
          ask: pair.ask,
          change24h: pair.change24h,
          bias: pair.bias,
          recentPrices: pair.sparkline.slice(-12),
          timestamp: pair.timestamp ?? createdAt / 1000,
        }),
      });

      if (response.ok) {
        const body = await response.json() as Record<string, unknown>;
        const data = (body.trade ?? body.analysis ?? body.setup ?? body) as Record<string, unknown>;
        commentary = [body.text, body.commentary, body.explanation].find((item) => typeof item === 'string' && item.trim()) as string | undefined;
        if (commentary) commentary = commentary.slice(0, 520);
        const rawSide = String(data.side ?? data.direction ?? '').toUpperCase();
        const modelSide: TradeSide | null = rawSide.includes('BUY') ? 'BUY' : rawSide.includes('SELL') ? 'SELL' : null;
        const modelEntry = readNumber(data.entry ?? data.entryPrice ?? data.marketPrice);
        const modelStop = readNumber(data.stopLoss ?? data.stop_loss ?? data.sl);
        const modelTarget = readNumber(data.takeProfit ?? data.take_profit ?? data.tp);

        if (modelSide) {
          side = modelSide;
          const calculated = levelsFor(pair, side);
          entry = calculated.entry;
          stopLoss = calculated.stopLoss;
          takeProfit = calculated.takeProfit;
          if (isValidLevels(modelSide, modelEntry, modelStop, modelTarget)) {
            entry = roundPrice(modelEntry as number, pair);
            stopLoss = roundPrice(modelStop as number, pair);
            takeProfit = roundPrice(modelTarget as number, pair);
          }
          if (modelSide !== technical.side) {
            action = 'WAIT';
            reasons.unshift('The model direction differs from the local price-action read; wait for confirmation.');
          }
        }

        const rawAction = String(data.action ?? data.signal ?? '').toUpperCase().replace(/[ -]/g, '_');
        if (rawAction.includes('WAIT') || rawAction.includes('NO_TRADE') || rawAction.includes('NO_SETUP')) action = 'WAIT';
        else if ((rawAction.includes('TRADE_NOW') || rawAction === 'BUY' || rawAction === 'SELL') && live && modelSide) action = modelSide === technical.side ? 'TRADE_NOW' : 'WAIT';

        const modelConfidence = readNumber(data.confidence ?? data.signalStrength);
        if (modelConfidence !== null) confidence = Math.max(1, Math.min(99, Math.round(modelConfidence)));
        if (commentary || modelSide) source = 'AI-assisted technical model';
      }
    } catch {
      // A failed optional AI endpoint must never block the on-device analysis.
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  // Keep the displayed setup internally consistent if the model supplied a different side.
  if (side !== technical.side && !(stopLoss < entry && takeProfit > entry) && !(stopLoss > entry && takeProfit < entry)) {
    const calculated = levelsFor(pair, side);
    entry = calculated.entry;
    stopLoss = calculated.stopLoss;
    takeProfit = calculated.takeProfit;
    action = 'WAIT';
  }
  if (!live) action = 'WAIT';

  const riskDistance = Math.abs(entry - stopLoss);
  const rewardDistance = Math.abs(takeProfit - entry);
  const riskReward = riskDistance > 0 ? Number((rewardDistance / riskDistance).toFixed(1)) : 1.8;

  return {
    symbol: pair.symbol,
    action,
    side,
    entry,
    stopLoss,
    takeProfit,
    riskReward,
    confidence,
    timeframe: '5–15 min',
    createdAt,
    validUntil: createdAt + VALIDITY_MS,
    source,
    live,
    reasons: reasons.slice(0, 5),
    commentary,
  };
}
