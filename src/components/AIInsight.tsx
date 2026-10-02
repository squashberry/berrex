import { Icon } from '../lib/icons';
import type { MarketPair } from '../types';
import { GlassPanel } from './GlassPanel';

function toneFor(pair: MarketPair) {
  if (pair.bias === 'bullish') return { label: 'Constructive', className: 'bullish' };
  if (pair.bias === 'bearish') return { label: 'Cautious', className: 'bearish' };
  return { label: 'Mixed', className: 'neutral' };
}

export function AIInsight({ pair, onOpen }: { pair: MarketPair; onOpen: () => void }) {
  const tone = toneFor(pair);
  return (
    <GlassPanel className="ai-card">
      <div className="section-kicker">
        <span className="spark-icon"><Icon name="spark" size={16} /></span>
        AI MARKET VIEW
      </div>
      <div className="ai-headline">
        <div>
          <h3>{pair.symbol} looks <span className={tone.className}>{tone.label.toLowerCase()}</span></h3>
          <p>
            Price momentum is leaning {pair.bias}. BerreX is seeing a {pair.bias === 'neutral' ? 'mixed' : pair.bias}
            {' '}short-term structure from the current preview data.
          </p>
        </div>
        <span className={`signal-orb ${tone.className}`}></span>
      </div>
      <div className="indicator-row">
        <div><span>RSI</span><strong>{pair.bias === 'bullish' ? '62' : pair.bias === 'bearish' ? '44' : '53'}</strong></div>
        <div><span>MACD</span><strong>{pair.bias === 'bearish' ? 'Soft' : 'Positive'}</strong></div>
        <div><span>Trend</span><strong>{tone.label}</strong></div>
      </div>
      <button className="text-button" onClick={onOpen}>View analysis <Icon name="chevron" size={15} /></button>
    </GlassPanel>
  );
}
