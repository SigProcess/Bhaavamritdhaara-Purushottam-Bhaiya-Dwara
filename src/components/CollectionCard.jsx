import React from 'react'

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

export function CollectionCardButton({ collection, thumbnail, onClick, index, id }) {
  const count = collection.playlistIds.length

  return (
    <button
      id={id}
      type="button"
      className="collection-card"
      style={{ animationDelay: `${0.05 + index * 0.06}s` }}
      onClick={onClick}
      aria-label={`Open ${collection.title}, ${count} ${count === 1 ? 'playlist' : 'playlists'}`}
    >
      {thumbnail && (
        <div className="collection-card-thumb">
          <img src={thumbnail} alt={`${collection.title} collection`} loading="lazy" />
        </div>
      )}
      <div className="collection-card-body">
        <div className="collection-card-title">{collection.title}</div>
        <div className="collection-card-count">
          {count} {count === 1 ? 'playlist' : 'playlists'}
        </div>
      </div>
      <div className="collection-card-chevron">
        <ChevronIcon />
      </div>
    </button>
  )
}
