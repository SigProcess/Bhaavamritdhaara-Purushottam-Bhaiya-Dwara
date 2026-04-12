import playlists from '../data/playlists.json'
import Card from './Card'

export default function CardGrid() {
  return (
    <div className="grid-container">
      <div className="grid-label">Select a playlist to begin your spiritual journey</div>
      <div className="cards-grid">
        {playlists.map((p, i) => (
          <Card key={p.id} playlist={p} index={i} />
        ))}
      </div>
    </div>
  )
}
