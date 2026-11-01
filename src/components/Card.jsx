import React from 'react'

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  )
}

export default function Card({ playlist, thumbnail, index, ctaLabel = 'Play', onClick, id }) {
  return (
    <button
      id={id}
      type="button"
      className="playlist-card"
      style={{ animationDelay: `${0.05 + index * 0.06}s` }}
      onClick={onClick}
      aria-label={`${ctaLabel} ${playlist.title}`}
    >
      {thumbnail && (
        <div className="playlist-card-thumb">
          <img src={thumbnail} alt={`${playlist.title} playlist`} loading="lazy" />
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
