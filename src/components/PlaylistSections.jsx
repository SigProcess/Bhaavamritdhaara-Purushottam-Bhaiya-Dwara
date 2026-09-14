import { useState } from 'react'
import data from '../data/playlists.json'
import { CollectionCardButton } from './CollectionCard'
import Card from './Card'
import YouTubeLightbox from './YouTubeLightbox'

export default function PlaylistSections() {
  const [ytLightbox, setYtLightbox] = useState(null)

  return (
    <div className="sections-container">
      <div className="section-heading">Collections</div>
      <div className="section-subheading">Curated series of bhajans and pravachans</div>
      <div className="collections-grid">
        {data.collections.map((col, i) => (
          <CollectionCardButton
            key={col.id}
            collection={col}
            isExpanded={false}
            onToggle={() => setYtLightbox({ collection: col })}
            index={i}
          />
        ))}
      </div>

      {data.playlists.length > 0 && (
        <div className="playlists-section">
          <div className="section-heading">More Playlists</div>
          <div className="section-subheading">Individual devotional playlists</div>
          <div className="playlists-grid">
            {data.playlists.map((p, i) => (
              <Card key={p.id} playlist={p} index={i} onClick={() => setYtLightbox({ playlist: p })} />
            ))}
          </div>
        </div>
      )}

      {ytLightbox && (
        <YouTubeLightbox
          collection={ytLightbox.collection || null}
          playlist={ytLightbox.playlist || null}
          onClose={() => setYtLightbox(null)}
        />
      )}
    </div>
  )
}
