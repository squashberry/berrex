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
  live,
}: {
  markets: MarketPair[];
  enabled: boolean;
  onOpenPair: (symbol: string) => void;
  live: boolean;
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
  const [demoView, setDemoView] = useState<'trade' | 'positions' | 'orders' | 'history'>('trade');
  const [managePositionId, setManagePositionId] = useState<string | null>(null);
  const [editStopLoss, setEditStopLoss] = useState('');
  const [editTakeProfit, setEditTakeProfit] = useState('');
  const [partialUnits, setPartialUnits] = useState('');

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

  const closeAllPositions = () => {
    if (!positions.length) {
      setNotice('There are no open demo trades to close.');
      clearNoticeLater();
      return;
    }
    if (!window.confirm('Close all ' + positions.length + ' open demo trade' + (positions.length === 1 ? '' : 's') + ' at the current market prices?')) return;

    const closedAt = Date.now();
    const results = positions.map((position) => {
      const currentPrice = markPrice(position);
      const pnl = (position.side === 'buy' ? currentPrice - position.entryPrice : position.entryPrice - currentPrice) * position.units;
      return {
        id: position.id + ':all:' + closedAt,
        symbol: position.symbol,
        side: position.side,
        units: position.units,
        entryPrice: position.entryPrice,
        exitPrice: currentPrice,
        pnl,
        openedAt: position.openedAt,
        closedAt,
        orderType: position.orderType,
      };
    });

    const totalPnl = results.reduce((sum, trade) => sum + trade.pnl, 0);
    setPositions([]);
    setBalance((current) => current + totalPnl);
    setHistory((current) => [...current, ...results].slice(-60));
    setManagePositionId(null);
    setNotice('Closed all ' + results.length + ' demo trade' + (results.length === 1 ? '' : 's') + ' for ' + (totalPnl >= 0 ? '+' : '') + totalPnl.toFixed(2) + ' USD.');
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

  const beginManagePosition = (position: DemoPosition) => {
    setManagePositionId(position.id);
    setEditStopLoss(position.stopLoss === undefined ? '' : String(position.stopLoss));
    setEditTakeProfit(position.takeProfit === undefined ? '' : String(position.takeProfit));
    setPartialUnits('');
  };

  const savePositionRisk = (position: DemoPosition) => {
    const nextStop = normalizeNumber(editStopLoss);
    const nextTarget = normalizeNumber(editTakeProfit);
    const current = markPrice(position);

    if (editStopLoss && nextStop === undefined) {
      setNotice('Stop loss must be a valid price.');
      clearNoticeLater();
      return;
    }
    if (editTakeProfit && nextTarget === undefined) {
      setNotice('Take profit must be a valid price.');
      clearNoticeLater();
      return;
    }
    if (nextStop !== undefined && (position.side === 'buy' ? nextStop >= current : nextStop <= current)) {
      setNotice('Stop loss must remain on the loss side of the current price.');
      clearNoticeLater();
      return;
    }
    if (nextTarget !== undefined && (position.side === 'buy' ? nextTarget <= current : nextTarget >= current)) {
      setNotice('Take profit must remain on the profit side of the current price.');
      clearNoticeLater();
      return;
    }

    setPositions((items) => items.map((item) => item.id === position.id ? {
      ...item,
      stopLoss: nextStop,
      takeProfit: nextTarget,
    } : item));
    setNotice(position.symbol + ' risk levels updated.');
    clearNoticeLater();
    setManagePositionId(null);
  };

  const partialClose = (position: DemoPosition) => {
    const quantity = Number(partialUnits);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity >= position.units) {
      setNotice('Enter a partial-close amount smaller than the open position.');
      clearNoticeLater();
      return;
    }

    const currentPrice = markPrice(position);
    const pnl = (position.side === 'buy' ? currentPrice - position.entryPrice : position.entryPrice - currentPrice) * quantity;

    setPositions((items) => items.map((item) => item.id === position.id ? { ...item, units: item.units - quantity } : item));
    setBalance((currentBalance) => currentBalance + pnl);
    setHistory((items) => [...items, {
      id: position.id + ':partial:' + Date.now(),
      symbol: position.symbol,
      side: position.side,
      units: quantity,
      entryPrice: position.entryPrice,
      exitPrice: currentPrice,
      pnl,
      openedAt: position.openedAt,
      closedAt: Date.now(),
      orderType: position.orderType,
    }].slice(-60));
    setNotice('Partially closed ' + position.symbol + ' for ' + (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + ' USD.');
    clearNoticeLater();
    setManagePositionId(null);
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

  const winningPnl = history.filter((trade) => trade.pnl > 0);
  const losingPnl = history.filter((trade) => trade.pnl < 0);
  const averageWin = winningPnl.length ? winningPnl.reduce((sum, trade) => sum + trade.pnl, 0) / winningPnl.length : 0;
  const averageLoss = losingPnl.length ? losingPnl.reduce((sum, trade) => sum + trade.pnl, 0) / losingPnl.length : 0;
  const selectedBid = selected ? (selected.bid ?? selected.price) : 0;
  const selectedAsk = selected ? (selected.ask ?? selected.price) : 0;

  const renderPosition = (position: DemoPosition) => {
    const current = markPrice(position);
    const pnl = (position.side === 'buy' ? current - position.entryPrice : position.entryPrice - current) * position.units;
    const pair = findPair(position.symbol);
    const displayPrice = pair ? formatPriceValue(pair.symbol, current) : current.toFixed(priceDigits(position.symbol));

    return (
      <article className="demo-position-row" key={position.id}>
        <button className="demo-position-main" onClick={() => onOpenPair(position.symbol)}>
          <div className="demo-position-head">
            <span>{position.symbol}</span>
            <b className={position.side === 'buy' ? 'position-long' : 'position-short'}>{position.side === 'buy' ? 'LONG' : 'SHORT'}</b>
            <em>{position.orderType.toUpperCase()}</em>
          </div>
          <strong className={pnl >= 0 ? 'positive' : 'negative'}>{pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}</strong>
          <small>{position.units.toLocaleString()} units · Entry {formatPriceValue(position.symbol, position.entryPrice)} · Now {displayPrice}</small>
          <small>{position.stopLoss !== undefined ? 'SL $' + formatPriceValue(position.symbol, position.stopLoss) : 'No SL'} · {position.takeProfit !== undefined ? 'TP $' + formatPriceValue(position.symbol, position.takeProfit) : 'No TP'}</small>
        </button>
        <button className="demo-manage-button" onClick={() => beginManagePosition(position)}>Manage</button>
        <button className="demo-close-button" onClick={() => closePosition(position)} aria-label={'Close ' + position.symbol}>×</button>

        {managePositionId === position.id && (
          <div className="demo-position-manager">
            <div>
              <span>MODIFY POSITION</span>
              <strong>{position.symbol}</strong>
            </div>
            <div className="demo-manager-fields">
              <label>Stop loss<input inputMode="decimal" value={editStopLoss} onChange={(event) => setEditStopLoss(event.target.value)} placeholder="Off" /></label>
              <label>Take profit<input inputMode="decimal" value={editTakeProfit} onChange={(event) => setEditTakeProfit(event.target.value)} placeholder="Off" /></label>
              <label>Partial close<input inputMode="numeric" value={partialUnits} onChange={(event) => setPartialUnits(event.target.value)} placeholder="Units" /></label>
            </div>
            <div className="demo-manager-actions">
              <button className="secondary-button" onClick={() => setManagePositionId(null)}>Cancel</button>
              <button className="secondary-button" onClick={() => partialClose(position)}>Close partial</button>
              <button className="primary-button" onClick={() => savePositionRisk(position)}>Save SL / TP</button>
            </div>
          </div>
        )}
      </article>
    );
  };

  const renderPositions = () => (
    <section className="utility-section demo-section-card">
      <div className="utility-section-head">
        <div><span className="eyebrow">POSITIONS</span><h2>Active trades</h2></div>
        <div className="demo-section-actions">
          <span className="muted-small">{positions.length} active</span>
          {positions.length > 0 && <button className="demo-close-all" onClick={closeAllPositions}>Close all</button>}
        </div>
      </div>
      {positions.length ? <div className="demo-position-list">{positions.map(renderPosition)}</div> : (
        <GlassPanel className="utility-empty compact"><strong>No open positions</strong><p>Your account is flat. Open a market order from the Trade tab to see it here.</p></GlassPanel>
      )}
    </section>
  );

  const renderPendingOrders = () => (
    <section className="utility-section demo-section-card">
      <div className="utility-section-head">
        <div><span className="eyebrow">ORDERS</span><h2>Pending orders</h2></div>
        <span className="muted-small">{pendingOrders.length} pending</span>
      </div>
      {pendingOrders.length ? <div className="demo-pending-list">{pendingOrders.map((order) => (
        <article className="demo-pending-row" key={order.id}>
          <button className="demo-pending-main" onClick={() => { setSelectedSymbol(order.symbol); onOpenPair(order.symbol); }}>
            <div className="demo-position-head">
              <strong>{order.symbol}</strong>
              <b className={order.side === 'buy' ? 'position-long' : 'position-short'}>{order.side === 'buy' ? 'BUY' : 'SELL'} {order.type.toUpperCase()}</b>
            </div>
            <small>{order.units.toLocaleString()} units · Trigger {formatPriceValue(order.symbol, order.triggerPrice)}</small>
            <small>{order.stopLoss !== undefined ? 'SL ' + formatPriceValue(order.symbol, order.stopLoss) : 'No SL'} · {order.takeProfit !== undefined ? 'TP ' + formatPriceValue(order.symbol, order.takeProfit) : 'No TP'}</small>
          </button>
          <button className="secondary-button demo-cancel-order" onClick={() => cancelPending(order)}>Cancel</button>
        </article>
      ))}</div> : (
        <GlassPanel className="utility-empty compact"><strong>No pending orders</strong><p>Limit and stop orders stay here until the market reaches their trigger price.</p></GlassPanel>
      )}
      {pendingOrders.length > 1 && <button className="secondary-button demo-cancel-all" onClick={() => { setPendingOrders([]); setNotice('All pending orders cancelled.'); clearNoticeLater(); }}>Cancel all pending</button>}
    </section>
  );

  const renderHistory = () => (
    <section className="utility-section demo-section-card">
      <div className="utility-section-head">
        <div><span className="eyebrow">HISTORY</span><h2>Closed trades</h2></div>
        <span className="muted-small">{history.length} total</span>
      </div>
      {history.length ? <div className="demo-history-list">{history.slice().reverse().map((trade) => (
        <button className="demo-history-row demo-history-button" key={trade.id} onClick={() => { setSelectedSymbol(trade.symbol); onOpenPair(trade.symbol); }}>
          <span><strong>{trade.symbol}</strong><small>{trade.side === 'buy' ? 'Long' : 'Short'} · {trade.orderType} · {trade.units.toLocaleString()} units · {new Date(trade.closedAt).toLocaleDateString()} {new Date(trade.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></span>
          <strong className={trade.pnl >= 0 ? 'positive' : 'negative'}>{trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}</strong>
        </button>
      ))}</div> : (
        <GlassPanel className="utility-empty compact"><strong>No closed trades yet</strong><p>Once a position closes, its realised P/L and execution details will appear here.</p></GlassPanel>
      )}
    </section>
  );

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

      <div className="demo-performance-strip">
        <div><span>Average win</span><strong className="positive">{winningPnl.length ? '+' : ''}${averageWin.toFixed(2)}</strong></div>
        <div><span>Average loss</span><strong className="negative">${averageLoss.toFixed(2)}</strong></div>
        <div><span>Free margin</span><strong>${Math.max(0, freeMargin).toFixed(2)}</strong></div>
      </div>

      {notice && <div className="demo-notice"><Icon name="spark" size={14} /><span>{notice}</span><button onClick={() => setNotice(null)} aria-label="Dismiss">×</button></div>}

      <div className={live ? "demo-live-banner" : "demo-live-banner offline"}>
        <span><span className="live-dot" /> {live ? 'Live market feed connected' : 'Demo prices are not live right now'}</span>
        <button onClick={() => selected && onOpenPair(selected.symbol)}>Open chart <Icon name="arrow" size={14} /></button>
      </div>

      <div className="demo-view-tabs" role="tablist" aria-label="Demo account sections">
        {([
          ['trade', 'Trade'],
          ['positions', 'Positions'],
          ['orders', 'Orders'],
          ['history', 'History'],
        ] as const).map(([id, label]) => (
          <button key={id} className={demoView === id ? 'active' : ''} onClick={() => setDemoView(id)} role="tab" aria-selected={demoView === id}>
            <span>{label}</span>
            {id === 'positions' && <b>{positions.length}</b>}
            {id === 'orders' && <b>{pendingOrders.length}</b>}
            {id === 'history' && <b>{history.length}</b>}
          </button>
        ))}
      </div>

      {demoView === 'trade' && (
        <>
          {positions.length > 0 && <div className="demo-active-trade-strip"><span><b>{positions.length}</b> open demo trades</span><button onClick={() => setDemoView('positions')}>Manage positions</button><button className="danger" onClick={closeAllPositions}>Close all</button></div>}

          <div className="demo-quote-actions">
            <button className="demo-quote-action buy" onClick={() => { setSide('buy'); setOrderType('market'); }}>
              <span>BUY</span><strong>${selected ? formatPriceValue(selected.symbol, selectedAsk) : '—'}</strong><small>Ask · {selected?.symbol ?? 'Market'}</small>
            </button>
            <button className="demo-quote-action sell" onClick={() => { setSide('sell'); setOrderType('market'); }}>
              <span>SELL</span><strong>${selected ? formatPriceValue(selected.symbol, selectedBid) : '—'}</strong><small>Bid · {selected?.symbol ?? 'Market'}</small>
            </button>
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
                <div><span>{selected.symbol}</span><strong>{formatPrice(selected)}</strong><small>Bid ${formatPriceValue(selected.symbol, selectedBid)} · Ask ${formatPriceValue(selected.symbol, selectedAsk)}</small></div>
                <MarketSparkline points={selected.sparkline} positive={selected.change24h >= 0} />
              </div>
              <div className="demo-bidask">
                <div><span>Bid</span><strong>${formatPriceValue(selected.symbol, selectedBid)}</strong></div>
                <div><span>Ask</span><strong>${formatPriceValue(selected.symbol, selectedAsk)}</strong></div>
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
            <p className="demo-note"><Icon name="shield" size={13} /> Simulated only. Market orders use bid/ask; limit and stop orders wait for their trigger.</p>
          </GlassPanel>
        </>
      )}

      {demoView === 'positions' && renderPositions()}
      {demoView === 'orders' && renderPendingOrders()}
      {demoView === 'history' && (
        <>
          <div className="demo-history-analytics">
            <GlassPanel><span>Net realised</span><strong className={realizedPnl >= 0 ? 'positive' : 'negative'}>{realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}</strong></GlassPanel>
            <GlassPanel><span>Win rate</span><strong>{history.length ? winRate.toFixed(0) + '%' : '—'}</strong></GlassPanel>
            <GlassPanel><span>Avg win</span><strong className="positive">{winningPnl.length ? '+' : ''}${averageWin.toFixed(2)}</strong></GlassPanel>
            <GlassPanel><span>Avg loss</span><strong className="negative">${averageLoss.toFixed(2)}</strong></GlassPanel>
          </div>
          {renderHistory()}
        </>
      )}

      <p className="demo-disclaimer"><Icon name="shield" size={12} /> Demo funds are virtual. BerreX never sends these orders to a broker.</p>
    </div>
  );
