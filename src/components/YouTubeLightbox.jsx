import { useState, useEffect, useRef } from 'react'
import playlistVideos from '../data/playlistVideos.json'

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function getPlaylistId(url) {
  try {
    return new URL(url).searchParams.get('list')
  } catch {
    return null
  }
}

export default function YouTubeLightbox({ collection, playlist, onClose }) {
  const [activePlaylist, setActivePlaylist] = useState(playlist || null)
  const [activeVideoIdx, setActiveVideoIdx] = useState(0)
  const listRef = useRef(null)

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  useEffect(() => {
    setActiveVideoIdx(0)
  }, [activePlaylist?.id])

  useEffect(() => {
    if (!listRef.current) return
    const activeEl = listRef.current.querySelector('.yt-video-item-active')
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeVideoIdx])

  const handleBack = () => setActivePlaylist(null)

  if (activePlaylist) {
    const playlistId = getPlaylistId(activePlaylist.url)
    const videoData = playlistId && playlistVideos[playlistId]
    const videos = videoData?.videos || []
    const safeIdx = Math.min(activeVideoIdx, Math.max(0, videos.length - 1))
    const activeVideo = videos[safeIdx]

    const iframeSrc = activeVideo
      ? `https://www.youtube.com/embed/${activeVideo.id}?autoplay=1&rel=0`
      : playlistId
        ? `https://www.youtube.com/embed/videoseries?list=${playlistId}`
        : null

    return (
      <div className="yt-lightbox" onClick={onClose}>
        <div className="yt-lightbox-content yt-lightbox-player-view" onClick={(e) => e.stopPropagation()}>
          <button className="fb-lightbox-close" onClick={onClose} aria-label="Close">✕</button>

          {collection && (
            <button className="yt-lightbox-back" onClick={handleBack}>
              <BackIcon />
              {collection.title}
            </button>
          )}

          <div className="yt-lightbox-title">{activePlaylist.title}</div>

          {iframeSrc && (
            <div className="yt-lightbox-player">
              <iframe
                key={iframeSrc}
                src={iframeSrc}
                title={activePlaylist.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}

          {videos.length > 0 && (
            <div className="yt-video-list">
              <div className="yt-video-list-count">{videos.length} videos</div>
              <div className="yt-video-list-scroll" ref={listRef}>
                {videos.map((video, idx) => (
                  <button
                    key={video.id}
                    className={`yt-video-item${idx === safeIdx ? ' yt-video-item-active' : ''}`}
                    onClick={() => setActiveVideoIdx(idx)}
                  >
                    <div className="yt-video-item-num">{idx + 1}</div>
                    <div className="yt-video-item-thumb">
                      <img
                        src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
                        alt={video.title}
                        loading="lazy"
                      />
                    </div>
                    <div className="yt-video-item-title">{video.title}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (collection) {
    return (
      <div className="yt-lightbox" onClick={onClose}>
        <div className="yt-lightbox-content yt-lightbox-collection" onClick={(e) => e.stopPropagation()}>
          <button className="fb-lightbox-close" onClick={onClose} aria-label="Close">✕</button>

          <div className="yt-lightbox-title">{collection.title}</div>
          <div className="yt-lightbox-subtitle">
            {collection.playlists.length} {collection.playlists.length === 1 ? 'playlist' : 'playlists'}
          </div>

          <div className="yt-lightbox-grid">
            {collection.playlists.map((p) => (
              <button key={p.id} className="yt-lightbox-card" onClick={() => setActivePlaylist(p)}>
                {p.thumb && (
                  <div className="yt-lightbox-card-thumb">
                    <img src={p.thumb} alt={p.title} loading="lazy" />
                  </div>
                )}
                <div className="yt-lightbox-card-title">{p.title}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return null
}
