import { useMemo, useState } from 'react'
import bhajanEntries from '../data/bhajanPdfs'

const VISIBLE_DEFAULT = 5

function formatHindiName(filename) {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/^\d{3}_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function BhajanFinder() {
  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => {
    const searchTerm = query.trim().toLowerCase()
    if (!searchTerm) return bhajanEntries

    return bhajanEntries.filter(({ file, en }) => {
      const hindi = formatHindiName(file).toLowerCase()
      return hindi.includes(searchTerm) || en.toLowerCase().includes(searchTerm)
    })
  }, [query])

  const isSearching = query.trim().length > 0
  const visible = isSearching || showAll
    ? filtered
    : filtered.slice(0, VISIBLE_DEFAULT)

  return (
    <section className="bhajan-finder" id="bhajan-finder" aria-label="Bhajan Finder">
      <div className="section-heading">Bhajan Finder</div>
      <div className="section-subheading">
        Search and download {bhajanEntries.length} bhajans with their bhaav (meaning)
      </div>

      <div className="bhajan-finder-tools">
        <input
          type="search"
          className="bhajan-finder-search"
          placeholder="भजन खोजें / Search bhajan by name..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); setShowAll(false) }}
          aria-label="Search bhajans"
        />
        <div className="bhajan-finder-count">
          {isSearching ? `${filtered.length} found` : `${bhajanEntries.length} bhajans`}
        </div>
      </div>

      <div className="bhajan-finder-list" role="list">
        {visible.map(({ file, en }) => {
          const hindiTitle = formatHindiName(file)
          const href = `/bhajan-pdfs/${encodeURIComponent(file)}`

          return (
            <article className="bhajan-finder-row" role="listitem" key={file}>
              <div className="bhajan-finder-meta">
                <div className="bhajan-finder-name">{hindiTitle}</div>
                <div className="bhajan-finder-name-en">{en}</div>
              </div>
              <div className="bhajan-finder-actions">
                <a className="bhajan-finder-btn primary" href={href} target="_blank" rel="noreferrer">
                  Open
                </a>
                <a className="bhajan-finder-btn secondary" href={href} download>
                  Download
                </a>
              </div>
            </article>
          )
        })}
      </div>

      {!isSearching && !showAll && filtered.length > VISIBLE_DEFAULT && (
        <button className="bhajan-finder-show-all" onClick={() => setShowAll(true)}>
          Show all {filtered.length} bhajans
        </button>
      )}
    </section>
  )
}
