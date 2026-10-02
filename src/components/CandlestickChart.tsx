import { useMemo, useState, type CSSProperties } from 'react';
import type { Candle } from '../types';

type Props = {
  candles: Candle[];
  smaValues?: Array<number | null>;
  emaValues?: Array<number | null>;
  bollingerUpper?: Array<number | null>;
  bollingerLower?: Array<number | null>;
  vwapValues?: Array<number | null>;
  priceLevel?: number;
};

export function CandlestickChart({ candles, smaValues, emaValues, bollingerUpper, bollingerLower, vwapValues, priceLevel }: Props) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 900;
  const height = 340;
  const pad = { top: 26, right: 58, bottom: 34, left: 8 };
  const visible = candles.slice(-64);
  const visibleSma = smaValues?.slice(-64);
  const visibleEma = emaValues?.slice(-64);
  const visibleBollingerUpper = bollingerUpper?.slice(-64);
  const visibleBollingerLower = bollingerLower?.slice(-64);
  const visibleVwap = vwapValues?.slice(-64);

  const domain = useMemo(() => {
    const values = visible.flatMap((candle) => [candle.high, candle.low, ...(visibleBollingerUpper?.filter((v): v is number => v !== null) ?? []), ...(visibleBollingerLower?.filter((v): v is number => v !== null) ?? []), ...(visibleVwap?.filter((v): v is number => v !== null) ?? []), ...(priceLevel !== undefined ? [priceLevel] : [])]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || Math.max(0.0001, max * 0.001);
    return { min: min - range * 0.08, max: max + range * 0.08 };
  }, [visible]);

  const x = (index: number) => pad.left + (index / Math.max(1, visible.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + ((domain.max - value) / (domain.max - domain.min)) * (height - pad.top - pad.bottom);
  const candleWidth = Math.max(5, Math.min(12, ((width - pad.left - pad.right) / Math.max(1, visible.length)) * 0.58));

  const linePath = (values?: Array<number | null>) => {
    if (!values) return '';
    let path = '';
    values.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) return;
      path += (path ? ' L' : 'M') + ' ' + x(index).toFixed(2) + ' ' + y(value).toFixed(2);
    });
    return path;
  };

  const hovered = hoverIndex === null ? visible[visible.length - 1] : visible[hoverIndex];
  const hoveredLabel = hovered
    ? new Date(hovered.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="candle-chart-wrap">
      <div className="chart-tooltip">
        <div>
          <strong>{hovered ? hovered.close.toFixed(hovered.close > 100 ? 2 : 5) : '—'}</strong>
          <span>{hoveredLabel}</span>
        </div>
        {hovered && <span className={hovered.close >= hovered.open ? 'positive' : 'negative'}>{hovered.close >= hovered.open ? '▲' : '▼'} {Math.abs(((hovered.close - hovered.open) / hovered.open) * 100).toFixed(2)}%</span>}
      </div>
      <svg className="candle-chart" viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none" role="img" aria-label="Candlestick market chart">
        <defs>
          <linearGradient id="chart-fade" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity=".13" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((row) => {
          const yy = pad.top + (row / 3) * (height - pad.top - pad.bottom);
          return <line key={row} x1={pad.left} x2={width - pad.right} y1={yy} y2={yy} className="chart-grid-line" />;
        })}
        {visible.map((candle, index) => {
          const rising = candle.close >= candle.open;
          const bodyTop = y(Math.max(candle.open, candle.close));
          const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close)));
          const style = { '--candle-delay': index * 8 + 'ms' } as CSSProperties;
          return (
            <g key={candle.time} className="candle-item" style={style} onMouseEnter={() => setHoverIndex(index)} onMouseLeave={() => setHoverIndex(null)}>
              <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} className={rising ? 'candle-wick up' : 'candle-wick down'} />
              <rect x={x(index) - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} rx="3" className={rising ? 'candle-body up' : 'candle-body down'} />
              <rect x={x(index) - candleWidth / 2 - 4} y={pad.top} width={candleWidth + 8} height={height - pad.top - pad.bottom} className="candle-hit" />
            </g>
          );
        })}
        {visibleSma && <path d={linePath(visibleSma)} className="indicator-line sma" />}
        {visibleEma && <path d={linePath(visibleEma)} className="indicator-line ema" />}
        {visibleBollingerUpper && <path d={linePath(visibleBollingerUpper)} className="indicator-line bollinger" />}
        {visibleBollingerLower && <path d={linePath(visibleBollingerLower)} className="indicator-line bollinger" />}
        {visibleVwap && <path d={linePath(visibleVwap)} className="indicator-line vwap" />}
        {priceLevel !== undefined && <g><line x1={pad.left} x2={width - pad.right} y1={y(priceLevel)} y2={y(priceLevel)} className="price-level-line" /><text x={width - pad.right - 2} y={y(priceLevel) - 4} textAnchor="end" className="price-level-label">{priceLevel.toFixed(priceLevel > 100 ? 2 : 5)}</text></g>}
      </svg>
      <div className="chart-scale">
        <span>{visible[0] ? new Date(visible[0].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
        <span>{visible[Math.floor(visible.length / 2)] ? new Date(visible[Math.floor(visible.length / 2)].time).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}</span>
        <span>{visible[visible.length - 1] ? new Date(visible[visible.length - 1].time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</span>
      </div>
    </div>
  );
}
