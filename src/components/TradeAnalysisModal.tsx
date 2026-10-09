import { useEffect, useState } from 'react';
import type { MarketPair } from '../types';
import { Icon } from '../lib/icons';
import { analyseTrade, type TradeAnalysis } from '../services/tradeAnalysis';

type Props = {
  pair: MarketPair;
  live: boolean;
  onClose: () => void;
  onOpenPair: () => void;
};

const ANALYSIS_STEPS = [
  'Reading recent price action',
  'Checking trend and momentum',
  'Estimating risk and target levels',
];

function formatPrice(value: number, pair: MarketPair) {
  return value.toFixed(pair.symbol === 'USD/JPY' || pair.symbol === 'XAU/USD' ? 2 : 5);
}

function formatCountdown(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
}

export function TradeAnalysisModal({ pair, live, onClose, onOpenPair }: Props) {
  const [phase, setPhase] = useState<'analysing' | 'result' | 'error'>('analysing');
  const [result, setResult] = useState<TradeAnalysis | null>(null);
  const [step, setStep] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [runId, setRunId] = useState(0);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    setPhase('analysing');
    setResult(null);
    setStep(0);
    const stepTimer = window.setInterval(() => {
      setStep((current) => (current + 1) % ANALYSIS_STEPS.length);
    }, 650);

    void analyseTrade(pair, live)
      .then(async (analysis) => {
        const remainingAnimation = Math.max(0, 1250 - (Date.now() - startedAt));
        if (remainingAnimation) await new Promise((resolve) => window.setTimeout(resolve, remainingAnimation));
        if (cancelled) return;
        setResult(analysis);
        setPhase('result');
      })
      .catch(() => {
        if (cancelled) return;
        setPhase('error');
      });

    return () => {
      cancelled = true;
      window.clearInterval(stepTimer);
    };
  }, [pair.symbol, runId]);

  const remaining = result ? Math.max(0, result.validUntil - now) : 0;
  const expired = Boolean(result && remaining === 0);

  return (
    <div className="trade-analysis-backdrop" onClick={onClose}>
      <section className="trade-analysis-dialog" role="dialog" aria-modal="true" aria-labelledby="trade-analysis-title" onClick={(event) => event.stopPropagation()}>
        <div className="trade-analysis-top">
          <div className="trade-analysis-brand"><span className="trade-analysis-icon"><Icon name="spark" size={17} /></span><div><span className="eyebrow">BERREX INTELLIGENCE</span><h2 id="trade-analysis-title">Trade analysis</h2></div></div>
          <button className="icon-button" onClick={onClose} aria-label="Close trade analysis">×</button>
        </div>
        <div className="trade-analysis-pair"><div><strong>{pair.symbol}</strong><span>{pair.base} / {pair.quote}</span></div><div className="trade-analysis-current"><span>{live ? 'LIVE MARKET PRICE' : 'PREVIEW PRICE'}</span><strong>{formatPrice(pair.price, pair)}</strong></div></div>

        {phase === 'analysing' && (
          <div className="trade-analysis-loading" aria-live="polite">
            <div className="analysis-pulse"><span /><span /><span /></div>
            <h3>Analysing {pair.symbol}</h3>
            <p>{ANALYSIS_STEPS[step]}…</p>
            <div className="analysis-progress"><span style={{ width: ((step + 1) / ANALYSIS_STEPS.length * 100) + '%' }} /></div>
            <small>Reviewing available price history. No trade is being placed.</small>
          </div>
        )}

        {phase === 'error' && (
          <div className="trade-analysis-loading">
            <h3>Analysis could not finish</h3>
            <p>Try again after checking the market connection.</p>
            <button className="primary-button full" onClick={() => setRunId((value) => value + 1)}>Analyse again</button>
          </div>
        )}

        {phase === 'result' && result && (
          <>
            {!result.live && <div className="trade-analysis-warning"><Icon name="shield" size={16} /><div><strong>Live feed not connected</strong><span>This is a preview-price analysis. Wait for live quotes before considering any trade.</span></div></div>}
            <div className={expired ? 'trade-signal-card expired' : result.action === 'TRADE_NOW' ? 'trade-signal-card buy-signal' : 'trade-signal-card wait-signal'}>
              <div className="trade-signal-top"><span className="trade-signal-badge">{expired ? 'SIGNAL EXPIRED' : result.action === 'TRADE_NOW' ? 'TRADE NOW' : 'WAIT FOR CONFIRMATION'}</span><span className="trade-signal-source">{result.source === 'AI-assisted technical model' ? 'AI ASSISTED' : 'TECHNICAL MODEL'}</span></div>
              <div className="trade-signal-main"><strong className={result.side === 'BUY' ? 'positive' : 'negative'}>{result.side}</strong><span>{result.action === 'TRADE_NOW' && !expired ? 'Directional setup detected' : 'Potential setup · not a confirmed entry'}</span></div>
              <div className="trade-signal-metrics"><div><span>Signal strength</span><strong>{result.confidence}%</strong></div><div><span>Setup window</span><strong>{result.timeframe}</strong></div><div><span>Risk / reward</span><strong>1 : {result.riskReward.toFixed(1)}</strong></div></div>
            </div>

            <div className="trade-price-levels">
              <div><span>Entry / market</span><strong>{formatPrice(result.entry, pair)}</strong><small>{result.side === 'BUY' ? 'Ask-side estimate' : 'Bid-side estimate'}</small></div>
              <div className="level-stop"><span>Stop-loss (SL)</span><strong>{formatPrice(result.stopLoss, pair)}</strong><small>Risk limit estimate</small></div>
              <div className="level-target"><span>Take-profit (TP)</span><strong>{formatPrice(result.takeProfit, pair)}</strong><small>Target estimate</small></div>
            </div>

            <div className={expired ? 'trade-validity expired' : 'trade-validity'}><span className="validity-clock"><Icon name="clock" size={16} /></span><div><strong>{expired ? 'Re-analyse before using this setup' : 'Signal validity'}</strong><small>{expired ? 'This setup has passed its 10-minute validity period.' : 'Recheck price, spread and event risk before entry.'}</small></div><b>{expired ? '00:00' : formatCountdown(remaining)}</b></div>

            <div className="trade-analysis-reasons"><div className="section-kicker">WHY THIS SETUP</div>{result.reasons.map((reason, index) => <div className="trade-reason" key={index}><span>{index + 1}</span><p>{reason}</p></div>)}</div>
            {result.commentary && <div className="trade-ai-commentary"><div className="section-kicker"><Icon name="spark" size={14} /> MODEL COMMENTARY</div><p>{result.commentary}</p></div>}
            <div className="trade-analysis-disclaimer"><Icon name="shield" size={14} /> Analysis only — no orders are placed. Signal strength is not a probability of profit. SL/TP estimates can fail during volatility or slippage.</div>
            <div className="trade-analysis-actions"><button className="secondary-button" onClick={() => setRunId((value) => value + 1)}><Icon name="refresh" size={15} /> Analyse again</button><button className="primary-button" onClick={onOpenPair}>Open pair chart <Icon name="arrow" size={15} /></button></div>
          </>
        )}
      </section>
    </div>
  );
}
