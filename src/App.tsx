import { useEffect, useMemo, useState } from 'react';
import { BottomNav } from './components/BottomNav';
import { GlassPanel } from './components/GlassPanel';
import { AIInsight } from './components/AIInsight';
import { PairCard } from './components/PairCard';
import { MarketSparkline } from './components/MarketSparkline';
import { Icon } from './lib/icons';
import { DEFAULT_SELECTED, INITIAL_MARKETS, NEWS } from './data/market';
import { tickMarkets } from './services/market';
import { requestAiInsight } from './services/ai';
import type { MarketPair } from './types';

type Tab = 'home' | 'markets' | 'news' | 'profile';

const EXNESS_URL = import.meta.env.VITE_EXNESS_REFERRAL_URL || 'https://www.exness.com/';

function formatPrice(pair: MarketPair) {
  return pair.price.toFixed(pair.symbol === 'USD/JPY' || pair.symbol === 'XAU/USD' ? 2 : 5);
}

function useClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = window.setInterval(() => setTime(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return time;
}

export default function App() {
  const [markets, setMarkets] = useState(INITIAL_MARKETS);
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [selectedSymbol, setSelectedSymbol] = useState(DEFAULT_SELECTED);
  const [search, setSearch] = useState('');
  const [favoriteSymbols, setFavoriteSymbols] = useState<string[]>(['EUR/USD', 'USD/JPY']);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [dark, setDark] = useState(false);
  const time = useClock();

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  useEffect(() => {
    const id = window.setInterval(() => setMarkets((current) => tickMarkets(current)), 1600);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('berrex-theme');
    if (saved === 'dark') setDark(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem('berrex-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const selected = markets.find((pair) => pair.symbol === selectedSymbol) ?? markets[0];

  const filteredMarkets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return markets.filter((pair) =>
      !term || pair.symbol.toLowerCase().includes(term) || pair.base.toLowerCase().includes(term) || pair.quote.toLowerCase().includes(term)
    );
  }, [markets, search]);

  const favorites = markets.filter((pair) => favoriteSymbols.includes(pair.symbol));

  const openPair = async (symbol: string) => {
    setSelectedSymbol(symbol);
    setSheetOpen(true);
    setAiText('');
    setAiLoading(true);
    const pair = markets.find((item) => item.symbol === symbol);
    if (!pair) return;
    try {
      setAiText(await requestAiInsight(pair));
    } catch {
      setAiText('AI analysis is temporarily unavailable. Review the live chart and economic calendar before acting.');
    } finally {
      setAiLoading(false);
    }
  };

  const toggleFavorite = (symbol: string) => {
    setFavoriteSymbols((current) =>
      current.includes(symbol) ? current.filter((item) => item !== symbol) : [...current, symbol]
    );
  };

  const renderHome = () => (
    <>
      <div className="top-row">
        <div>
          <div className="eyebrow">GLOBAL MARKETS</div>
          <h1>Good morning.</h1>
          <p className="subtle">Track the moves that matter.</p>
        </div>
        <button className="icon-button" aria-label="Notifications">
          <Icon name="bell" size={20} />
          <span className="notification-dot" />
        </button>
      </div>

      <GlassPanel className="hero-card">
        <div className="hero-topline">
          <span className="live-pill"><span className="live-dot" /> Demo stream</span>
          <span className="timestamp">{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className="hero-symbol">
          <div>
            <span className="section-kicker">FOCUS PAIR</span>
            <h2>{selected.symbol}</h2>
          </div>
          <button className="mini-star" onClick={() => toggleFavorite(selected.symbol)} aria-label="Toggle favorite">
            <Icon name="star" size={17} fill={favoriteSymbols.includes(selected.symbol) ? 'currentColor' : 'none'} />
          </button>
        </div>
        <div className="hero-price-row">
          <strong>{formatPrice(selected)}</strong>
          <span className={selected.change24h >= 0 ? 'positive' : 'negative'}>
            {selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}%
          </span>
        </div>
        <MarketSparkline points={selected.sparkline} positive={selected.change24h >= 0} large />
        <div className="hero-actions">
          <button className="primary-button" onClick={() => window.open(EXNESS_URL, '_blank', 'noopener,noreferrer')}>
            Trade on Exness <Icon name="arrow" size={15} />
          </button>
          <button className="secondary-button" onClick={() => openPair(selected.symbol)}>Analyze</button>
        </div>
        <div className="disclaimer-line"><Icon name="shield" size={14} /> Informational only — not financial advice.</div>
      </GlassPanel>

      <div className="section-heading">
        <div>
          <span className="eyebrow">WATCHLIST</span>
          <h2>Markets</h2>
        </div>
        <button className="text-button" onClick={() => setActiveTab('markets')}>See all <Icon name="chevron" size={14} /></button>
      </div>

      <div className="pair-grid compact">
        {favorites.slice(0, 2).map((pair) => (
          <PairCard
            key={pair.symbol}
            pair={pair}
            favorite={favoriteSymbols.includes(pair.symbol)}
            onOpen={() => openPair(pair.symbol)}
            onToggleFavorite={() => toggleFavorite(pair.symbol)}
          />
        ))}
      </div>

      <AIInsight pair={selected} onOpen={() => openPair(selected.symbol)} />

      <div className="section-heading">
        <div>
          <span className="eyebrow">MACRO</span>
          <h2>What's moving</h2>
        </div>
      </div>
      <div className="macro-row">
        {NEWS.slice(0, 3).map((item) => (
          <button key={item.title} className="news-mini" onClick={() => setActiveTab('news')}>
            <div className="news-mini-top"><span>{item.currency}</span><span>{item.time}</span></div>
            <strong>{item.title}</strong>
          </button>
        ))}
      </div>
    </>
  );

  const renderMarkets = () => (
    <>
      <div className="page-header">
        <span className="eyebrow">MARKETS</span>
        <h1>Find your pair.</h1>
        <p className="subtle">Major forex, crosses and gold.</p>
      </div>

      <GlassPanel className="search-panel">
        <Icon name="search" size={18} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search EUR/USD, JPY, gold…" />
        {search && <button className="clear-button" onClick={() => setSearch('')}>×</button>}
      </GlassPanel>

      <div className="filter-row">
        <span className="filter-chip active">All</span>
        <span className="filter-chip">FX Majors</span>
        <span className="filter-chip">Crosses</span>
        <span className="filter-chip">Metals</span>
      </div>

      <div className="pair-grid">
        {filteredMarkets.map((pair) => (
          <PairCard
            key={pair.symbol}
            pair={pair}
            favorite={favoriteSymbols.includes(pair.symbol)}
            onOpen={() => openPair(pair.symbol)}
            onToggleFavorite={() => toggleFavorite(pair.symbol)}
          />
        ))}
      </div>
    </>
  );

  const renderNews = () => (
    <>
      <div className="page-header">
        <span className="eyebrow">MACRO & NEWS</span>
        <h1>Stay ahead.</h1>
        <p className="subtle">Events that can change the tape.</p>
      </div>

      <div className="calendar-strip">
        <GlassPanel className="calendar-card">
          <div className="calendar-icon"><Icon name="clock" size={18} /></div>
          <div><span>Next high impact</span><strong>U.S. labor data</strong><small>Today · USD</small></div>
          <span className="impact high">High</span>
        </GlassPanel>
      </div>

      <div className="news-list">
        {NEWS.map((item) => (
          <GlassPanel className="news-card" key={item.title}>
            <div className="news-meta">
              <span>{item.currency}</span>
              <span>{item.time}</span>
            </div>
            <h3>{item.title}</h3>
            <div className="news-foot">
              <span>{item.source}</span>
              <span className={`impact ${item.impact.toLowerCase()}`}>{item.impact}</span>
            </div>
          </GlassPanel>
        ))}
      </div>
    </>
  );

  const renderProfile = () => (
    <>
      <div className="page-header">
        <span className="eyebrow">BERREX</span>
        <h1>Settings.</h1>
        <p className="subtle">Your market workspace.</p>
      </div>

      <GlassPanel className="profile-card">
        <div className="avatar">B</div>
        <div><strong>BerreX workspace</strong><span>Market intelligence mode</span></div>
      </GlassPanel>

      <div className="settings-group">
        <div className="settings-label">APPEARANCE</div>
        <button className="setting-row" onClick={() => setDark((current) => !current)}>
          <span className="setting-icon"><Icon name={dark ? 'moon' : 'sun'} size={18} /></span>
          <span><strong>{dark ? 'Dark' : 'Light'} mode</strong><small>Saved on this device</small></span>
          <span className="setting-value">{dark ? 'Dark' : 'Light'}</span>
        </button>
      </div>

      <div className="settings-group">
        <div className="settings-label">REFERRAL</div>
        <button className="setting-row" onClick={() => window.open(EXNESS_URL, '_blank', 'noopener,noreferrer')}>
          <span className="setting-icon"><Icon name="external" size={18} /></span>
          <span><strong>Trade on Exness</strong><small>Opens the broker website</small></span>
          <Icon name="chevron" size={16} />
        </button>
      </div>

      <GlassPanel className="legal-card">
        <div className="section-kicker"><Icon name="shield" size={15} /> RISK NOTICE</div>
        <p>BerreX is an informational market tool. Prices can be delayed or incomplete. AI explanations are generated from the data available to the system and are not financial advice.</p>
      </GlassPanel>
    </>
  );

  return (
    <div className="app-shell">
      <div className="app-glow glow-one" />
      <div className="app-glow glow-two" />

      <header className="topbar">
        <div className="brand-mark"><span>Berre</span><b>X</b></div>
        <div className="topbar-actions">
          <button className="top-control" onClick={() => setDark((current) => !current)} aria-label="Toggle appearance">
            <Icon name={dark ? 'moon' : 'sun'} size={18} />
          </button>
          <button className="top-control" onClick={() => setActiveTab('profile')} aria-label="Open profile">
            <Icon name="profile" size={18} />
          </button>
        </div>
      </header>

      <main className="content">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'markets' && renderMarkets()}
        {activeTab === 'news' && renderNews()}
        {activeTab === 'profile' && renderProfile()}
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} />

      {sheetOpen && selected && (
        <div className="sheet-backdrop" role="presentation" onClick={() => setSheetOpen(false)}>
          <div className="pair-sheet" role="dialog" aria-modal="true" aria-labelledby="pair-sheet-title" onClick={(event) => event.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="sheet-header">
              <div>
                <span className="eyebrow">PAIR ANALYSIS</span>
                <h2 id="pair-sheet-title">{selected.symbol}</h2>
              </div>
              <button className="icon-button" onClick={() => setSheetOpen(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="sheet-price"><strong>{formatPrice(selected)}</strong><span className={selected.change24h >= 0 ? 'positive' : 'negative'}>{selected.change24h >= 0 ? '+' : ''}{selected.change24h.toFixed(2)}%</span></div>
            <MarketSparkline points={selected.sparkline} positive={selected.change24h >= 0} large />
            <div className="sheet-stats">
              <div><span>RSI</span><strong>{selected.bias === 'bullish' ? '62' : selected.bias === 'bearish' ? '44' : '53'}</strong></div>
              <div><span>Support</span><strong>{(selected.price * 0.998).toFixed(selected.symbol === 'USD/JPY' || selected.symbol === 'XAU/USD' ? 2 : 5)}</strong></div>
              <div><span>Resistance</span><strong>{(selected.price * 1.002).toFixed(selected.symbol === 'USD/JPY' || selected.symbol === 'XAU/USD' ? 2 : 5)}</strong></div>
            </div>
            <GlassPanel className="sheet-ai">
              <div className="section-kicker"><span className="spark-icon"><Icon name="spark" size={15} /></span> AI SUMMARY</div>
              {aiLoading ? <div className="loading-line">Generating analysis…</div> : <p>{aiText}</p>}
            </GlassPanel>
            <div className="sheet-actions">
              <button className="primary-button large" onClick={() => window.open(EXNESS_URL, '_blank', 'noopener,noreferrer')}>Trade on Exness <Icon name="external" size={16} /></button>
              <button className="secondary-button large" onClick={() => setSheetOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
