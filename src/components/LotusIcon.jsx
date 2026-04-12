export function LotusIcon({ size = 38, gold = false }) {
  const c = gold ? '#D4AF37' : '#2D5A27'
  const o = gold ? 'rgba(212,175,55,0.3)' : 'rgba(45,90,39,0.2)'
  return (
    <svg width={size} height={size} viewBox="0 0 60 60" fill="none">
      <ellipse cx="30" cy="42" rx="6" ry="10" fill={c} opacity="0.9" />
      <ellipse cx="30" cy="42" rx="6" ry="10" fill={c} opacity="0.9" transform="rotate(30 30 42)" />
      <ellipse cx="30" cy="42" rx="6" ry="10" fill={c} opacity="0.9" transform="rotate(-30 30 42)" />
      <ellipse cx="30" cy="38" rx="4" ry="8" fill={c} opacity="0.85" transform="rotate(60 30 38)" />
      <ellipse cx="30" cy="38" rx="4" ry="8" fill={c} opacity="0.85" transform="rotate(-60 30 38)" />
      <ellipse cx="30" cy="36" rx="4" ry="8" fill={c} opacity="0.85" transform="rotate(90 30 36)" />
      <ellipse cx="30" cy="34" rx="5" ry="9" fill={gold ? '#F0D060' : '#4A7A3E'} opacity="0.95" transform="rotate(0 30 34)" />
      <circle cx="30" cy="32" r="6" fill={gold ? '#D4AF37' : '#2D5A27'} />
      <circle cx="30" cy="32" r="3.5" fill={gold ? '#F5E070' : '#8DAA91'} />
      <ellipse cx="30" cy="50" rx="12" ry="3" fill={o} />
    </svg>
  )
}

export function CardLotus() {
  return (
    <svg width={70} height={70} viewBox="0 0 60 60" fill="none" className="card-lotus-svg">
      <ellipse cx="30" cy="42" rx="5" ry="9" fill="rgba(255,255,255,0.6)" />
      <ellipse cx="30" cy="42" rx="5" ry="9" fill="rgba(255,255,255,0.6)" transform="rotate(30 30 42)" />
      <ellipse cx="30" cy="42" rx="5" ry="9" fill="rgba(255,255,255,0.6)" transform="rotate(-30 30 42)" />
      <ellipse cx="30" cy="38" rx="3.5" ry="7" fill="rgba(255,255,255,0.5)" transform="rotate(60 30 38)" />
      <ellipse cx="30" cy="38" rx="3.5" ry="7" fill="rgba(255,255,255,0.5)" transform="rotate(-60 30 38)" />
      <ellipse cx="30" cy="36" rx="3.5" ry="7" fill="rgba(255,255,255,0.55)" transform="rotate(90 30 36)" />
      <ellipse cx="30" cy="34" rx="4.5" ry="8" fill="rgba(212,175,55,0.7)" />
      <circle cx="30" cy="32" r="5.5" fill="rgba(212,175,55,0.85)" />
      <circle cx="30" cy="32" r="3" fill="rgba(255,230,100,0.9)" />
    </svg>
  )
}
