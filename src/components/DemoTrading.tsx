import { useEffect, useMemo, useState } from 'react';
import { GlassPanel } from './GlassPanel';
import { MarketSparkline } from './MarketSparkline';
import { Icon } from '../lib/icons';
import type { MarketPair } from '../types';

type DemoSide = 'buy' | 'sell';

type DemoPosition = {
  id: string;
  symbol: string;
  side: DemoSide;
  units: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: number;
};

type DemoTrade = {
  id: string;
  symbol: string;
  side: DemoSide;
  units: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  openedAt: number;
  closedAt: number;
};

const START_BALANCE = 10000;
const STORAGE_KEY = 'berrex-demo-account-v1';

function priceDigits(symbol: string) {
  return symbol === 'USD/JPY' || symbol === 'XAU/USD' ? 2 : 5;
}

function formatPrice(pair: MarketPair) {
  return pair.price.toFixed(priceDigits(pair.symbol));
}

export function DemoTrading({ markets, enabled, onOpenPair }: { markets: MarketPair[]; enabled: boolean; onOpenPair: (symbol: string) => void }) {
  const [balance, setBalance] = useState(START_BALANCE);
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [history, setHistory] = useState<DemoTrade[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(markets[0]?.symbol ?? 'EUR/USD');
  const [side, setSide] = useState<DemoSide>('buy');
  const [units, setUnits] = useState('1000');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as { balance?: number; positions?: DemoPosition[]; history?: DemoTrade[] } | null;
      if (!saved) return;
      if (Number.isFinite(saved.balance)) setBalance(Number(saved.balance));
      if (Array.isArray(saved.positions)) setPositions(saved.positions);
      if (Array.isArray(saved.history)) setHistory(saved.history);
    } catch {
      // Ignore malformed local demo data and start fresh.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ balance, positions, history: history.slice(-40) }));
  }, [balance, positions, history]);

  const selected = markets.find((pair) => pair.symbol === selectedSymbol) ?? markets[0];

  const markPrice = (position: DemoPosition) => markets.find((pair) => pair.symbol === position.symbol)?.price ?? position.entryPrice;

  const unrealized = useMemo(
    () => positions.reduce((sum, position) => {
      const current = markPrice(position);
      return sum + (position.side === 'buy' ? current - position.entryPrice : position.entryPrice - current) * position.units;
    }, 0),
    [markets, positions]
  );

  const equity = balance + unrealized;
  const openNotional = positions.reduce((sum, position) => sum + markPrice(position) * position.units, 0);
  const selectedPnl = selected ? positions
    .filter((position) => position.symbol === selected.symbol)
    .reduce((sum, position) => {
      const current = selected.price;
      return sum + (position.side === 'buy' ? current - position.entryPrice : position.entryPrice - current) * position.units;
    }, 0) : 0;

  useEffect(() => {
    if (!positions.length) return;
    const toClose: Array<{ position: DemoPosition; exitPrice: number; pnl: number }> = [];
    for (const position of positions) {
      const current = markPrice(position);
      const hitStop = position.stopLoss !== undefined && (position.side === 'buy' ? current <= position.stopLoss : current >= position.stopLoss);
      const hitTarget = position.takeProfit !== undefined && (position.side === 'buy' ? current >= position.takeProfit : current <= position.takeProfit);
      if (hitStop || hitTarget) {
        const pnl = (position.side === 'buy' ? current - position.entryPrice : position.entryPrice - current) * position.units;
        toClose.push({ position, exitPrice: current, pnl });
      }
    }
    if (!toClose.length) return;
    setPositions((current) => current.filter((position) => !toClose.some((closed) => closed.position.id === position.id)));
    setBalance((current) => current + toClose.reduce((sum, item) => sum + item.pnl, 0));
    setHistory((current) => [...current, ...toClose.map(({ position, exitPrice, pnl }) => ({
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      units: position.units,
      entryPrice: position.entryPrice,
      exitPrice,
      pnl,
      openedAt: position.openedAt,
      closedAt: Date.now(),
    }))].slice(-40));
    setNotice(`${toClose.length} demo position${toClose.length === 1 ? '' : 's'} closed by a risk level.`);
  }, [markets]);

  const openDemoPosition = () => {
    if (!selected || !enabled) return;
    const quantity = Number(units);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setNotice('Enter a valid unit size.');
      return;
    }
    const stop = stopLoss ? Number(stopLoss) : undefined;
    const target = takeProfit ? Number(takeProfit) : undefined;
    if (stop !== undefined && (!Number.isFinite(stop) || stop <= 0)) {
      setNotice('Stop loss must be a valid price.');
      return;
    }
    if (target !== undefined && (!Number.isFinite(target) || target <= 0)) {
      setNotice('Take profit must be a valid price.');
      return;
    }

    const orderNotional = selected.price * quantity;
    if (orderNotional > Math.max(50000, equity * 10)) {
      setNotice('That demo order is larger than the simulator risk limit.');
      return;
    }

    const next: DemoPosition = {
      id: crypto.randomUUID(),
      symbol: selected.symbol,
      side,
      units: quantity,
      entryPrice: selected.price,
      stopLoss: stop,
      takeProfit: target,
      openedAt: Date.now(),
    };
    setPositions((current) => [next, ...current]);
    setNotice(`${side === 'buy' ? 'Bought' : 'Sold'} ${quantity.toLocaleString()} ${selected.symbol} at ${formatPrice(selected)}.`);
  };

  const closePosition = (position: DemoPosition) => {
    const currentPrice = markPrice(position);
    const pnl = (position.side === 'buy' ? currentPrice - position.entryPrice : position.entryPrice - currentPrice) * position.units;
    setPositions((current) => current.filter((item) => item.id !== position.id));
    setBalance((current) => current + pnl);
    setHistory((current) => [...current, {
      id: position.id,
      symbol: position.symbol,
      side: position.side,
      units: position.units,
      entryPrice: position.entryPrice,
      exitPrice: currentPrice,
      pnl,
      openedAt: position.openedAt,
      closedAt: Date.now(),
    }].slice(-40));
    setNotice(`Closed ${position.symbol} for ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USD.`);
  };

  const resetDemo = () => {
    setBalance(START_BALANCE);
    setPositions([]);
    setHistory([]);
    setNotice('Demo account reset to $10,000.');
  };

  if (!enabled) {
    return (
      <div className="utility-page">
        <div className="page-header"><span className="eyebrow">DEMO TRADING</span><h1>Demo is off.</h1><p className="subtle">Turn demo trading back on from Settings when you want to practice with virtual money.</p></div>
        <GlassPanel className="utility-empty">
          <div className="utility-icon"><Icon name="chart" size={22} /></div>
          <strong>Practice without real money</strong>
          <p>When enabled, BerreX uses the same market prices shown around the app to simulate entries, positions and profit/loss locally on this device.</p>
        </GlassPanel>
      </div>
    );
  }

  return (
    <div className="utility-page demo-page">
      <div className="page-header demo-page-header">
        <div>
          <span className="eyebrow">PAPER TRADING</span>
          <h1>Demo account</h1>
          <p className="subtle">Practice with the same BerreX prices without risking real money.</p>
        </div>
        <button className="secondary-button demo-reset-top" onClick={resetDemo}><Icon name="refresh" size={15} /> Reset</button>
      </div>

      <GlassPanel className="demo-account-hero">
        <div className="demo-account-hero-top">
          <div>
            <span className="demo-account-label">DEMO ACCOUNT</span>
            <strong className="demo-account-equity">${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            <span className={unrealized >= 0 ? 'demo-account-pnl positive' : 'demo-account-pnl negative'}>
              {unrealized >= 0 ? '+' : ''}${unrealized.toFixed(2)} open P/L
            </span>
          </div>
          <span className="demo-status-pill"><span className="live-dot" /> SIMULATED</span>
        </div>
        <div className="demo-account-stats">
          <div><span>Balance</span><strong>${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
          <div><span>Open P/L</span><strong className={unrealized >= 0 ? 'positive' : 'negative'}>{unrealized >= 0 ? '+' : ''}${unrealized.toFixed(2)}</strong></div>
          <div><span>Exposure</span><strong>${openNotional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></div>
          <div><span>Positions</span><strong>{positions.length}</strong></div>
        </div>
      </GlassPanel>

      <div className="demo-live-banner">
        <span><span className="live-dot" /> {markets.some((pair) => pair.timestamp) ? 'Market feed connected' : 'Using current BerreX feed'}</span>
        <button onClick={() => selected && onOpenPair(selected.symbol)}>Open chart <Icon name="arrow" size={14} /></button>
      </div>

      <GlassPanel className="demo-ticket">
        <div className="demo-ticket-header">
          <div><span className="eyebrow">NEW ORDER</span><h2>Open a position</h2><p>Choose a market, side and risk levels.</p></div>
          <span className="demo-mode-pill">PAPER</span>
        </div>

        <div className="demo-pair-picker">{markets.map((pair) => (
          <button key={pair.symbol} className={selected?.symbol === pair.symbol ? 'active' : ''} onClick={() => setSelectedSymbol(pair.symbol)}>
            <span>{pair.symbol}</span>
            <strong>{formatPrice(pair)}</strong>
            <small className={pair.change24h >= 0 ? 'positive' : 'negative'}>{pair.change24h >= 0 ? '+' : ''}{pair.change24h.toFixed(2)}%</small>
          </button>
        ))}</div>

        {selected && <div className="demo-market-quote">
          <div className="demo-market-quote-main">
            <div><span>{selected.symbol}</span><strong>{formatPrice(selected)}</strong><small>{selected.base} / {selected.quote}</small></div>
            <MarketSparkline points={selected.sparkline} positive={selected.change24h >= 0} />
          </div>
          <div className="demo-bidask">
            <div><span>Bid</span><strong>{selected.bid?.toFixed(priceDigits(selected.symbol)) ?? formatPrice(selected)}</strong></div>
            <div><span>Ask</span><strong>{selected.ask?.toFixed(priceDigits(selected.symbol)) ?? formatPrice(selected)}</strong></div>
            <div><span>24h</span><strong className={selected.change24h >= 0 ? 'positive' : 'negative'}>{selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}%</strong></div>
          </div>
        </div>}

        <div className="demo-side-toggle">
          <button className={side === 'buy' ? 'buy active' : 'buy'} onClick={() => setSide('buy')}><span>BUY / LONG</span><small>Open with rising price</small></button>
          <button className={side === 'sell' ? 'sell active' : 'sell'} onClick={() => setSide('sell')}><span>SELL / SHORT</span><small>Open with falling price</small></button>
        </div>

        <div className="demo-field-grid">
          <label><span>Units</span><input inputMode="numeric" value={units} onChange={(e) => setUnits(e.target.value)} /></label>
          <label><span>Stop loss</span><input inputMode="decimal" value={stopLoss} onChange={(e) => setStopLoss(e.target.value)} placeholder={selected ? formatPrice(selected) : 'Price'} /></label>
          <label><span>Take profit</span><input inputMode="decimal" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value)} placeholder={selected ? formatPrice(selected) : 'Price'} /></label>
        </div>

        <button className={side === 'buy' ? 'demo-execute buy' : 'demo-execute sell'} onClick={openDemoPosition}>
          <span>{side === 'buy' ? 'Open Buy / Long' : 'Open Sell / Short'}</span>
          <strong>{selected ? formatPrice(selected) : '—'}</strong>
        </button>
        <p className="demo-note"><Icon name="shield" size={13} /> Simulated only. No broker order is created, and the balance has no cash value.</p>
      </GlassPanel>

      <section className="utility-section">
        <div className="utility-section-head"><div><span className="eyebrow">OPEN POSITIONS</span><h2>What you have running</h2></div><span className="muted-small">{positions.length} active</span></div>
        {positions.length ? <div className="demo-position-list">{positions.map((position) => {
          const current = markPrice(position);
          const pnl = (position.side === 'buy' ? current - position.entryPrice : position.entryPrice - current) * position.units;
          const pair = markets.find((item) => item.symbol === position.symbol);
          const displayPrice = pair ? formatPrice(pair) : current.toFixed(priceDigits(position.symbol));
          return <article className="demo-position-row" key={position.id}>
            <button className="demo-position-main" onClick={() => onOpenPair(position.symbol)}>
              <div className="demo-position-head"><span>{position.symbol}</span><b className={position.side === 'buy' ? 'position-long' : 'position-short'}>{position.side === 'buy' ? 'LONG' : 'SHORT'}</b></div>
              <strong className={pnl >= 0 ? 'positive' : 'negative'}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</strong>
              <small>{position.units.toLocaleString()} units · Entry {position.entryPrice.toFixed(priceDigits(position.symbol))} · Now {displayPrice}</small>
              <small>{position.stopLoss !== undefined ? `SL ${position.stopLoss.toFixed(priceDigits(position.symbol))}` : 'No SL'} · {position.takeProfit !== undefined ? `TP ${position.takeProfit.toFixed(priceDigits(position.symbol))}` : 'No TP'}</small>
            </button>
            <button className="demo-close-button" onClick={() => closePosition(position)} aria-label={`Close ${position.symbol}`}>×</button>
          </article>;
        })}</div> : <GlassPanel className="utility-empty compact"><strong>No open positions</strong><p>Your demo account is flat. Use the order ticket above to place a simulated trade.</p></GlassPanel>}
      </section>

      <section className="utility-section">
        <div className="utility-section-head"><div><span className="eyebrow">TRADE HISTORY</span><h2>Recent activity</h2></div><button className="text-button" onClick={resetDemo}>Reset account</button></div>
        {history.length ? <div className="demo-history-list">{history.slice().reverse().slice(0, 8).map((trade) => <div className="demo-history-row" key={trade.id + trade.closedAt}>
          <span><strong>{trade.symbol}</strong><small>{trade.side === 'buy' ? 'Long' : 'Short'} · {trade.units.toLocaleString()} units · {new Date(trade.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>
          <strong className={trade.pnl >= 0 ? 'positive' : 'negative'}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</strong>
        </div>)}</div> : <GlassPanel className="utility-empty compact"><strong>No closed trades yet</strong><p>Completed demo trades will appear here with their realised P/L.</p></GlassPanel>}
      </section>
    </div>
  );
}
