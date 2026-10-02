type Props = {
  points: number[];
  positive: boolean;
  large?: boolean;
};

export function MarketSparkline({ points, positive, large = false }: Props) {
  const width = 320;
  const height = large ? 140 : 70;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((point - min) / range) * (height - 16) - 8;
    return [x, y] as const;
  });

  const path = coords.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={positive ? 'rise' : 'fall'} x1="0" x2="1">
          <stop offset="0%" stopColor={positive ? '#0d7cff' : '#7a8494'} stopOpacity=".18" />
          <stop offset="100%" stopColor={positive ? '#0d7cff' : '#7a8494'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${positive ? 'rise' : 'fall'})`} />
      <path d={path} fill="none" stroke={positive ? '#0d7cff' : '#6e7785'} strokeWidth={large ? 2.2 : 2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
