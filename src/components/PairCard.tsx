import type { MarketPair } from '../types';
import { Icon } from '../lib/icons';
import { MarketSparkline } from './MarketSparkline';

type Props = {
  pair: MarketPair;
  favorite: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
};

export function PairCard({ pair, favorite, onOpen, onToggleFavorite }: Props) {
  const positive = pair.change24h >= 0;
  return (
    <button className="pair-card" onClick={onOpen}>
      <div className="pair-card-top">
        <div>
          <div className="pair-symbol-row">
            <span className="pair-symbol">{pair.symbol}</span>
            <span className={`bias-chip ${pair.bias}`}>{pair.bias}</span>
          </div>
          <div className="pair-name">{pair.base} / {pair.quote}</div>
        </div>
        <span
          className={`star-button ${favorite ? 'active' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleFavorite();
          }}
          role="button"
          aria-label={favorite ? `Remove ${pair.symbol} from favorites` : `Add ${pair.symbol} to favorites`}
        >
          <Icon name="star" size={17} fill={favorite ? 'currentColor' : 'none'} />
        </span>
      </div>

      <div className="pair-card-price-row">
        <strong>{pair.price.toFixed(pair.symbol === 'USD/JPY' || pair.symbol === 'XAU/USD' ? 2 : 5)}</strong>
        <span className={positive ? 'positive' : 'negative'}>
          {positive ? '+' : ''}{pair.change24h.toFixed(2)}%
        </span>
      </div>

      <MarketSparkline points={pair.sparkline} positive={positive} />
    </button>
  );
}
