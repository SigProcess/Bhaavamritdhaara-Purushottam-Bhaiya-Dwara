function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  )
}

export function CollectionCardButton({ collection, isExpanded, onToggle, index }) {
  const thumb = collection.playlists[0]?.thumb
  return (
    <div
      className={`collection-card${isExpanded ? ' expanded' : ''}`}
      style={{ animationDelay: `${0.05 + index * 0.06}s` }}
      onClick={onToggle}
    >
      {thumb && (
        <div className="collection-card-thumb">
          <img src={thumb} alt={collection.title} loading="lazy" />
        </div>
      )}
      <div className="collection-card-body">
        <div className="collection-card-title">{collection.title}</div>
        <div className="collection-card-count">
          {collection.playlists.length} {collection.playlists.length === 1 ? 'playlist' : 'playlists'}
        </div>
      </div>
      <div className="collection-card-chevron">
        <ChevronIcon />
      </div>
    </div>
  )
}

export function CollectionExpanded({ collection }) {
  return (
    <div className="collection-expanded-wrap">
      <div className="collection-expanded">
        <div className="expanded-title">{collection.title}</div>
        <div className="sub-playlists-grid">
          {collection.playlists.map((p) => (
            <button
              key={p.id}
              className="sub-playlist-btn"
              onClick={() => window.open(p.url, '_blank')}
            >
              {p.thumb && (
                <img className="sub-playlist-thumb" src={p.thumb} alt={p.title} loading="lazy" />
              )}
              <span className="sub-playlist-title">{p.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
