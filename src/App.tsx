import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BottomNav } from './components/BottomNav';
import { GlassPanel } from './components/GlassPanel';
import { AIInsight } from './components/AIInsight';
import { PairCard } from './components/PairCard';
import { MarketTerminal } from './components/MarketTerminal';
import { MarketSparkline } from './components/MarketSparkline';
import { Icon } from './lib/icons';
import { DEFAULT_SELECTED, EVENTS, INITIAL_MARKETS, NEWS } from './data/market';
import { convertCurrency, fetchEconomicCalendar, fetchLiveMarkets, fetchLiveNews, fetchTwelveSeries, simulatedTick } from './services/market';
import { requestAiInsight } from './services/ai';
import type { EconomicEvent, MarketPair, NewsItem, PriceAlert, PriceAlertCondition } from './types';

type Tab = 'home' | 'markets' | 'news' | 'profile';
type Overlay = 'notifications' | 'converter' | 'alert' | 'calendar' | 'search' | null;

const EXNESS_URL = import.meta.env.VITE_EXNESS_REFERRAL_URL || 'https://www.exness.com/';
const API_ENABLED = Boolean(import.meta.env.VITE_MARKET_API_URL || import.meta.env.VITE_FMP_API_KEY || import.meta.env.VITE_TWELVEDATA_API_KEY);

function formatPrice(pair: MarketPair) {
  return pair.price.toFixed(pair.symbol === 'USD/JPY' || pair.symbol === 'XAU/USD' ? 2 : 5);
}

function formatAge(timestamp?: number) {
  if (!timestamp) return 'Preview data';
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return time;
}

function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const id = window.setTimeout(onDone, 2300);
    return () => window.clearTimeout(id);
  }, [onDone]);

  return (
    <div className="splash-screen">
      <div className="splash-orbit orbit-one" />
      <div className="splash-orbit orbit-two" />
      <div className="splash-logo"><span>Berre</span><b>X</b></div>
      <div className="splash-subtitle">market intelligence</div>
      <div className="splash-loader"><span /></div>
      <div className="splash-footer">by Squashberry</div>
    </div>
  );
}

function Modal({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal-card ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="modal-top">
          <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const [markets, setMarkets] = useState(INITIAL_MARKETS);
  const [news, setNews] = useState<NewsItem[]>(NEWS);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SELECTED);
  const [search, setSearch] = useState('');
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>(['EUR/USD', 'USD/JPY']);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [dark, setDark] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [alertNotice, setAlertNotice] = useState<string | null>(null);
  const [alertCondition, setAlertCondition] = useState<PriceAlertCondition>('above');
  const [alertTarget, setAlertTarget] = useState('');
  const [events, setEvents] = useState<EconomicEvent[]>(EVENTS);
  const [converterAmount, setConverterAmount] = useState('100');
  const [converterPair, setConverterPair] = useState('EUR/USD');
  const [converted, setConverted] = useState<number | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [lastSync, setLastSync] = useState<number | undefined>();
  const [marketFilter, setMarketFilter] = useState<'All' | 'Majors' | 'Metals' | 'Favorites'>('All');
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showFloatingTools, setShowFloatingTools] = useState(false);
  const time = useClock();
  const finishSplash = useCallback(() => setBooted(true), []);

  useEffect(() => {
    const onScroll = () => setShowFloatingTools(window.scrollY > 120);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  useEffect(() => {
    const saved = window.localStorage.getItem('berrex-theme');
    if (saved === 'dark') setDark(true);
    const savedAlerts = window.localStorage.getItem('berrex-alerts');
    if (savedAlerts) setAlerts(JSON.parse(savedAlerts));
    const savedPriceAlerts = window.localStorage.getItem('berrex-price-alerts');
    if (savedPriceAlerts) setPriceAlerts(JSON.parse(savedPriceAlerts));
  }, []);

  useEffect(() => {
    window.localStorage.setItem('berrex-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    window.localStorage.setItem('berrex-alerts', JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    window.localStorage.setItem('berrex-price-alerts', JSON.stringify(priceAlerts));
  }, [priceAlerts]);

  useEffect(() => {
    for (const alert of priceAlerts) {
      const pair = markets.find((item) => item.symbol === alert.symbol);
      if (!pair) continue;
      const hit = alert.condition === 'above' ? pair.price >= alert.target : pair.price <= alert.target;
      const key = 'berrex-alert-hit:' + alert.symbol + ':' + alert.condition + ':' + alert.target;
      if (hit && !window.sessionStorage.getItem(key)) {
        window.sessionStorage.setItem(key, '1');
        setAlertNotice(alert.symbol + ' ' + (alert.condition === 'above' ? 'crossed above' : 'crossed below') + ' ' + alert.target);
        window.setTimeout(() => setAlertNotice(null), 5000);
        break;
      }
    }
  }, [markets, priceAlerts]);

  useEffect(() => {
    if (!booted) return;
    let cancelled = false;
    const load = async () => {
      setLoadingData(true);
      const [marketsResult, newsResult, calendarResult] = await Promise.allSettled([
        fetchLiveMarkets(INITIAL_MARKETS),
        fetchLiveNews(),
        fetchEconomicCalendar(),
      ]);
      if (cancelled) return;
      if (marketsResult.status === 'fulfilled') {
        setMarkets(marketsResult.value);
        setLastSync(Date.now() / 1000);
      } else {
        setMarkets((current) => simulatedTick(current));
      }
      if (newsResult.status === 'fulfilled' && newsResult.value.length) setNews(newsResult.value);
      if (calendarResult.status === 'fulfilled' && calendarResult.value.length) setEvents(calendarResult.value);
      setLoadingData(false);
    };
    void load();
    const id = window.setInterval(() => {
      if (!API_ENABLED) setMarkets((current) => simulatedTick(current));
    }, 6500);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [booted]);

  const selected = markets.find((pair) => pair.symbol === selectedSymbol) ?? markets[0];

  const filteredMarkets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return markets.filter((pair) => {
      const matchesSearch = !term || pair.symbol.toLowerCase().includes(term) || pair.base.toLowerCase().includes(term) || pair.quote.toLowerCase().includes(term);
      const matchesFilter = marketFilter === 'All'
        || (marketFilter === 'Majors' && ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD'].includes(pair.symbol))
        || (marketFilter === 'Metals' && pair.symbol.includes('XAU'))
        || (marketFilter === 'Favorites' && favoriteSymbols.includes(pair.symbol));
      return matchesSearch && matchesFilter;
    });
  }, [markets, search, marketFilter, favoriteSymbols]);

  const favorites = markets.filter((pair) => favoriteSymbols.includes(pair.symbol));
  const movers = [...markets].sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h)).slice(0, 3);

  const openPair = async (symbol: string) => {
    setSelectedSymbol(symbol);
    setSheetOpen(true);
    setAiText('');
    setAiLoading(true);
    const pair = markets.find((item) => item.symbol === symbol);
    if (!pair) return;
    try {
      const series = await fetchTwelveSeries(symbol);
      if (series.length) setMarkets((current) => current.map((item) => item.symbol === symbol ? { ...item, sparkline: series.slice(-30) } : item));
      setAiText(await requestAiInsight(pair));
    } catch {
      setAiText('Analysis is temporarily unavailable. Review price action, the calendar and current news together. This surface is informational, not financial advice.');
    } finally {
      setAiLoading(false);
    }
  };

  const toggleFavorite = (symbol: string) => {
    setFavoriteSymbols((current) => current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]);
  };

  const createAlert = () => {
    if (!selected) return;
    const target = Number(alertTarget);
    if (!Number.isFinite(target) || target <= 0) return;
    setAlerts((current) => current.includes(selected.symbol) ? current : [...current, selected.symbol]);
    setPriceAlerts((current) => {
      const next = current.filter((item) => item.symbol !== selected.symbol);
      return [...next, { symbol: selected.symbol, condition: alertCondition, target, createdAt: Date.now() }];
    });
    setOverlay(null);
  };

  const runConversion = async () => {
    setConverted(null);
    try {
      const value = await convertCurrency(Number(converterAmount) || 0, converterPair);
      setConverted(value);
    } catch {
      const [base, quote] = converterPair.split('/');
      const pair = markets.find((item) => item.symbol === converterPair);
      setConverted(pair ? (Number(converterAmount) || 0) * pair.price : null);
      void base; void quote;
    }
  };

  if (!booted) return <Splash onDone={finishSplash} />;

  const renderHome = () => (
    <>
      <div className="top-row">
        <div>
          <div className="eyebrow">GLOBAL MARKETS</div>
          <h1>Good morning.</h1>
          <p className="subtle">Your market desk, condensed.</p>
        </div>
        <button className="icon-button" onClick={() => setOverlay('notifications')} aria-label="Notifications">
          <Icon name="bell" size={20} /><span className="notification-dot" />
        </button>
      </div>

      <GlassPanel className="hero-card">
        <div className="hero-topline">
          <span className="live-pill"><span className="live-dot" /> {API_ENABLED ? 'Live market feed' : 'Preview feed'}</span>
          <span className="timestamp">{lastSync ? formatAge(lastSync) : API_ENABLED ? 'Connecting…' : 'Simulated market'}</span>
        </div>
        <div className="hero-symbol">
          <div><span className="section-kicker">FOCUS PAIR</span><h2>{selected.symbol}</h2></div>
          <button className="mini-star" onClick={() => toggleFavorite(selected.symbol)} aria-label="Toggle favorite"><Icon name="star" size={17} fill={favoriteSymbols.includes(selected.symbol) ? 'currentColor' : 'none'} /></button>
        </div>
        <div className="hero-price-row">
          <strong>{formatPrice(selected)}</strong>
          <span className={selected.change24h >= 0 ? 'positive' : 'negative'}>{selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}%</span>
        </div>
        <MarketSparkline points={selected.sparkline} positive={selected.change24h >= 0} large />
        <div className="market-stat-strip">
          <div><span>Day high</span><strong>{selected.dayHigh?.toFixed(selected.symbol === 'USD/JPY' || selected.symbol === 'XAU/USD' ? 2 : 5) ?? '—'}</strong></div>
          <div><span>Day low</span><strong>{selected.dayLow?.toFixed(selected.symbol === 'USD/JPY' || selected.symbol === 'XAU/USD' ? 2 : 5) ?? '—'}</strong></div>
          <div><span>Status</span><strong>Open</strong></div>
        </div>
        <div className="hero-actions">
          <button className="primary-button" onClick={() => window.open(EXNESS_URL, '_blank', 'noopener,noreferrer')}>Trade on Exness <Icon name="arrow" size={15} /></button>
          <button className="secondary-button" onClick={() => openPair(selected.symbol)}>Open analysis</button>
        </div>
        <div className="disclaimer-line"><Icon name="shield" size={14} /> Informational only — not financial advice.</div>
      </GlassPanel>

      <div className="section-heading"><div><span className="eyebrow">YOUR SPACE</span><h2>Watchlist</h2></div><button className="text-button" onClick={() => setActiveTab('markets')}>Manage <Icon name="chevron" size={14} /></button></div>
      <div className="pair-grid compact">{(favorites.length ? favorites : markets.slice(0, 2)).slice(0, 4).map((pair) => <PairCard key={pair.symbol} pair={pair} favorite={favoriteSymbols.includes(pair.symbol)} onOpen={() => openPair(pair.symbol)} onToggleFavorite={() => toggleFavorite(pair.symbol)} />)}</div>

      <div className="section-heading"><div><span className="eyebrow">MARKET PULSE</span><h2>Movers</h2></div><span className="muted-small">24h change</span></div>
      <div className="movers-row">{movers.map((pair) => <button className="mover-card" key={pair.symbol} onClick={() => openPair(pair.symbol)}><span>{pair.symbol}</span><strong className={pair.change24h >= 0 ? 'positive' : 'negative'}>{pair.change24h >= 0 ? '+' : ''}{pair.change24h.toFixed(2)}%</strong><MarketSparkline points={pair.sparkline} positive={pair.change24h >= 0} /></button>)}</div>

      <AIInsight pair={selected} onOpen={() => openPair(selected.symbol)} />

      <div className="section-heading"><div><span className="eyebrow">MACRO</span><h2>What matters now</h2></div><button className="text-button" onClick={() => setOverlay('calendar')}>Open calendar <Icon name="chevron" size={14} /></button></div>
      <div className="macro-row">{news.slice(0, 3).map((item) => <button key={item.title} className="news-mini" onClick={() => setSelectedNews(item)}><div className="news-mini-top"><span>{item.currency}</span><span>{item.time}</span></div><strong>{item.title}</strong><small>{item.source}</small></button>)}</div>

      <div className="section-heading"><div><span className="eyebrow">REFERRAL</span><h2>Ready when you are.</h2></div></div>
      <GlassPanel className="referral-banner"><div><span className="eyebrow">BROKER ACCESS</span><h3>Trade through Exness</h3><p>BerreX provides information and links out for execution.</p></div><button className="primary-button" onClick={() => window.open(EXNESS_URL, '_blank', 'noopener,noreferrer')}>Open Exness <Icon name="external" size={15} /></button></GlassPanel>
    </>
  );

  const renderMarkets = () => (
    <>
      <div className="page-header"><span className="eyebrow">MARKETS</span><h1>Everything moving.</h1><p className="subtle">Tap any market for its full intelligence sheet.</p></div>
      <GlassPanel className="search-panel"><Icon name="search" size={18} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search EUR/USD, JPY, gold…" />{search && <button className="clear-button" onClick={() => setSearch('')}>×</button>}<button className="refresh-button" onClick={() => { setLoadingData(true); void fetchLiveMarkets(markets).then(setMarkets).finally(() => setLoadingData(false)); }}>{loadingData ? '…' : '↻'}</button></GlassPanel>
      <div className="filter-row">{(['All', 'Majors', 'Metals', 'Favorites'] as const).map((filter) => <button key={filter} className={`filter-chip ${marketFilter === filter ? 'active' : ''}`} onClick={() => setMarketFilter(filter)}>{filter}</button>)}</div>
      <div className="market-summary-row"><GlassPanel className="summary-card"><span>Pairs tracked</span><strong>{markets.length}</strong><small>FX + metals</small></GlassPanel><GlassPanel className="summary-card"><span>Biggest move</span><strong>{movers[0]?.symbol}</strong><small>{movers[0]?.change24h.toFixed(2)}%</small></GlassPanel><GlassPanel className="summary-card"><span>Data mode</span><strong>{API_ENABLED ? 'Provider' : 'Preview'}</strong><small>{lastSync ? formatAge(lastSync) : 'Local fallback'}</small></GlassPanel></div>
      <div className="pair-grid">{filteredMarkets.map((pair) => <PairCard key={pair.symbol} pair={pair} favorite={favoriteSymbols.includes(pair.symbol)} onOpen={() => openPair(pair.symbol)} onToggleFavorite={() => toggleFavorite(pair.symbol)} />)}</div>
    </>
  );

  const renderNews = () => (
    <>
      <div className="page-header"><span className="eyebrow">NEWSROOM</span><h1>The market, explained.</h1><p className="subtle">Forex headlines, macro context and event risk in one place.</p></div>
      <button className="news-feature" onClick={() => setSelectedNews(news[0] ?? null)}><div className="feature-glow" /><span className="live-pill">FEATURED STORY</span><span className="feature-tag">{news[0]?.currency ?? 'FX'}</span><h2>{news[0]?.title ?? 'Forex news'}</h2><p>{news[0]?.text ?? 'Latest market coverage.'}</p><div className="feature-foot"><span>{news[0]?.source}</span><span>Read story →</span></div></button>
      <div className="calendar-strip"><button className="calendar-card interactive-card" onClick={() => setOverlay('calendar')}><div className="calendar-icon"><Icon name="clock" size={18} /></div><div><span>Upcoming macro</span><strong>{events[0].event}</strong><small>{EVENTS[0].date}</small></div><span className="impact high">High</span></button></div>
      <div className="news-list">{news.map((item) => <button className="news-card interactive-card" key={item.title} onClick={() => setSelectedNews(item)}><div className="news-meta"><span>{item.currency}</span><span>{item.time}</span></div><h3>{item.title}</h3><p>{item.text}</p><div className="news-foot"><span>{item.source}</span><span className={`impact ${item.impact.toLowerCase()}`}>{item.impact}</span></div></button>)}</div>
    </>
  );

  const renderProfile = () => (
    <>
      <div className="page-header"><span className="eyebrow">BERREX</span><h1>Your workspace.</h1><p className="subtle">Personalize the market desk on this device.</p></div>
      <GlassPanel className="profile-card"><div className="avatar">B</div><div><strong>BerreX workspace</strong><span>{alerts.length} active alert{alerts.length === 1 ? '' : 's'} · {favoriteSymbols.length} favorites</span></div><button className="icon-button" onClick={() => setOverlay('notifications')}><Icon name="bell" size={17} /></button></GlassPanel>
      <div className="settings-group"><div className="settings-label">APPEARANCE</div><button className="setting-row" onClick={() => setDark((current) => !current)}><span className="setting-icon"><Icon name={dark ? 'moon' : 'sun'} size={18} /></span><span><strong>{dark ? 'Dark' : 'Light'} mode</strong><small>Saved on this device</small></span><span className="setting-value">{dark ? 'Dark' : 'Light'}</span></button></div>
      <div className="settings-group"><div className="settings-label">TOOLS</div><button className="setting-row" onClick={() => setOverlay('converter')}><span className="setting-icon"><Icon name="convert" size={18} /></span><span><strong>Currency converter</strong><small>Live FX conversion</small></span><Icon name="chevron" size={16} /></button><button className="setting-row separated" onClick={() => setOverlay('calendar')}><span className="setting-icon"><Icon name="calendar" size={18} /></span><span><strong>Economic calendar</strong><small>Upcoming market events</small></span><Icon name="chevron" size={16} /></button><button className="setting-row separated" onClick={() => setOverlay('alert')}><span className="setting-icon"><Icon name="bell" size={18} /></span><span><strong>Price alerts</strong><small>Watch selected markets</small></span><Icon name="chevron" size={16} /></button></div>
      <div className="settings-group"><div className="settings-label">REFERRAL</div><button className="setting-row" onClick={() => window.open(EXNESS_URL, '_blank', 'noopener,noreferrer')}><span className="setting-icon"><Icon name="external" size={18} /></span><span><strong>Trade on Exness</strong><small>Opens the broker website</small></span><Icon name="chevron" size={16} /></button></div>
      <GlassPanel className="legal-card"><div className="section-kicker"><Icon name="shield" size={15} /> RISK NOTICE</div><p>BerreX is an informational market tool. Prices, news and AI-generated explanations can be delayed, incomplete or incorrect. Nothing in the app is financial advice.</p></GlassPanel>
    </>
  );

  return (
    <div className="app-shell">
      <div className="app-glow glow-one" /><div className="app-glow glow-two" />
      <header className="topbar">
        <button className="brand-mark-button" onClick={() => setActiveTab('home')} aria-label="Go home"><div className="brand-mark"><span>Berre</span><b>X</b></div></button>
        <div className="topbar-actions"><button className={showFloatingTools ? 'top-tools-button top-tools-hidden' : 'top-tools-button'} onClick={() => setToolsOpen((open) => !open)} aria-label="Open tools"><Icon name="tools" size={17} /><span>Tools</span></button><button className="top-control" onClick={() => setOverlay('search')} aria-label="Search"><Icon name="search" size={18} /></button><button className="top-control" onClick={() => setDark((current) => !current)} aria-label="Toggle appearance"><Icon name={dark ? 'moon' : 'sun'} size={18} /></button><button className="top-control" onClick={() => setOverlay('notifications')} aria-label="Notifications"><Icon name="bell" size={18} /><span className="notification-dot" /></button></div>
      </header>
      <main className="content">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'markets' && renderMarkets()}
        {activeTab === 'news' && renderNews()}
        {activeTab === 'profile' && renderProfile()}
      </main>
      <BottomNav active={activeTab} onChange={setActiveTab} />

      <div className={showFloatingTools ? 'tools-dock visible' : 'tools-dock'}>
        <button className={toolsOpen ? 'tools-trigger active' : 'tools-trigger'} onClick={() => setToolsOpen((open) => !open)} aria-label="Open BerreX tools">
          <Icon name="tools" size={18} /><span>Tools</span><Icon name="chevron" size={14} />
        </button>
        {toolsOpen && <div className="tools-panel">
          <button onClick={() => { setOverlay('converter'); setToolsOpen(false); }}><span><Icon name="convert" size={17} /></span><strong>Convert</strong><small>FX calculator</small></button>
          <button onClick={() => { setOverlay('calendar'); setToolsOpen(false); }}><span><Icon name="calendar" size={17} /></span><strong>Calendar</strong><small>Macro events</small></button>
          <button onClick={() => { setOverlay('alert'); setAlertTarget(formatPrice(selected)); setToolsOpen(false); }}><span><Icon name="bell" size={17} /></span><strong>Alerts</strong><small>{alerts.length || 'Set one'}</small></button>
          <button onClick={() => { setActiveTab('markets'); setToolsOpen(false); }}><span><Icon name="search" size={17} /></span><strong>Explore</strong><small>Find a pair</small></button>
        </div>}
      </div>

      {sheetOpen && selected && <MarketTerminal pair={selected} markets={markets} aiText={aiText} aiLoading={aiLoading} onClose={() => setSheetOpen(false)} onAlert={() => { setAlertTarget(formatPrice(selected)); setOverlay('alert'); setSheetOpen(false); }} />}

      {overlay === 'notifications' && <Modal title="Notifications" eyebrow="YOUR DESK" onClose={() => setOverlay(null)}><div className="notification-list"><button onClick={() => { setOverlay('alert'); }}><span className="notification-icon"><Icon name="bell" size={17} /></span><span><strong>Price alerts</strong><small>{alerts.length ? `${alerts.length} market alert${alerts.length === 1 ? '' : 's'} saved.` : 'No alerts yet. Add one from a pair.'}</small></span><Icon name="chevron" size={16} /></button><button onClick={() => { setOverlay('calendar'); }}><span className="notification-icon"><Icon name="calendar" size={17} /></span><span><strong>Macro calendar</strong><small>{events.length} upcoming events in the current preview.</small></span><Icon name="chevron" size={16} /></button><button onClick={() => { setActiveTab('news'); setOverlay(null); }}><span className="notification-icon"><Icon name="news" size={17} /></span><span><strong>Newsroom</strong><small>{news.length} stories available.</small></span><Icon name="chevron" size={16} /></button></div></Modal>}

      {overlay === 'converter' && <Modal title="Currency converter" eyebrow="LIVE FX TOOL" onClose={() => setOverlay(null)}><div className="converter-form"><label>Amount<input type="number" value={converterAmount} onChange={(e) => setConverterAmount(e.target.value)} /></label><label>Pair<select value={converterPair} onChange={(e) => setConverterPair(e.target.value)}>{markets.map((pair) => <option key={pair.symbol}>{pair.symbol}</option>)}</select></label><button className="primary-button full" onClick={() => void runConversion()}>Convert now</button>{converted !== null && <div className="conversion-result"><span>{converterAmount} {converterPair.split('/')[0]}</span><strong>{converted.toFixed(converterPair.includes('JPY') || converterPair.includes('XAU') ? 2 : 5)} {converterPair.split('/')[1]}</strong></div>}</div></Modal>}

      {overlay === 'alert' && <Modal title="Price alerts" eyebrow="CONDITIONAL ALERT" onClose={() => setOverlay(null)}><div className="alert-picker"><p>Set a price condition for {selected.symbol}. Alerts are stored on this device; server push delivery will be added through the data backend.</p><div className="alert-current"><span>Current</span><strong>{formatPrice(selected)}</strong></div><div className="alert-condition-grid"><label>Condition<select value={alertCondition} onChange={(event) => setAlertCondition(event.target.value as PriceAlertCondition)}><option value="above">Price above</option><option value="below">Price below</option></select></label><label>Target<input inputMode="decimal" value={alertTarget} onChange={(event) => setAlertTarget(event.target.value)} placeholder={formatPrice(selected)} /></label></div><button className="primary-button full" onClick={createAlert}>Save {selected.symbol} alert</button><div className="alert-market-list">{markets.map((pair) => <button key={pair.symbol} className={alerts.includes(pair.symbol) ? 'selected' : ''} onClick={() => { setSelectedSymbol(pair.symbol); setAlertTarget(formatPrice(pair)); }}><span>{pair.symbol}</span><strong className={pair.change24h >= 0 ? 'positive' : 'negative'}>{pair.change24h >= 0 ? '+' : ''}{pair.change24h.toFixed(2)}%</strong></button>)}</div>{priceAlerts.length > 0 && <div className="saved-alert-list"><div className="settings-label">SAVED CONDITIONS</div>{priceAlerts.map((alert) => <button key={alert.createdAt} onClick={() => { const pair = markets.find((item) => item.symbol === alert.symbol); if (pair) { setSelectedSymbol(pair.symbol); setAlertCondition(alert.condition); setAlertTarget(String(alert.target)); } }}><span>{alert.symbol} {alert.condition === 'above' ? '>' : '<'} {alert.target}</span><small>Local alert</small></button>)}</div>}</div></Modal>}

      {overlay === 'calendar' && <Modal title="Economic calendar" eyebrow="MACRO EVENTS" wide onClose={() => setOverlay(null)}><div className="event-list">{events.map((event: EconomicEvent) => <button className="event-row" key={event.event}><div><span>{event.currency} · {event.country}</span><strong>{event.event}</strong><small>{event.date}</small></div><span className={`impact ${event.impact.toLowerCase()}`}>{event.impact}</span></button>)}</div><p className="modal-note">For production, this panel is wired to FMP's economic calendar endpoint when the FMP key is configured.</p></Modal>}

      {overlay === 'search' && <Modal title="Search BerreX" eyebrow="QUICK FIND" onClose={() => setOverlay(null)}><div className="search-modal"><div className="search-panel"><Icon name="search" size={18} /><input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Pair, currency or keyword…" /></div><div className="search-results">{markets.filter((p) => !search || p.symbol.toLowerCase().includes(search.toLowerCase()) || p.base.toLowerCase().includes(search.toLowerCase()) || p.quote.toLowerCase().includes(search.toLowerCase())).map((pair) => <button key={pair.symbol} onClick={() => { setOverlay(null); void openPair(pair.symbol); }}><span>{pair.symbol}</span><strong>{formatPrice(pair)}</strong></button>)}</div></div></Modal>}

      {alertNotice && <div className="alert-toast" role="status"><span className="alert-toast-dot" /><div><strong>Price alert triggered</strong><small>{alertNotice}</small></div><button onClick={() => setAlertNotice(null)}>×</button></div>}

      {selectedNews && <Modal title={selectedNews.title} eyebrow={selectedNews.currency + ' · ' + selectedNews.source} onClose={() => setSelectedNews(null)}><article className="article-reader"><div className="article-cover"><span>BERREX</span><b>{selectedNews.currency}</b></div><p className="article-lead">{selectedNews.text || 'Market coverage from the BerreX newsroom.'}</p><p>Read the original publication for the full story and source context. BerreX surfaces headlines for market awareness and does not independently verify every publisher claim.</p>{selectedNews.url && <button className="primary-button full" onClick={() => window.open(selectedNews.url, '_blank', 'noopener,noreferrer')}>Open original article <Icon name="external" size={15} /></button>}</article></Modal>}
    </div>
  );
}
