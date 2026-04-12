import { useState } from 'react'
import data from '../data/playlists.json'
import { CollectionCardButton, CollectionExpanded } from './CollectionCard'
import Card from './Card'

export default function PlaylistSections() {
  const [expandedId, setExpandedId] = useState(null)

  const handleToggle = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const expandedCollection = data.collections.find((c) => c.id === expandedId)

  return (
    <div className="sections-container">
      <div className="section-label">Collections</div>
      <div className="collections-grid">
        {data.collections.map((col) => (
          <CollectionCardButton
            key={col.id}
            collection={col}
            isExpanded={expandedId === col.id}
            onToggle={() => handleToggle(col.id)}
          />
        ))}
      </div>
      {expandedCollection && (
        <CollectionExpanded
          key={expandedCollection.id}
          collection={expandedCollection}
          isExpanded={true}
        />
      )}

      <div className="playlists-section">
        <div className="section-label">All Playlists</div>
        <div className="playlists-grid">
          {data.playlists.map((p, i) => (
            <Card key={p.id} playlist={p} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
