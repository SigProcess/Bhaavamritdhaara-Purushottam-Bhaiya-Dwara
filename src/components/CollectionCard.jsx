function PlayIcon() {
  return (
    <svg className="play-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14l11-7-11-7z" />
    </svg>
  )
}

export function CollectionCardButton({ collection, isExpanded, onToggle }) {
  return (
    <div
      className={`collection-card${isExpanded ? ' expanded' : ''}`}
      onClick={onToggle}
    >
      <div className="collection-card-title">{collection.title}</div>
      <div className="collection-card-count">
        {collection.playlists.length} {collection.playlists.length === 1 ? 'playlist' : 'playlists'}
      </div>
      <div className="collection-card-icon">▼</div>
    </div>
  )
}

export function CollectionExpanded({ collection, isExpanded }) {
  return (
    <div className={`collection-expanded-wrap${isExpanded ? ' open' : ''}`}>
      <div className="collection-expanded">
        <div className="sub-playlists-grid">
          {collection.playlists.map((p) => (
            <button
              key={p.id}
              className="sub-playlist-btn"
              onClick={() => window.open(p.url, '_blank')}
            >
              <PlayIcon />
              {p.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
