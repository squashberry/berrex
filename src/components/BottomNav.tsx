import { Icon, type IconName } from '../lib/icons';

type Item = {
  id: 'home' | 'markets' | 'news' | 'lab' | 'profile';
  label: string;
  icon: IconName;
};

const items: Item[] = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'markets', label: 'Markets', icon: 'chart' },
  { id: 'news', label: 'News', icon: 'news' },
  { id: 'lab', label: 'Lab', icon: 'spark' },
  { id: 'profile', label: 'You', icon: 'profile' },
];

export function BottomNav({ active, onChange }: { active: Item['id']; onChange: (id: Item['id']) => void }) {
  return (
    <nav className="bottom-nav" aria-label="Primary navigation">
      {items.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${active === item.id ? 'active' : ''}`}
          onClick={() => onChange(item.id)}
          aria-current={active === item.id ? 'page' : undefined}
        >
          <span className="nav-icon"><Icon name={item.icon} size={20} fill={active === item.id ? 'currentColor' : 'none'} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
