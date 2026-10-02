import { useEffect, useMemo, useState } from 'react';
import type { Candle, MarketPair, Timeframe } from '../types';
import { fetchCandleSeries } from '../services/market';
import { ema, macd, previewCandles, rsi, sma } from '../lib/technical';
import { CandlestickChart } from './CandlestickChart';
import { Icon } from '../lib/icons';

type Props = {
  pair: MarketPair;
  markets: MarketPair[];
  onClose: () => void;
  onAlert: () => void;
  aiText?: string;
  aiLoading?: boolean;
};

const TIMEFRAMES: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1D'];

function strengthForMarkets(markets: MarketPair[], currency: string) {
  const samples = markets.flatMap((market) => {
    if (market.base === currency) return [market.change24h];
    if (market.quote === currency) return [-market.change24h];
    return [];
  });
  if (!samples.length) return 0;
  return samples.reduce((sum, value) => sum + value, 0) / samples.length;
}

function sessionState(hour: number, start: number, end: number) {
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function Sessions() {
  const hour = new Date().getUTCHours();
  const sessions = [
    { name: 'Sydney', range: '21–06 UTC', active: sessionState(hour, 21, 6) },
    { name: 'Tokyo', range: '00–09 UTC', active: sessionState(hour, 0, 9) },
    { name: 'London', range: '08–17 UTC', active: sessionState(hour, 8, 17) },
    { name: 'New York', range: '13–22 UTC', active: sessionState(hour, 13, 22) },
  ];
  return (
    <div className="terminal-mini-panel">
      <div className="terminal-panel-title"><span>MARKET SESSIONS</span><small>UTC reference</small></div>
      <div className="session-grid">
        {sessions.map((session) => (
          <div key={session.name} className={session.active ? 'session-item active' : 'session-item'}>
            <span className="session-dot" />
            <div><strong>{session.name}</strong><small>{session.range}</small></div>
            <b>{session.active ? 'Open' : 'Closed'}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketTerminal({ pair, markets, onClose, onAlert, aiText = '', aiLoading = false }: Props) {
  const [timeframe, setTimeframe] = useState<Timeframe>('1h');
  const [candles, setCandles] = useState<Candle[]>(() => previewCandles(pair));
  const [loading, setLoading] = useState(false);
  const [indicator, setIndicator] = useState<'sma' | 'ema' | 'rsi' | 'macd'>('sma');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCandleSeries(pair.symbol, timeframe)
      .then((result) => {
        if (!cancelled) setCandles(result.length ? result : previewCandles(pair));
      })
      .catch(() => {
        if (!cancelled) setCandles(previewCandles(pair));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pair.symbol, timeframe]);

  const closes = candles.map((candle) => candle.close);
  const smaValues = useMemo(() => sma(closes, 20), [closes]);
  const emaValues = useMemo(() => ema(closes, 9), [closes]);
  const rsiValue = useMemo(() => rsi(closes), [closes]);
  const macdValue = useMemo(() => macd(closes), [closes]);

  const currencyList = Array.from(new Set(markets.flatMap((market) => [market.base, market.quote])));
  const strength = currencyList
    .filter((currency) => currency !== 'XAU')
    .map((currency) => ({ currency, value: strengthForMarkets(markets, currency) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const last = candles[candles.length - 1];
  const precision = pair.symbol === 'USD/JPY' || pair.symbol === 'XAU/USD' ? 2 : 5;

  return (
    <div className="terminal-backdrop" onClick={onClose}>
      <section className="market-terminal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="terminal-handle" />
        <div className="terminal-header">
          <div>
            <span className="eyebrow">MARKET TERMINAL</span>
            <div className="terminal-title-row">
              <h2>{pair.symbol}</h2>
              <span className="terminal-live"><span />{loading ? 'Updating' : 'Market data'}</span>
            </div>
            <p>{pair.base} / {pair.quote} · {timeframe} candles · informational only</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="terminal-price-row">
          <div>
            <strong>{pair.price.toFixed(precision)}</strong>
            <span className={pair.change24h >= 0 ? 'positive' : 'negative'}>{pair.change24h >= 0 ? '+' : ''}{pair.change24h.toFixed(2)}%</span>
          </div>
          <button className="terminal-alert-button" onClick={onAlert}><Icon name="bell" size={16} /> Alert</button>
        </div>

        <div className="terminal-timeframes">
          {TIMEFRAMES.map((item) => <button key={item} className={item === timeframe ? 'active' : ''} onClick={() => setTimeframe(item)}>{item}</button>)}
        </div>

        <div className="terminal-chart-panel">
          <CandlestickChart candles={candles} smaValues={indicator === 'sma' ? smaValues : undefined} emaValues={indicator === 'ema' ? emaValues : undefined} />
          <div className="terminal-indicators">
            {(['sma', 'ema', 'rsi', 'macd'] as const).map((item) => <button key={item} className={indicator === item ? 'active' : ''} onClick={() => setIndicator(item)}>{item.toUpperCase()}</button>)}
          </div>
          <div className="terminal-indicator-readout">
            <div><span>RSI 14</span><strong>{rsiValue.toFixed(1)}</strong></div>
            <div><span>MACD</span><strong>{macdValue.histogram >= 0 ? '+' : ''}{macdValue.histogram.toFixed(5)}</strong></div>
            <div><span>EMA 9</span><strong>{(emaValues[emaValues.length - 1] ?? pair.price).toFixed(precision)}</strong></div>
            <div><span>Trend</span><strong>{pair.bias}</strong></div>
          </div>
        </div>

        <div className="terminal-stat-grid">
          <div><span>Open</span><strong>{last?.open.toFixed(precision) ?? '—'}</strong></div>
          <div><span>High</span><strong>{last?.high.toFixed(precision) ?? '—'}</strong></div>
          <div><span>Low</span><strong>{last?.low.toFixed(precision) ?? '—'}</strong></div>
          <div><span>Close</span><strong>{last?.close.toFixed(precision) ?? '—'}</strong></div>
        </div>

        <div className="terminal-ai-panel">
          <div className="section-kicker"><span className="spark-icon"><Icon name="spark" size={14} /></span> AI MARKET VIEW</div>
          {aiLoading ? <div className="skeleton-lines"><span /><span /><span /></div> : <p>{aiText || 'Use price structure, momentum and the macro calendar together. BerreX provides informational analysis, not financial advice.'}</p>}
        </div>

        <div className="terminal-lower-grid">
          <div className="terminal-mini-panel">
            <div className="terminal-panel-title"><span>CURRENCY STRENGTH</span><small>Derived from tracked pair changes</small></div>
            <div className="strength-list">
              {strength.map((item) => {
                const width = Math.min(100, 50 + Math.abs(item.value) * 100);
                return (
                  <div key={item.currency} className="strength-row">
                    <span>{item.currency}</span>
                    <div className="strength-track"><i style={{ width: width + '%' }} /></div>
                    <b className={item.value >= 0 ? 'positive' : 'negative'}>{item.value >= 0 ? '+' : ''}{item.value.toFixed(2)}%</b>
                  </div>
                );
              })}
            </div>
          </div>
          <Sessions />
        </div>

        <div className="terminal-actions">
          <button className="secondary-button" onClick={onClose}>Close</button>
          <button className="primary-button" onClick={onAlert}><Icon name="bell" size={15} /> Create alert</button>
        </div>
      </section>
    </div>
  );
}
