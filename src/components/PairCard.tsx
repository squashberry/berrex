import type { MarketPair } from '../types';
import { Icon } from '../lib/icons';
import { MarketSparkline } from './MarketSparkline';

type Props = {
  pair: MarketPair;
  favorite: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
  onAnalyzeTrade: () => void;
};

export function PairCard({ pair, favorite, onOpen, onToggleFavorite, onAnalyzeTrade }: Props) {
  const positive = pair.change24h >= 0;
  return (
    <article className="pair-card">
      <div className="pair-card-top">
        <button className="pair-card-heading" onClick={onOpen} aria-label={`Open ${pair.symbol} market details`}>
          <span>
            <span className="pair-symbol-row">
              <span className="pair-symbol">{pair.symbol}</span>
              <span className={`bias-chip ${pair.bias}`}>{pair.bias}</span>
            </span>
            <span className="pair-name">{pair.base} / {pair.quote}</span>
          </span>
        </button>
        <button
          className={`star-button ${favorite ? 'active' : ''}`}
          onClick={onToggleFavorite}
          aria-label={favorite ? `Remove ${pair.symbol} from favorites` : `Add ${pair.symbol} to favorites`}
        >
          <Icon name="star" size={17} fill={favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      <button className="pair-card-main" onClick={onOpen} aria-label={`Open ${pair.symbol} chart`}>
        <span className="pair-card-price-row">
          <strong>{pair.price.toFixed(pair.symbol === 'USD/JPY' || pair.symbol === 'XAU/USD' ? 2 : 5)}</strong>
          <span className={positive ? 'positive' : 'negative'}>
            {positive ? '+' : ''}{pair.change24h.toFixed(2)}%
          </span>
        </span>
        <MarketSparkline points={pair.sparkline} positive={positive} />
      </button>

      <div className="pair-card-actions">
        <button className="pair-analyze-button" onClick={onAnalyzeTrade}>
          <Icon name="spark" size={15} />
          <span>Analyse trade</span>
          <Icon name="chevron" size={13} />
        </button>
      </div>
    </article>
  );
}
