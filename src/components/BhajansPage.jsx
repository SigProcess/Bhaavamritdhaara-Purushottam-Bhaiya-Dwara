import { useMemo, useState } from 'react'
import bhajanPdfFiles from '../data/bhajanPdfs'

function formatBhajanName(filename) {
  const decoded = decodeURIComponent(filename)
  return decoded
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function BhajansPage() {
  const [query, setQuery] = useState('')

  const filteredFiles = useMemo(() => {
    const searchTerm = query.trim().toLowerCase()
    if (!searchTerm) return bhajanPdfFiles

    return bhajanPdfFiles.filter((file) => {
      const title = formatBhajanName(file).toLowerCase()
      return title.includes(searchTerm) || file.toLowerCase().includes(searchTerm)
    })
  }, [query])

  return (
    <section className="bhajans-page" aria-label="Bhajans PDFs">
      <div className="bhajans-header">
        <p className="bhajans-kicker">Bhavnirjharini Collection</p>
        <h1 className="bhajans-title">Bhajans PDF Library</h1>
        <p className="bhajans-desc">
          Browse, open, and download all available bhajans. Total PDFs: {bhajanPdfFiles.length}
        </p>
      </div>

      <div className="bhajans-tools">
        <input
          type="search"
          className="bhajans-search"
          placeholder="Search by bhajan name"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search bhajans"
        />
        <div className="bhajans-count">Showing {filteredFiles.length}</div>
      </div>

      <div className="bhajans-list" role="list">
        {filteredFiles.map((file) => {
          const title = formatBhajanName(file)
          const encodedFilePath = file.replaceAll('%', '%25')
          const href = `/bhajan-pdfs/${encodedFilePath}`

          return (
            <article className="bhajan-row" role="listitem" key={file}>
              <div className="bhajan-meta">
                <div className="bhajan-name">{title}</div>
                <div className="bhajan-file">{file}</div>
              </div>
              <div className="bhajan-actions">
                <a className="bhajan-link" href={href} target="_blank" rel="noreferrer">
                  Open
                </a>
                <a className="bhajan-link secondary" href={href} download>
                  Download
                </a>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
