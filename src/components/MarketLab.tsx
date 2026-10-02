import { useEffect, useMemo, useState } from 'react';
import type { EconomicEvent, MarketPair, NewsItem } from '../types';
import { ema, rsi, sma } from '../lib/technical';
import { Icon } from '../lib/icons';
import { cloudConfigured, getCloudSession, loadCommunityIdeas, loadWorkspace, publishCommunityIdea, saveWorkspace as saveCloudWorkspace, signIn, signOut, signUp } from '../services/cloud';

type Props = {
  markets: MarketPair[];
  events: EconomicEvent[];
  news: NewsItem[];
  favoriteSymbols: string[];
  onToggleFavorite: (symbol: string) => void;
  onOpenPair: (symbol: string) => void;
  onRefresh: () => void;
};

type LabTab = 'overview' | 'screener' | 'risk' | 'macro' | 'workspace';

const CURRENCIES = ['USD','EUR','GBP','JPY','AUD','CAD','CHF','NZD'];
const JOURNAL_KEY = 'berrex-journal-v1';
const IDEAS_KEY = 'berrex-ideas-v1';
const WORKSPACE_KEY = 'berrex-workspace-v1';

function corr(a:number[],b:number[]) {
  const n=Math.min(a.length,b.length);
  if(n<3)return 0;
  const aa=a.slice(-n),bb=b.slice(-n);
  const ma=aa.reduce((s,v)=>s+v,0)/n, mb=bb.reduce((s,v)=>s+v,0)/n;
  const num=aa.reduce((s,v,i)=>s+(v-ma)*(bb[i]-mb),0);
  const da=Math.sqrt(aa.reduce((s,v)=>s+(v-ma)**2,0));
  const db=Math.sqrt(bb.reduce((s,v)=>s+(v-mb)**2,0));
  return da&&db?num/(da*db):0;
}
function pipSize(pair:MarketPair){return pair.symbol.includes('JPY')?0.01:pair.symbol.includes('XAU')?0.1:0.0001}
function digits(pair:MarketPair){return pair.symbol.includes('JPY')||pair.symbol.includes('XAU')?2:5}
function currencyScore(markets:MarketPair[],currency:string){
  const samples=markets.flatMap(p=>p.base===currency?[p.change24h]:p.quote===currency?[-p.change24h]:[]);
  return samples.length?samples.reduce((a,b)=>a+b,0)/samples.length:0;
}
function todayCountdown(dateText:string){
  const match=dateText.match(/Today\s*[·-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if(!match)return null;
  let h=Number(match[1]); const m=Number(match[2]); const ap=match[3]?.toUpperCase();
  if(ap==='PM'&&h<12)h+=12;if(ap==='AM'&&h===12)h=0;
  const now=new Date(), target=new Date(now);
  target.setUTCHours(h,m,0,0); return Math.max(0,target.getTime()-now.getTime());
}
function duration(ms:number|null){
  if(ms===null)return 'Calendar time';
  const minutes=Math.floor(ms/60000);
  return minutes<60?(minutes+'m'):(Math.floor(minutes/60)+'h '+(minutes%60)+'m');
}

export function MarketLab({markets,events,news,favoriteSymbols,onToggleFavorite,onOpenPair,onRefresh}:Props){
  const [tab,setTab]=useState<LabTab>('overview');
  const [query,setQuery]=useState('');
  const [bias,setBias]=useState<'all'|'bullish'|'bearish'>('all');
  const [minMove,setMinMove]=useState('0');
  const [rsiFilter,setRsiFilter]=useState('none');
  const [riskPair,setRiskPair]=useState(markets[0]?.symbol??'EUR/USD');
  const [balance,setBalance]=useState('1000');
  const [risk,setRisk]=useState('1');
  const [entry,setEntry]=useState(String(markets[0]?.price??''));
  const [stop,setStop]=useState('');
  const [target,setTarget]=useState('');
  const [workspaceName,setWorkspaceName]=useState(()=>localStorage.getItem(WORKSPACE_KEY)||'My BerreX Desk');
  const [journal,setJournal]=useState<Array<{id:number;symbol:string;side:string;result:string;note:string}>>(()=>{
    try{return JSON.parse(localStorage.getItem(JOURNAL_KEY)||'[]')}catch{return []}
  });
  const [ideas,setIdeas]=useState<Array<{id:number;symbol:string;title:string;bias:string;note:string}>>(()=>{
    try{return JSON.parse(localStorage.getItem(IDEAS_KEY)||'[]')}catch{return []}
  });
  const [journalForm,setJournalForm]=useState({side:'BUY',result:'',note:''});
  const [ideaForm,setIdeaForm]=useState({title:'',bias:'Bullish',note:''});
  const [cloudSession,setCloudSession]=useState(getCloudSession());
  const [cloudEmail,setCloudEmail]=useState('');
  const [cloudPassword,setCloudPassword]=useState('');
  const [cloudMode,setCloudMode]=useState<'signin'|'signup'>('signin');
  const [cloudBusy,setCloudBusy]=useState(false);
  const [cloudError,setCloudError]=useState('');
  const [cloudIdeas,setCloudIdeas]=useState<Array<{id:string;user_id:string;symbol:string;title:string;bias:string;note:string;created_at:string}>>([]);

  const screened=useMemo(()=>markets.filter(pair=>{
    const q=query.trim().toLowerCase();
    const matchQ=!q||pair.symbol.toLowerCase().includes(q)||pair.base.toLowerCase().includes(q)||pair.quote.toLowerCase().includes(q);
    const matchB=bias==='all'||pair.bias===bias;
    return matchQ&&matchB&&Math.abs(pair.change24h)>=(Number(minMove)||0);
  }).map(pair=>{
    const value=rsi(pair.sparkline);
    const fast=ema(pair.sparkline,9).at(-1)??pair.price;
    const slow=sma(pair.sparkline,Math.min(20,Math.max(2,pair.sparkline.length))).at(-1)??pair.price;
    return {pair,rsi:value,trend:fast>=slow?'Up':'Down'};
  }).filter(row=>rsiFilter==='none'||(rsiFilter==='oversold'?row.rsi<30:row.rsi>70)),[markets,query,bias,minMove,rsiFilter]);

  const heatmap=CURRENCIES.map(currency=>({currency,value:currencyScore(markets,currency)})).sort((a,b)=>b.value-a.value);
  const matrix=markets.slice(0,6).map(a=>markets.slice(0,6).map(b=>corr(a.sparkline,b.sparkline)));
  const rp=markets.find(p=>p.symbol===riskPair)||markets[0];
  const bal=Number(balance)||0, riskAmount=bal*((Number(risk)||0)/100);
  const entryValue=Number(entry)||rp?.price||0, stopValue=Number(stop)||entryValue, targetValue=Number(target)||entryValue;
  const stopDistance=Math.abs(entryValue-stopValue), targetDistance=Math.abs(targetValue-entryValue);
  const pips=rp?stopDistance/pipSize(rp):0, rr=stopDistance>0?targetDistance/stopDistance:0;
  const perUnitPip=rp?.symbol.includes('JPY')?0.01/Math.max(entryValue,1):rp?.symbol.includes('XAU')?0.1:0.0001;
  const units=perUnitPip&&pips?riskAmount/(pips*perUnitPip):0, lots=units/100000;

  const saveWorkspace=async()=>{
    const value=workspaceName.trim()||'My BerreX Desk';
    setWorkspaceName(value);
    localStorage.setItem(WORKSPACE_KEY,value);
    if(cloudSession){
      try{await saveCloudWorkspace(value,{favorites:favoriteSymbols,journal,ideas});}catch(error){setCloudError(error instanceof Error?error.message:'Cloud sync failed.')}
    }
  };
  const saveJournal=()=>{if(!rp||!journalForm.note.trim())return;const next=[{id:Date.now(),symbol:rp.symbol,...journalForm},...journal];setJournal(next);localStorage.setItem(JOURNAL_KEY,JSON.stringify(next));setJournalForm(v=>({...v,result:'',note:v.note}))};
  const saveIdea=async()=>{
    if(!rp||!ideaForm.title.trim())return;
    if(cloudSession){
      try{
        await publishCommunityIdea({symbol:rp.symbol,...ideaForm});
        setIdeaForm({title:'',bias:'Bullish',note:''});
        const remote=await loadCommunityIdeas();
        setCloudIdeas(remote);
      }catch(error){setCloudError(error instanceof Error?error.message:'Community publish failed.')}
      return;
    }
    const next=[{id:Date.now(),symbol:rp.symbol,...ideaForm},...ideas];
    setIdeas(next);
    localStorage.setItem(IDEAS_KEY,JSON.stringify(next));
    setIdeaForm({title:'',bias:'Bullish',note:''});
  };
  const handleCloudAuth=async()=>{
    if(!cloudConfigured)return;
    setCloudBusy(true);setCloudError('');
    try{
      const session=cloudMode==='signin'?await signIn(cloudEmail,cloudPassword):await signUp(cloudEmail,cloudPassword);
      if(session.access_token)setCloudSession(session);
      else setCloudError('Check your email if confirmation is required, then sign in.');
    }catch(error){setCloudError(error instanceof Error?error.message:'Authentication failed.')}finally{setCloudBusy(false)}
  };
  const handleCloudLogout=()=>{signOut();setCloudSession(null);setCloudIdeas([])};
  useEffect(()=>{
    if(!cloudSession)return;
    void Promise.all([loadWorkspace(),loadCommunityIdeas()]).then(([workspace,remoteIdeas])=>{
      if(workspace?.workspace_name){setWorkspaceName(workspace.workspace_name);localStorage.setItem(WORKSPACE_KEY,workspace.workspace_name)}
      if(Array.isArray(remoteIdeas))setCloudIdeas(remoteIdeas);
    }).catch(error=>setCloudError(error instanceof Error?error.message:'Cloud load failed.'));
  },[cloudSession]);

  const tabs=[['overview','Overview'],['screener','Screener'],['risk','Risk'],['macro','Macro'],['workspace','Workspace']] as const;

  return <div className="market-lab">
    <div className="page-header"><span className="eyebrow">BERREX MARKET LAB</span><h1>One desk. Every angle.</h1><p className="subtle">Screener, risk, macro, positioning, correlation, alerts, journal, broker and workspace tools around the same market data.</p></div>
    <div className="lab-tabs">{tabs.map(([id,label])=><button key={id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{label}</button>)}</div>

    {tab==='overview'&&<>
      <div className="lab-hero-grid">
        <button className="lab-feature-card" onClick={()=>setTab('screener')}><span className="eyebrow">01 · SCREENER</span><h2>Find setups faster.</h2><p>Filter the tracked universe by movement, bias and momentum.</p><strong>Open screener →</strong></button>
        <button className="lab-feature-card accent" onClick={()=>setTab('risk')}><span className="eyebrow">07 · RISK DESK</span><h2>Know the risk before the trade.</h2><p>Position size, pips, risk amount and R:R in one view.</p><strong>Open risk desk →</strong></button>
      </div>
      <div className="lab-grid-3"><div className="lab-stat-card"><span>Markets</span><strong>{markets.length}</strong><small>Tracked universe</small></div><div className="lab-stat-card"><span>Favorites</span><strong>{favoriteSymbols.length}</strong><small>Saved locally</small></div><div className="lab-stat-card"><span>High-impact events</span><strong>{events.filter(e=>e.impact==='High').length}</strong><small>Current window</small></div></div>
      <div className="lab-section-heading"><div><span className="eyebrow">02 · HEATMAP</span><h2>Currency temperature</h2></div><span className="muted-small">Derived from tracked pair changes</span></div>
      <div className="currency-heatmap">{heatmap.map(item=><button key={item.currency} className={'heat-cell '+(item.value>=0?'positive-cell':'negative-cell')}><span>{item.currency}</span><strong>{item.value>=0?'+':''}{item.value.toFixed(2)}%</strong></button>)}</div>
      <div className="lab-section-heading"><div><span className="eyebrow">03 · SENTIMENT</span><h2>BerreX positioning pulse</h2></div><span className="muted-small">Derived, not broker positioning</span></div>
      <div className="sentiment-list">{heatmap.slice(0,6).map(item=>{const score=Math.max(0,Math.min(100,50+item.value*45));return <div className="sentiment-row" key={item.currency}><span>{item.currency}</span><div><i style={{width:score+'%'}}/></div><strong>{score.toFixed(0)}%</strong></div>})}</div>
      <div className="lab-section-heading"><div><span className="eyebrow">04 · CORRELATION</span><h2>Cross-market relationships</h2></div><span className="muted-small">Sparkline Pearson correlation</span></div>
      <div className="correlation-wrap"><div className="correlation-head"><span/>{markets.slice(0,6).map(p=><span key={p.symbol}>{p.base}</span>)}</div>{markets.slice(0,6).map((a,row)=><div className="correlation-row" key={a.symbol}><strong>{a.symbol}</strong>{markets.slice(0,6).map((b,col)=><span key={b.symbol} className={matrix[row][col]>=0?'corr-positive':'corr-negative'}>{matrix[row][col].toFixed(2)}</span>)}</div>)}</div>
    </>}

    {tab==='screener'&&<>
      <div className="lab-filter-card">
        <label>Search<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="EUR, USD/JPY, gold…"/></label>
        <label>Bias<select value={bias} onChange={e=>setBias(e.target.value as typeof bias)}><option value="all">All</option><option value="bullish">Bullish</option><option value="bearish">Bearish</option></select></label>
        <label>Min move<input inputMode="decimal" value={minMove} onChange={e=>setMinMove(e.target.value)}/></label>
        <label>RSI<select value={rsiFilter} onChange={e=>setRsiFilter(e.target.value)}><option value="none">Any</option><option value="oversold">Below 30</option><option value="overbought">Above 70</option></select></label>
      </div>
      <div className="screener-list">{screened.map(({pair,value,trend})=><div className="screener-row" key={pair.symbol} onClick={()=>onOpenPair(pair.symbol)}><div><strong>{pair.symbol}</strong><small>{trend} trend · RSI {value.toFixed(1)}</small></div><strong>{pair.price.toFixed(digits(pair))}</strong><span className={pair.change24h>=0?'positive':'negative'}>{pair.change24h>=0?'+':''}{pair.change24h.toFixed(2)}%</span><span>{favoriteSymbols.includes(pair.symbol)?'★':'☆'}</span><button className="mini-star" onClick={e=>{e.stopPropagation();onToggleFavorite(pair.symbol)}} aria-label="Toggle favorite"><Icon name="star" size={14} fill={favoriteSymbols.includes(pair.symbol)?'currentColor':'none'}/></button></div>)}</div>
      <div className="lab-note">Technical values are computed from BerreX price history and are informational, not a trading recommendation.</div>
    </>}

    {tab==='risk'&&rp&&<>
      <div className="lab-filter-card risk-inputs">
        <label>Pair<select value={rp.symbol} onChange={e=>{setRiskPair(e.target.value);const p=markets.find(x=>x.symbol===e.target.value);if(p)setEntry(String(p.price))}}>{markets.map(p=><option key={p.symbol}>{p.symbol}</option>)}</select></label>
        <label>Account balance<input inputMode="decimal" value={balance} onChange={e=>setBalance(e.target.value)}/></label>
        <label>Risk %<input inputMode="decimal" value={risk} onChange={e=>setRisk(e.target.value)}/></label>
        <label>Entry<input inputMode="decimal" value={entry} onChange={e=>setEntry(e.target.value)}/></label>
        <label>Stop loss<input inputMode="decimal" value={stop} onChange={e=>setStop(e.target.value)} placeholder="Stop price"/></label>
        <label>Take profit<input inputMode="decimal" value={target} onChange={e=>setTarget(e.target.value)} placeholder="Target price"/></label>
      </div>
      <div className="lab-grid-4"><div className="lab-stat-card"><span>Risk amount</span><strong>{riskAmount.toFixed(2)}</strong><small>Account currency</small></div><div className="lab-stat-card"><span>Stop distance</span><strong>{pips.toFixed(1)} pips</strong><small>Estimated</small></div><div className="lab-stat-card"><span>Position size</span><strong>{Math.max(0,lots).toFixed(2)} lots</strong><small>Model estimate</small></div><div className="lab-stat-card"><span>Reward / risk</span><strong>{rr?rr.toFixed(2)+'R':'—'}</strong><small>Target vs stop</small></div></div>
      <div className="risk-visual"><div className="risk-bar"><span style={{width:Math.min(100,Math.max(0,50+(rr?Math.log10(Math.max(1,rr))*18:0)))+'%'}}/></div><p>Actual contract size, margin, leverage and broker pricing can differ.</p></div>
      <div className="pip-card"><span>{rp.symbol} pip size</span><strong>{pipSize(rp)}</strong><span>Current</span><strong>{rp.price.toFixed(digits(rp))}</strong></div>
    </>}

    {tab==='macro'&&<>
      <div className="macro-command-bar"><button className="primary-button" onClick={onRefresh}><Icon name="calendar" size={15}/>Refresh data</button><span>{events.length} events · {news.length} stories</span></div>
      <div className="lab-section-heading"><div><span className="eyebrow">05 · MACRO</span><h2>Event radar</h2></div></div>
      <div className="enhanced-event-list">{events.map(event=><button className="enhanced-event" key={event.event}><div><span>{event.currency} · {event.country}</span><strong>{event.event}</strong><small>{event.date}</small></div><div><b className={'impact '+event.impact.toLowerCase()}>{event.impact}</b><small>{duration(todayCountdown(event.date))}</small></div></button>)}</div>
      <div className="lab-section-heading"><div><span className="eyebrow">06 · NEWS → PRICE</span><h2>Market reaction desk</h2></div></div>
      <div className="news-reaction-grid">{news.slice(0,8).map(item=>{const related=markets.filter(p=>p.base===item.currency||p.quote===item.currency).sort((a,b)=>Math.abs(b.change24h)-Math.abs(a.change24h)).slice(0,2);return <button className="news-reaction-card" key={item.title} onClick={()=>related[0]&&onOpenPair(related[0].symbol)}><div className="news-meta"><span>{item.currency}</span><span>{item.time}</span></div><strong>{item.title}</strong><p>{item.text||'Open the related market to inspect current price action.'}</p><div className="reaction-pairs">{related.map(p=><span key={p.symbol}>{p.symbol} <b className={p.change24h>=0?'positive':'negative'}>{p.change24h>=0?'+':''}{p.change24h.toFixed(2)}%</b></span>)}</div></button>})}</div>
      <div className="lab-section-heading"><div><span className="eyebrow">08 · ALERT ENGINE</span><h2>Alerts beyond price</h2></div></div>
      <div className="alert-feature-grid"><div className="lab-note-card"><Icon name="bell" size={16}/><strong>Price</strong><p>Threshold alerts are already supported in BerreX.</p></div><div className="lab-note-card"><Icon name="chart" size={16}/><strong>Technical</strong><p>Use screener conditions for RSI and trend monitoring.</p></div><div className="lab-note-card"><Icon name="calendar" size={16}/><strong>Macro</strong><p>Plan around high-impact releases and countdowns.</p></div></div>
    </>}

    {tab==='workspace'&&<>
      <div className="workspace-card"><div><span className="eyebrow">09 · WORKSPACE</span><h2>{workspaceName}</h2><p>Favorites, preferences, journal and ideas are saved on this device.</p></div><div className="workspace-edit"><input value={workspaceName} onChange={e=>setWorkspaceName(e.target.value)}/><button className="primary-button" onClick={saveWorkspace}>Save</button></div></div>
      <div className="lab-section-heading"><div><span className="eyebrow">10 · JOURNAL</span><h2>Private trade journal</h2></div></div>
      <div className="journal-form"><select value={journalForm.side} onChange={e=>setJournalForm(v=>({...v,side:e.target.value}))}><option>BUY</option><option>SELL</option></select><input value={journalForm.result} onChange={e=>setJournalForm(v=>({...v,result:e.target.value}))} placeholder="Result e.g. +$18"/><input value={journalForm.note} onChange={e=>setJournalForm(v=>({...v,note:e.target.value}))} placeholder="Why did you take it?"/><button className="primary-button" onClick={saveJournal}>Save</button></div>
      <div className="journal-list">{journal.slice(0,8).map(item=><div className="journal-row" key={item.id}><strong>{item.symbol}</strong><span>{item.side}</span><b>{item.result||'—'}</b><p>{item.note}</p></div>)}</div>
      <div className="lab-section-heading"><div><span className="eyebrow">11 · MARKET IDEAS</span><h2>Ideas & community</h2></div><span className="muted-small">Local until a social backend is configured</span></div>
      <div className="idea-form"><input value={ideaForm.title} onChange={e=>setIdeaForm(v=>({...v,title:e.target.value}))} placeholder="Idea title"/><select value={ideaForm.bias} onChange={e=>setIdeaForm(v=>({...v,bias:e.target.value}))}><option>Bullish</option><option>Bearish</option><option>Neutral</option></select><input value={ideaForm.note} onChange={e=>setIdeaForm(v=>({...v,note:e.target.value}))} placeholder="Market thesis"/><button className="primary-button" onClick={saveIdea}>Publish</button></div>
      <div className="idea-list">{ideas.slice(0,8).map(idea=><button className="idea-row" key={idea.id} onClick={()=>onOpenPair(idea.symbol)}><div><span>{idea.symbol} · {idea.bias}</span><strong>{idea.title}</strong><p>{idea.note}</p></div><Icon name="chevron" size={15}/></button>)}</div>
      <div className="lab-section-heading"><div><span className="eyebrow">12 · BROKER INTELLIGENCE</span><h2>Execution handoff</h2></div></div>
      <div className="broker-card"><div><strong>Exness</strong><span>Execution happens on the broker's own site.</span><small>BerreX can pass selected side and symbol context.</small></div><button className="primary-button" onClick={()=>window.open((import.meta.env.VITE_EXNESS_REFERRAL_URL||'https://www.exness.com/'),'_blank','noopener,noreferrer')}>Open Exness <Icon name="external" size={14}/></button></div>
      <div className="lab-section-heading"><div><span className="eyebrow">13 · ACCOUNT</span><h2>Cloud workspace</h2></div></div>
      <div className="cloud-card"><Icon name="profile" size={18}/><div><strong>Cloud sync</strong><p>Optional authenticated sync can be enabled with Supabase project variables. No service credentials belong in the browser.</p></div><span className={import.meta.env.VITE_SUPABASE_URL?'status-on':'status-off'}>{import.meta.env.VITE_SUPABASE_URL?'Configured':'Not configured'}</span></div>
      <div className="lab-section-heading"><div><span className="eyebrow">14 · PORTFOLIO</span><h2>Exposure snapshot</h2></div></div>
      <div className="portfolio-grid">{markets.slice(0,4).map(pair=><button className="portfolio-card" key={pair.symbol} onClick={()=>onOpenPair(pair.symbol)}><span>{pair.symbol}</span><strong className={pair.change24h>=0?'positive':'negative'}>{pair.change24h>=0?'+':''}{pair.change24h.toFixed(2)}%</strong><small>Watched exposure</small></button>)}</div>
      <div className="lab-section-heading"><div><span className="eyebrow">15 · EXECUTION CONTEXT</span><h2>Broker handoff</h2></div></div>
      <div className="lab-note-card wide-note"><Icon name="shield" size={16}/><strong>Risk notice</strong><p>BerreX does not place orders. Buy/Sell opens the configured Exness URL. Provider quotes can differ from broker execution.</p></div>
      <div className="lab-section-heading"><div><span className="eyebrow">16 · SAVED SCREENS</span><h2>Shortcuts</h2></div></div>
      <div className="shortcut-grid"><button onClick={()=>setTab('screener')}>Strong movers <Icon name="chevron" size={15}/></button><button onClick={()=>setTab('screener')}>RSI watch <Icon name="chevron" size={15}/></button><button onClick={()=>setTab('macro')}>High impact today <Icon name="chevron" size={15}/></button><button onClick={()=>setTab('overview')}>Currency heatmap <Icon name="chevron" size={15}/></button></div>
      <div className="lab-section-heading"><div><span className="eyebrow">17 · TRUST</span><h2>Source status</h2></div><button className="text-button" onClick={onRefresh}>Refresh</button></div>
      <div className="source-grid"><div><span>Quotes</span><strong>Provider + fallback</strong></div><div><span>Charts</span><strong>Provider + fallback</strong></div><div><span>News</span><strong>{news.length?'Loaded':'Unavailable'}</strong></div><div><span>Calendar</span><strong>{events.length?'Loaded':'Unavailable'}</strong></div></div>
    </>}
  </div>;
}
