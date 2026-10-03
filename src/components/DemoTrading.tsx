import { useEffect, useMemo, useState } from 'react';
import { GlassPanel } from './GlassPanel';
import { MarketSparkline } from './MarketSparkline';
import { Icon } from '../lib/icons';
import type { MarketPair } from '../types';

type DemoSide = 'buy' | 'sell';
type DemoOrderType = 'market' | 'limit' | 'stop';

type DemoPosition = {
  id: string;
  symbol: string;
  side: DemoSide;
  units: number;
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  openedAt: number;
  orderType: DemoOrderType;
};

type DemoPendingOrder = {
  id: string;
  symbol: string;
  side: DemoSide;
  type: 'limit' | 'stop';
  units: number;
  triggerPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  createdAt: number;
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
  orderType: DemoOrderType;
};

const START_BALANCE = 10000;
const DEFAULT_LEVERAGE = 100;
const STORAGE_KEY = 'berrex-demo-account-v1';
const LEVERAGE_OPTIONS = [10, 20, 50, 100];

function priceDigits(symbol: string) {
  return symbol === 'USD/JPY' || symbol === 'XAU/USD' ? 2 : 5;
}

function formatPriceValue(symbol: string, price: number) {
  return price.toFixed(priceDigits(symbol));
}

function formatPrice(pair: MarketPair) {
  return formatPriceValue(pair.symbol, pair.price);
}

function executablePrice(pair: MarketPair, side: DemoSide) {
  return side === 'buy' ? (pair.ask ?? pair.price) : (pair.bid ?? pair.price);
}

function markPriceForPosition(pair: MarketPair, side: DemoSide) {
  return side === 'buy' ? (pair.bid ?? pair.price) : (pair.ask ?? pair.price);
}

function normalizeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function DemoTrading({
  markets,
  enabled,
  onOpenPair,
}: {
  markets: MarketPair[];
  enabled: boolean;
  onOpenPair: (symbol: string) => void;
}) {
  const [balance, setBalance] = useState(START_BALANCE);
  const [positions, setPositions] = useState<DemoPosition[]>([]);
  const [pendingOrders, setPendingOrders] = useState<DemoPendingOrder[]>([]);
  const [history, setHistory] = useState<DemoTrade[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState(markets[0]?.symbol ?? 'EUR/USD');
  const [side, setSide] = useState<DemoSide>('buy');
  const [orderType, setOrderType] = useState<DemoOrderType>('market');
  const [units, setUnits] = useState('1000');
  const [entryPrice, setEntryPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [leverage, setLeverage] = useState(DEFAULT_LEVERAGE);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as {
        balance?: number;
        positions?: DemoPosition[];
        pendingOrders?: DemoPendingOrder[];
        history?: DemoTrade[];
        leverage?: number;
      } | null;
      if (!saved) return;
      if (Number.isFinite(saved.balance)) setBalance(Number(saved.balance));
      if (Array.isArray(saved.positions)) {
        setPositions(saved.positions.map((position) => ({ ...position, orderType: position.orderType ?? 'market' })));
      }
      if (Array.isArray(saved.pendingOrders)) setPendingOrders(saved.pendingOrders);
      if (Array.isArray(saved.history)) {
        setHistory(saved.history.map((trade) => ({ ...trade, orderType: trade.orderType ?? 'market' })));
      }
      if (LEVERAGE_OPTIONS.includes(Number(saved.leverage))) setLeverage(Number(saved.leverage));
    } catch {
      // Ignore malformed local demo data and start fresh.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        balance,
        positions,
        pendingOrders,
        history: history.slice(-60),
        leverage,
      })
    );
  }, [balance, positions, pendingOrders, history, leverage]);

  const selected = markets.find((pair) => pair.symbol === selectedSymbol) ?? markets[0];

  const findPair = (symbol: string) => markets.find((pair) => pair.symbol === symbol);

  const markPrice = (position: DemoPosition) => {
    const pair = findPair(position.symbol);
    return pair ? markPriceForPosition(pair, position.side) : position.entryPrice;
  };

  const unrealized = useMemo(
    () =>
      positions.reduce((sum, position) => {
        const current = markPrice(position);
        return sum + (position.side === 'buy' ? current - position.entryPrice : position.entryPrice - current) * position.units;
      }, 0),
    [markets, positions]
  );

  const equity = balance + unrealized;
  const openNotional = positions.reduce((sum, position) => sum + markPrice(position) * position.units, 0);
  const marginUsed = openNotional / leverage;
  const pendingNotional = pendingOrders.reduce((sum, order) => {
    const pair = findPair(order.symbol);
    return sum + (pair ? pair.price * order.units : order.triggerPrice * order.units);
  }, 0);
  const reservedMargin = pendingNotional / leverage;
  const freeMargin = equity - marginUsed - reservedMargin;
  const marginLevel = marginUsed > 0 ? (equity / marginUsed) * 100 : null;
  const realizedPnl = history.reduce((sum, trade) => sum + trade.pnl, 0);
  const winningTrades = history.filter((trade) => trade.pnl > 0).length;
  const winRate = history.length ? (winningTrades / history.length) * 100 : 0;
  useEffect(() => {
    if (!pendingOrders.length) return;

    const triggered: Array<{ order: DemoPendingOrder; pair: MarketPair; entry: number }> = [];
    const remaining: DemoPendingOrder[] = [];

    for (const order of pendingOrders) {
      const pair = findPair(order.symbol);
      if (!pair) {
        remaining.push(order);
        continue;
      }
      const bid = pair.bid ?? pair.price;
      const ask = pair.ask ?? pair.price;
      const crossed =
        order.side === 'buy'
          ? order.type === 'limit'
            ? ask <= order.triggerPrice
            : ask >= order.triggerPrice
          : order.type === 'limit'
            ? bid >= order.triggerPrice
            : bid <= order.triggerPrice;

      if (crossed) {
        triggered.push({ order, pair, entry: executablePrice(pair, order.side) });
      } else {
        remaining.push(order);
      }
    }

    if (!triggered.length) return;

    setPendingOrders(remaining);
    setPositions((current) => [
      ...triggered.map(({ order, entry }) => ({
        id: order.id,
        symbol: order.symbol,
        side: order.side,
        units: order.units,
        entryPrice: entry,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        openedAt: Date.now(),
        orderType: order.type,
      })),
      ...current,
    ]);
    setNotice(
      triggered.length === 1
        ? (triggered[0].order.side === 'buy' ? 'Buy' : 'Sell') + ' ' + triggered[0].order.symbol + ' pending order triggered.'
        : String(triggered.length) + ' pending orders triggered.'
    );
  }, [markets, pendingOrders]);

  useEffect(() => {
    if (!positions.length) return;
    const toClose: Array<{ position: DemoPosition; exitPrice: number; pnl: number }> = [];

    for (const position of positions) {
      const current = markPrice(position);
      const hitStop =
        position.stopLoss !== undefined &&
        (position.side === 'buy' ? current <= position.stopLoss : current >= position.stopLoss);
      const hitTarget =
        position.takeProfit !== undefined &&
        (position.side === 'buy' ? current >= position.takeProfit : current <= position.takeProfit);

      if (hitStop || hitTarget) {
        const pnl =
          (position.side === 'buy' ? current - position.entryPrice : position.entryPrice - current) * position.units;
        toClose.push({ position, exitPrice: current, pnl });
      }
    }

    if (!toClose.length) return;

    setPositions((current) => current.filter((position) => !toClose.some((closed) => closed.position.id === position.id)));
    setBalance((current) => current + toClose.reduce((sum, item) => sum + item.pnl, 0));
    setHistory((current) =>
      [
        ...current,
        ...toClose.map(({ position, exitPrice, pnl }) => ({
          id: position.id + ':' + Date.now(),
          symbol: position.symbol,
          side: position.side,
          units: position.units,
          entryPrice: position.entryPrice,
          exitPrice,
          pnl,
          openedAt: position.openedAt,
          closedAt: Date.now(),
          orderType: position.orderType,
        })),
      ].slice(-60)
    );
    setNotice(String(toClose.length) + ' position' + (toClose.length === 1 ? '' : 's') + ' closed by a risk level.');
  }, [markets]);

  const clearNoticeLater = () => {
    window.setTimeout(() => setNotice(null), 3500);
  };

  const validateRiskLevels = (entry: number) => {
    const stop = normalizeNumber(stopLoss);
    const target = normalizeNumber(takeProfit);

    if (stopLoss && stop === undefined) return { stop: undefined, target: undefined, error: 'Stop loss must be a valid price.' };
    if (takeProfit && target === undefined) return { stop: undefined, target: undefined, error: 'Take profit must be a valid price.' };

    if (stop !== undefined) {
      const validStop = side === 'buy' ? stop < entry : stop > entry;
      if (!validStop) return { stop: undefined, target: undefined, error: 'Stop loss must sit on the loss side of the entry.' };
    }

    if (target !== undefined) {
      const validTarget = side === 'buy' ? target > entry : target < entry;
      if (!validTarget) return { stop: undefined, target: undefined, error: 'Take profit must sit on the profit side of the entry.' };
    }

    return { stop, target, error: null as string | null };
  };

  const openPosition = (pair: MarketPair, entry: number, type: DemoOrderType, stop?: number, target?: number) => {
    const quantity = Number(units);
    const orderNotional = entry * quantity;
    const requiredMargin = orderNotional / leverage;

    if (requiredMargin > Math.max(0, freeMargin)) {
      setNotice('Not enough free margin for this demo order.');
      return;
    }

    const next: DemoPosition = {
      id: crypto.randomUUID(),
      symbol: pair.symbol,
      side,
      units: quantity,
      entryPrice: entry,
      stopLoss: stop,
      takeProfit: target,
      openedAt: Date.now(),
      orderType: type,
    };

    setPositions((current) => [next, ...current]);
    setNotice(
      (side === 'buy' ? 'Buy' : 'Sell') +
        ' ' +
        pair.symbol +
        ' opened at ' +
        formatPriceValue(pair.symbol, entry) +
        '.'
    );
    clearNoticeLater();
  };

  const placeOrder = () => {
    if (!selected || !enabled) return;

    const quantity = Number(units);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setNotice('Enter a valid unit size.');
      clearNoticeLater();
      return;
    }

    const market = executablePrice(selected, side);
    const requestedEntry = orderType === 'market' ? market : normalizeNumber(entryPrice);

    if (orderType !== 'market' && requestedEntry === undefined) {
      setNotice('Enter a trigger price for this pending order.');
      clearNoticeLater();
      return;
    }

    const entry = requestedEntry ?? market;

    if (orderType === 'limit') {
      const valid = side === 'buy' ? entry < market : entry > market;
      if (!valid) {
        setNotice((side === 'buy' ? 'Buy limit must be below' : 'Sell limit must be above') + ' the current market price.');
        clearNoticeLater();
        return;
      }
    }

    if (orderType === 'stop') {
      const valid = side === 'buy' ? entry > market : entry < market;
      if (!valid) {
        setNotice((side === 'buy' ? 'Buy stop must be above' : 'Sell stop must be below') + ' the current market price.');
        clearNoticeLater();
        return;
      }
    }

    const risk = validateRiskLevels(entry);
    if (risk.error) {
      setNotice(risk.error);
      clearNoticeLater();
      return;
    }

    const orderNotional = entry * quantity;
    const requiredMargin = orderNotional / leverage;
    if (requiredMargin > Math.max(0, freeMargin)) {
      setNotice('Not enough free margin for this demo order.');
      clearNoticeLater();
      return;
    }

    if (orderType === 'market') {
      openPosition(selected, entry, orderType, risk.stop, risk.target);
      return;
    }

    const pending: DemoPendingOrder = {
      id: crypto.randomUUID(),
      symbol: selected.symbol,
      side,
      type: orderType,
      units: quantity,
      triggerPrice: entry,
      stopLoss: risk.stop,
      takeProfit: risk.target,
      createdAt: Date.now(),
    };
    setPendingOrders((current) => [pending, ...current]);
    setNotice(
      (side === 'buy' ? 'Buy ' : 'Sell ') +
        orderType +
        ' placed for ' +
        selected.symbol +
        ' at ' +
        formatPriceValue(selected.symbol, entry) +
        '.'
    );
    clearNoticeLater();
  };

  const closePosition = (position: DemoPosition) => {
    const currentPrice = markPrice(position);
    const pnl =
      (position.side === 'buy' ? currentPrice - position.entryPrice : position.entryPrice - currentPrice) * position.units;
    setPositions((current) => current.filter((item) => item.id !== position.id));
    setBalance((current) => current + pnl);
    setHistory((current) =>
      [
        ...current,
        {
          id: position.id + ':' + Date.now(),
          symbol: position.symbol,
          side: position.side,
          units: position.units,
          entryPrice: position.entryPrice,
          exitPrice: currentPrice,
          pnl,
          openedAt: position.openedAt,
          closedAt: Date.now(),
          orderType: position.orderType,
        },
      ].slice(-60)
    );
    setNotice('Closed ' + position.symbol + ' for ' + (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + ' USD.');
    clearNoticeLater();
  };

  const cancelPending = (order: DemoPendingOrder) => {
    setPendingOrders((current) => current.filter((item) => item.id !== order.id));
    setNotice('Pending ' + order.symbol + ' order cancelled.');
    clearNoticeLater();
  };

  const resetDemo = () => {
    if (!window.confirm('Reset the demo account back to $10,000? This clears positions, pending orders and history.')) return;
    setBalance(START_BALANCE);
    setPositions([]);
    setPendingOrders([]);
    setHistory([]);
    setLeverage(DEFAULT_LEVERAGE);
    setNotice('Demo account reset to $10,000.');
    clearNoticeLater();
  };

  if (!enabled) {
    return (
      <div className="utility-page">
        <div className="page-header">
          <span className="eyebrow">DEMO TRADING</span>
          <h1>Demo is off.</h1>
          <p className="subtle">Turn demo trading back on from Settings when you want to practice with virtual money.</p>
        </div>
        <GlassPanel className="utility-empty">
          <div className="utility-icon"><Icon name="chart" size={22} /></div>
          <strong>Practice without real money</strong>
          <p>When enabled, BerreX uses current BerreX market prices to simulate entries, positions, pending orders and profit/loss locally on this device.</p>
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
          <p className="subtle">A risk-free trading terminal using the current BerreX market feed.</p>
        </div>
        <button className="secondary-button demo-reset-top" onClick={resetDemo}><Icon name="refresh" size={15} /> Reset</button>
      </div>

      <GlassPanel className="demo-account-hero">
        <div className="demo-account-hero-top">
          <div>
            <span className="demo-account-label">DEMO EQUITY</span>
            <strong className="demo-account-equity">${equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            <span className={unrealized >= 0 ? 'demo-account-pnl positive' : 'demo-account-pnl negative'}>
              {unrealized >= 0 ? '+' : ''}${unrealized.toFixed(2)} open P/L
            </span>
          </div>
          <div className="demo-account-badges">
            <span className="demo-status-pill"><span className="live-dot" /> PAPER</span>
            <select value={leverage} onChange={(event) => setLeverage(Number(event.target.value))} aria-label="Demo leverage">
              {LEVERAGE_OPTIONS.map((value) => <option key={value} value={value}>1:{value} leverage</option>)}
            </select>
          </div>
        </div>
        <div className="demo-account-stats">
          <div><span>Balance</span><strong>${balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
          <div><span>Free margin</span><strong>${Math.max(0, freeMargin).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
          <div><span>Margin used</span><strong>${marginUsed.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
          <div><span>Margin level</span><strong>{marginLevel === null ? '—' : marginLevel.toFixed(0) + '%'}</strong></div>
        </div>
      </GlassPanel>

      <div className="demo-performance-grid">
        <GlassPanel><span>Realised P/L</span><strong className={realizedPnl >= 0 ? 'positive' : 'negative'}>{realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}</strong></GlassPanel>
        <GlassPanel><span>Unrealised P/L</span><strong className={unrealized >= 0 ? 'positive' : 'negative'}>{unrealized >= 0 ? '+' : ''}${unrealized.toFixed(2)}</strong></GlassPanel>
        <GlassPanel><span>Win rate</span><strong>{history.length ? winRate.toFixed(0) + '%' : '—'}</strong><small>{history.length} closed trade{history.length === 1 ? '' : 's'}</small></GlassPanel>
        <GlassPanel><span>Exposure</span><strong>${openNotional.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong><small>{positions.length} open · {pendingOrders.length} pending</small></GlassPanel>
      </div>

      {notice && <div className="demo-notice"><Icon name="spark" size={14} /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}

      <div className="demo-live-banner">
        <span><span className="live-dot" /> {markets.some((pair) => pair.timestamp) ? 'Market feed connected' : 'Using current BerreX feed'}</span>
        <button onClick={() => selected && onOpenPair(selected.symbol)}>Open chart <Icon name="arrow" size={14} /></button>
      </div>

      <GlassPanel className="demo-ticket">
        <div className="demo-ticket-header">
          <div><span className="eyebrow">NEW ORDER</span><h2>Build an order</h2><p>Choose a market, order type, side and risk controls.</p></div>
          <span className="demo-mode-pill">PAPER</span>
        </div>

        <div className="demo-order-types">
          {(['market', 'limit', 'stop'] as DemoOrderType[]).map((type) => (
            <button key={type} className={orderType === type ? 'active' : ''} onClick={() => setOrderType(type)}>
              <strong>{type === 'market' ? 'Market' : type === 'limit' ? 'Limit' : 'Stop'}</strong>
              <small>{type === 'market' ? 'Enter now' : type === 'limit' ? 'Enter better price' : 'Enter on breakout'}</small>
            </button>
          ))}
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
            <div><span>{selected.symbol}</span><strong>{formatPrice(selected)}</strong><small>Bid {formatPriceValue(selected.symbol, selected.bid ?? selected.price)} · Ask {formatPriceValue(selected.symbol, selected.ask ?? selected.price)}</small></div>
            <MarketSparkline points={selected.sparkline} positive={selected.change24h >= 0} />
          </div>
          <div className="demo-bidask">
            <div><span>Bid</span><strong>{formatPriceValue(selected.symbol, selected.bid ?? selected.price)}</strong></div>
            <div><span>Ask</span><strong>{formatPriceValue(selected.symbol, selected.ask ?? selected.price)}</strong></div>
            <div><span>24h</span><strong className={selected.change24h >= 0 ? 'positive' : 'negative'}>{selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}%</strong></div>
          </div>
        </div>}

        <div className="demo-side-toggle">
          <button className={side === 'buy' ? 'buy active' : 'buy'} onClick={() => setSide('buy')}><span>BUY / LONG</span><small>Profit when price rises</small></button>
          <button className={side === 'sell' ? 'sell active' : 'sell'} onClick={() => setSide('sell')}><span>SELL / SHORT</span><small>Profit when price falls</small></button>
        </div>

        <div className="demo-field-grid">
          <label><span>Units</span><input inputMode="numeric" value={units} onChange={(event) => setUnits(event.target.value)} /></label>
          <label className={orderType === 'market' ? 'field-disabled' : ''}><span>{orderType === 'market' ? 'Execution price' : 'Trigger price'}</span><input inputMode="decimal" value={orderType === 'market' ? (selected ? formatPriceValue(selected.symbol, executablePrice(selected, side)) : '') : entryPrice} onChange={(event) => setEntryPrice(event.target.value)} disabled={orderType === 'market'} placeholder={selected ? formatPrice(selected) : 'Price'} /></label>
          <label><span>Leverage</span><select value={leverage} onChange={(event) => setLeverage(Number(event.target.value))}>{LEVERAGE_OPTIONS.map((value) => <option key={value} value={value}>1:{value}</option>)}</select></label>
          <label><span>Stop loss</span><input inputMode="decimal" value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} placeholder={selected ? formatPrice(selected) : 'Price'} /></label>
          <label><span>Take profit</span><input inputMode="decimal" value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} placeholder={selected ? formatPrice(selected) : 'Price'} /></label>
        </div>

        <div className="demo-order-summary">
          <div><span>Required margin</span><strong>${(() => {
            const qty = Number(units);
            const px = orderType === 'market' && selected ? executablePrice(selected, side) : normalizeNumber(entryPrice) ?? (selected ? selected.price : 0);
            return Number.isFinite(qty) ? (Math.max(0, px * qty) / leverage).toFixed(2) : '0.00';
          })()}</strong></div>
          <div><span>Available</span><strong>${Math.max(0, freeMargin).toFixed(2)}</strong></div>
        </div>

        <button className={side === 'buy' ? 'demo-execute buy' : 'demo-execute sell'} onClick={placeOrder}>
          <span>{orderType === 'market' ? (side === 'buy' ? 'Open Buy / Long' : 'Open Sell / Short') : (side === 'buy' ? 'Place Buy ' : 'Place Sell ') + orderType}</span>
          <strong>{selected ? formatPrice(selected) : '—'}</strong>
        </button>
        <p className="demo-note"><Icon name="shield" size={13} /> Simulated only. Market orders use the current bid/ask; limit and stop orders remain pending until the price reaches the trigger.</p>
      </GlassPanel>

      <section className="utility-section">
        <div className="utility-section-head"><div><span className="eyebrow">OPEN POSITIONS</span><h2>Active trades</h2></div><span className="muted-small">{positions.length} active</span></div>
        {positions.length ? <div className="demo-position-list">{positions.map((position) => {
          const current = markPrice(position);
          const pnl = (position.side === 'buy' ? current - position.entryPrice : position.entryPrice - current) * position.units;
          const pair = findPair(position.symbol);
          const displayPrice = pair ? formatPriceValue(pair.symbol, current) : current.toFixed(priceDigits(position.symbol));
          return <article className="demo-position-row" key={position.id}>
            <button className="demo-position-main" onClick={() => onOpenPair(position.symbol)}>
              <div className="demo-position-head"><span>{position.symbol}</span><b className={position.side === 'buy' ? 'position-long' : 'position-short'}>{position.side === 'buy' ? 'LONG' : 'SHORT'}</b><em>{position.orderType.toUpperCase()}</em></div>
              <strong className={pnl >= 0 ? 'positive' : 'negative'}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</strong>
              <small>{position.units.toLocaleString()} units · Entry {formatPriceValue(position.symbol, position.entryPrice)} · Now {displayPrice}</small>
              <small>{position.stopLoss !== undefined ? 'SL $' + formatPriceValue(position.symbol, position.stopLoss) : 'No SL'} · {position.takeProfit !== undefined ? 'TP $' + formatPriceValue(position.symbol, position.takeProfit) : 'No TP'}</small>
            </button>
            <button className="demo-close-button" onClick={() => closePosition(position)} aria-label={'Close ' + position.symbol}>×</button>
          </article>;
        })}</div> : <GlassPanel className="utility-empty compact"><strong>No open positions</strong><p>Your account is flat. New market orders appear here immediately; pending orders wait below.</p></GlassPanel>}
      </section>

      <section className="utility-section">
        <div className="utility-section-head"><div><span className="eyebrow">PENDING ORDERS</span><h2>Waiting to trigger</h2></div><span className="muted-small">{pendingOrders.length} pending</span></div>
        {pendingOrders.length ? <div className="demo-pending-list">{pendingOrders.map((order) => (
          <article className="demo-pending-row" key={order.id}>
            <div>
              <div className="demo-position-head"><strong>{order.symbol}</strong><b className={order.side === 'buy' ? 'position-long' : 'position-short'}>{order.side === 'buy' ? 'BUY' : 'SELL'} {order.type.toUpperCase()}</b></div>
              <small>{order.units.toLocaleString()} units · Trigger {formatPriceValue(order.symbol, order.triggerPrice)}</small>
              <small>{order.stopLoss !== undefined ? 'SL ' + formatPriceValue(order.symbol, order.stopLoss) : 'No SL'} · {order.takeProfit !== undefined ? 'TP ' + formatPriceValue(order.symbol, order.takeProfit) : 'No TP'}</small>
            </div>
            <button className="secondary-button" onClick={() => cancelPending(order)}>Cancel</button>
          </article>
        ))}</div> : <GlassPanel className="utility-empty compact"><strong>No pending orders</strong><p>Limit and stop orders will appear here until their trigger price is reached or you cancel them.</p></GlassPanel>}
      </section>

      <section className="utility-section">
        <div className="utility-section-head"><div><span className="eyebrow">TRADE HISTORY</span><h2>Recent activity</h2></div><button className="text-button" onClick={resetDemo}>Reset account</button></div>
        {history.length ? <div className="demo-history-list">{history.slice().reverse().slice(0, 10).map((trade) => <div className="demo-history-row" key={trade.id}>
          <span><strong>{trade.symbol}</strong><small>{trade.side === 'buy' ? 'Long' : 'Short'} · {trade.orderType} · {trade.units.toLocaleString()} units · {new Date(trade.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>
          <strong className={trade.pnl >= 0 ? 'positive' : 'negative'}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</strong>
        </div>)}</div> : <GlassPanel className="utility-empty compact"><strong>No closed trades yet</strong><p>Completed demo trades will appear here with realised P/L and execution details.</p></GlassPanel>}
      </section>
    </div>
  );
}
