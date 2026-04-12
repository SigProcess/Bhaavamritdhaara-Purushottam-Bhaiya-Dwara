function PlayIcon() {
  return (
    <svg className="play-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  )
}

export default function Card({ playlist, index }) {
  const delay = `${0.1 + index * 0.08}s`

  return (
    <div
      className="playlist-card"
      style={{ animationDelay: delay }}
      onClick={() => window.open(playlist.url, '_blank')}
    >
      <div className="playlist-card-title">{playlist.title}</div>
      <button className="playlist-card-btn">
        <PlayIcon />
        Play
      </button>
    </div>
  )
}
