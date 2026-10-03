import { useEffect, useMemo, useState } from 'react';
import { GlassPanel } from './GlassPanel';
import { Icon } from '../lib/icons';

type Lesson = {
  id: string;
  title: string;
  eyebrow: string;
  summary: string;
  body: string[];
  takeaway: string;
};

const LESSONS: Lesson[] = [
  { id: 'quotes', eyebrow: '01 · FOUNDATIONS', title: 'Read a forex quote', summary: 'Understand base currency, quote currency, bid, ask and spread.', body: ['EUR/USD at 1.1750 means one euro is priced at about 1.1750 US dollars.', 'The first currency is the base. The second is the quote. Bid is the price you can sell at; ask is the price you can buy at.', 'The gap between bid and ask is the spread, which is one part of trading cost.'], takeaway: 'Before entering a trade, know which currency you are buying and which you are selling.' },
  { id: 'pips', eyebrow: '02 · PRICE', title: 'Pips and movement', summary: 'Turn a small price move into something you can measure.', body: ['For most major FX pairs, a pip is the fourth decimal place. JPY pairs typically use the second decimal place.', 'A 0.0010 move in EUR/USD is about 10 pips. Always check the instrument convention before calculating.', 'Position size changes how much each pip means in money terms.'], takeaway: 'Price movement is only half the story; size determines the financial impact.' },
  { id: 'orders', eyebrow: '03 · EXECUTION', title: 'Market, limit and stop orders', summary: 'Know what happens when you press buy, sell or wait for a level.', body: ['A market order attempts to execute near the current available price.', 'A limit order waits for a specified price or better. A stop order becomes active when its trigger level is reached.', 'In fast markets, the executed price can differ from the last displayed price.'], takeaway: 'Your order type controls when and how you ask the market to execute.' },
  { id: 'risk', eyebrow: '04 · RISK', title: 'Protect the downside', summary: 'Use position size and predefined exits before looking for profit.', body: ['Risk is easier to manage when the amount you could lose is defined before entering.', 'Stop loss levels can reduce an open position after a specified price is reached, but execution can differ in volatile markets.', 'Never confuse a simulator result with a guarantee of live trading performance.'], takeaway: 'Build the risk plan first; let the trade idea fit inside it.' },
  { id: 'technical', eyebrow: '05 · ANALYSIS', title: 'Price action and indicators', summary: 'Use charts as evidence, not as certainty.', body: ['Support and resistance describe areas where price has previously reacted; they are not guarantees of future behavior.', 'Moving averages, RSI, MACD and volatility measures are tools for organizing information, not prediction machines.', 'Combining several independent clues can give you a clearer framework than chasing one indicator.'], takeaway: 'Indicators describe the market; they do not remove uncertainty.' },
  { id: 'macro', eyebrow: '06 · MACRO', title: 'News and the economic calendar', summary: 'Understand why rates, inflation, jobs and central banks move FX.', body: ['Currencies respond to expectations about growth, inflation, interest rates and policy.', 'High-impact events can create sharp moves and wider spreads around the release.', 'A calendar helps you know when a market may behave differently from its recent pattern.'], takeaway: 'Know the event risk before you interpret the chart.' },
];

export function LearnForex({ onOpenDemo }: { onOpenDemo: () => void }) {
  const [completed, setCompleted] = useState<string[]>([]);
  const [openLesson, setOpenLesson] = useState(LESSONS[0].id);
  const [showGlossary, setShowGlossary] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('berrex-learning-progress') || '[]');
      if (Array.isArray(saved)) setCompleted(saved);
    } catch {
      // Ignore malformed progress.
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem('berrex-learning-progress', JSON.stringify(completed));
  }, [completed]);

  const progress = useMemo(() => Math.round((completed.length / LESSONS.length) * 100), [completed.length]);

  return (
    <div className="utility-page learning-page">
      <div className="page-header">
        <span className="eyebrow">BERREX ACADEMY</span>
        <h1>Learn forex without the jargon.</h1>
        <p className="subtle">Short lessons you can read beside the live market feed, then practice in demo mode.</p>
      </div>

      <GlassPanel className="learning-progress">
        <div><span>Learning path</span><strong>{completed.length}/{LESSONS.length} complete</strong></div>
        <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
        <small>{progress === 100 ? 'Path complete. Keep practicing and review the lessons when market conditions change.' : `${100 - progress}% left in the starter path.`}</small>
      </GlassPanel>

      <div className="learning-hero-grid">
        <GlassPanel className="learning-hero-card">
          <span className="eyebrow">PRACTICE</span><h2>Learn → test → trade demo.</h2><p>Read one lesson, open a chart, then use virtual money to see how an idea behaves with live prices.</p><button className="primary-button" onClick={onOpenDemo}>Open demo trading <Icon name="arrow" size={15} /></button>
        </GlassPanel>
        <GlassPanel className="learning-hero-card soft">
          <span className="eyebrow">QUICK RULE</span><h2>Risk before reward.</h2><p>Know what would invalidate the idea before you decide how much to trade.</p><div className="learning-pill"><Icon name="shield" size={14} /> Define your exit first</div>
        </GlassPanel>
      </div>

      <div className="lesson-list">
        {LESSONS.map((lesson) => {
          const open = openLesson === lesson.id;
          const done = completed.includes(lesson.id);
          return <article className={open ? 'lesson-card open' : 'lesson-card'} key={lesson.id}>
            <button className="lesson-head" onClick={() => setOpenLesson(open ? '' : lesson.id)}>
              <span className="lesson-number">{done ? '✓' : lesson.id === openLesson ? '•' : '→'}</span>
              <span><small>{lesson.eyebrow}</small><strong>{lesson.title}</strong><em>{lesson.summary}</em></span>
              <Icon name="chevron" size={17} />
            </button>
            {open && <div className="lesson-body"><div>{lesson.body.map((line) => <p key={line}>{line}</p>)}</div><div className="lesson-takeaway"><span>TAKEAWAY</span><strong>{lesson.takeaway}</strong></div><button className={done ? 'secondary-button' : 'primary-button'} onClick={() => setCompleted((current) => done ? current.filter((id) => id !== lesson.id) : [...current, lesson.id])}>{done ? 'Mark incomplete' : 'Mark lesson complete'}</button></div>}
          </article>;
        })}
      </div>

      <GlassPanel className="glossary-card">
        <button className="glossary-trigger" onClick={() => setShowGlossary((open) => !open)}><span><span className="eyebrow">QUICK REFERENCE</span><strong>Forex glossary</strong></span><Icon name="chevron" size={17} /></button>
        {showGlossary && <div className="glossary-grid">
          {[
            ['Pip','A standard unit used to describe FX price movement.'],
            ['Spread','The difference between the bid and ask price.'],
            ['Lot','A standardized trade size; brokers define their own lot conventions.'],
            ['Leverage','Using a smaller amount of capital to control a larger position, which can amplify gains and losses.'],
            ['Margin','Funds set aside to support an open leveraged position.'],
            ['Volatility','How much and how quickly price tends to move.'],
          ].map(([term, definition]) => <div key={term}><strong>{term}</strong><p>{definition}</p></div>)}
        </div>}
      </GlassPanel>

      <p className="modal-note">Education only. Trading involves risk, and a simulator cannot reproduce every live-market condition.</p>
    </div>
  );
}
