import { useState } from 'react'
import { CardLotus } from './LotusIcon'

const GRADIENTS = [
  'linear-gradient(145deg,#2D5A27 0%,#4A7A3E 40%,#1A3A14 100%)',
  'linear-gradient(145deg,#3A6B35 0%,#5A8A4A 40%,#243E20 100%)',
  'linear-gradient(145deg,#1E4E1A 0%,#3D6B33 40%,#122E0E 100%)',
  'linear-gradient(145deg,#4A7040 0%,#6A9055 40%,#2E4E26 100%)',
]

function PlayIcon() {
  return (
    <svg className="play-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  )
}

export default function Card({ playlist, index }) {
  const delay = `${0.1 + index * 0.13}s`
  const [hov, setHov] = useState(false)

  return (
    <div
      className="card"
      style={{ animationDelay: delay }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => window.open(playlist.url, '_blank')}
    >
      <div className="gold-corner" />
      <div className="card-img-wrap">
        <div className="card-img-inner">
          <div className="card-gradient-bg" style={{ background: GRADIENTS[index % GRADIENTS.length] }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(circle at 30% 40%,rgba(212,175,55,0.15) 0%,transparent 60%)',
          }} />
          <div className="card-number-display">{playlist.num}</div>
          <div className="card-lotus-center">
            <CardLotus />
            <span className="card-series-text">Anand Pranami</span>
          </div>
        </div>
        <div className="card-om-badge">ॐ</div>
      </div>
      <div className="card-body">
        <div className="card-num">Playlist {playlist.num}</div>
        <div className="card-title">{playlist.title}</div>
        <button className="play-btn">
          <PlayIcon />
          Play Playlist
        </button>
      </div>
    </div>
  )
}
