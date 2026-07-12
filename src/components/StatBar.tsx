const SEGMENTS = 10

export function StatBar({
  code,
  label,
  value,
  isPulsing,
}: {
  code: string
  label: string
  value: number
  isPulsing?: boolean
}) {
  const level = value < 25 ? 'low' : value < 60 ? 'mid' : 'high'
  const filled = Math.round((value / 100) * SEGMENTS)
  const bar = '█'.repeat(filled) + '░'.repeat(SEGMENTS - filled)
  return (
    <div className="stat-bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <span className="stat-code">{code}</span>
      <span className={`stat-fill stat-${level}${isPulsing ? ' pulsing' : ''}`}>{bar}</span>
      <span className="stat-pct">{Math.round(value)}%</span>
    </div>
  )
}
