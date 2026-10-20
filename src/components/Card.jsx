function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  )
}

export default function Card({ playlist, index, ctaLabel = 'Play', onClick }) {
  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      window.open(playlist.url, '_blank')
    }
  }

  // A <button>, not a div: the whole card is the control, so it has to be
  // reachable by keyboard. The inner CTA is a span for the same reason —
  // a button cannot be nested inside a button.
  return (
    <button
      type="button"
      className="playlist-card"
      style={{ animationDelay: `${0.05 + index * 0.06}s` }}
      onClick={handleClick}
    >
      {playlist.thumb && (
        <div className="playlist-card-thumb">
          <img src={playlist.thumb} alt="" loading="lazy" />
          <div className="playlist-card-play-overlay">
            <PlayIcon />
          </div>
        </div>
      )}
      <div className="playlist-card-info">
        <div className="playlist-card-title">{playlist.title}</div>
        <span className="playlist-card-btn">
          <PlayIcon />
          {ctaLabel}
        </span>
      </div>
    </button>
  )
}
