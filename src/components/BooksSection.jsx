import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { selectBooks, validateCatalog } from '../domain/catalog/catalog'
import { createBrowserDocumentService } from '../platform/browserDocumentService'
import { DocumentPresentationCoordinator } from '../platform/documentPresentationCoordinator'

const CATALOG_URL = '/catalog.json'
const requestId = () => crypto.randomUUID()

function assetPath(catalog, reference) {
  const asset = catalog.assets.find(({ id }) => id === reference.assetId)
  if (!asset) return undefined
  if (asset.availability === 'remote' || asset.path.startsWith('/')) return asset.path
  return `/${asset.path}`
}

function browserCoordinator(catalog) {
  const documents = selectBooks(catalog).map((book) => ({
    documentId: book.id,
    path: assetPath(catalog, book.document),
  }))
  if (documents.some(({ path }) => path === undefined)) return undefined

  return new DocumentPresentationCoordinator(
    createBrowserDocumentService(documents),
    () => {},
  )
}

/**
 * @param {{
 *   catalog?: import('../domain/contracts').Catalog,
 *   documentCoordinator?: {
 *     open(options: import('../platform/documentPresentationCoordinator').OpenDocumentOptions): Promise<unknown> | unknown,
 *     dispose?(): void,
 *   },
 * }} props
 */
export default function BooksSection({ catalog: suppliedCatalog, documentCoordinator }) {
  const [loadedCatalog, setLoadedCatalog] = useState(null)
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  const [catalogError, setCatalogError] = useState(false)
  const catalog = suppliedCatalog ?? loadedCatalog

  useEffect(() => {
    if (suppliedCatalog) return undefined

    const controller = new AbortController()
    setCatalogError(false)
    fetch(CATALOG_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`)
        return response.json()
      })
      .then((value) => setLoadedCatalog(validateCatalog(value)))
      .catch((error) => {
        if (error?.name !== 'AbortError') setCatalogError(true)
      })

    return () => controller.abort()
  }, [catalogAttempt, suppliedCatalog])

  const fallbackCoordinator = useMemo(
    () => documentCoordinator ?? (catalog ? browserCoordinator(catalog) : undefined),
    [catalog, documentCoordinator],
  )
  const ownsCoordinator = documentCoordinator === undefined

  useEffect(
    () => () => {
      if (ownsCoordinator) fallbackCoordinator?.dispose?.()
    },
    [fallbackCoordinator, ownsCoordinator],
  )

  const books = useMemo(() => (catalog ? selectBooks(catalog) : []), [catalog])
  const [selectedBookId, setSelectedBookId] = useState()
  const [pendingBookId, setPendingBookId] = useState()
  const [failure, setFailure] = useState()

  const openBook = useCallback(async (book, focusTargetId, openRequestId = requestId()) => {
    if (!fallbackCoordinator) return

    setSelectedBookId(book.id)
    setPendingBookId(book.id)
    setFailure(undefined)
    try {
      await fallbackCoordinator.open({
        documentId: book.id,
        kind: 'book',
        canonicalName: book.title,
        focusTargetId,
        requestId: openRequestId,
      })
    } catch {
      setFailure({
        requestId: openRequestId,
        bookId: book.id,
        canonicalName: book.title,
        focusTargetId,
      })
    } finally {
      setPendingBookId(undefined)
    }
  }, [fallbackCoordinator])

  const retryFailure = useCallback(() => {
    if (!failure) return
    const selectedBook = books.find(({ id }) => id === failure.bookId)
    if (!selectedBook) return
    void openBook(selectedBook, failure.focusTargetId, failure.requestId)
  }, [books, failure, openBook])

  if (catalogError) {
    return (
      <section className="books-section" aria-labelledby="books-heading">
        <h2 className="section-heading" id="books-heading">Published Books</h2>
        <div className="catalog-state catalog-error" role="alert">
          <p>Could not load the published books catalog.</p>
          <button type="button" onClick={() => setCatalogAttempt((value) => value + 1)}>
            Retry books
          </button>
        </div>
      </section>
    )
  }

  if (!catalog) {
    return (
      <section className="books-section" aria-labelledby="books-heading" aria-busy="true">
        <h2 className="section-heading" id="books-heading">Published Books</h2>
        <p className="catalog-state" role="status" aria-live="polite" aria-atomic="true">Loading published books…</p>
      </section>
    )
  }

  return (
    <section className="books-section" aria-labelledby="books-heading">
      <h2 className="section-heading" id="books-heading">Published Books</h2>
      <div className="section-subheading">
        <span className="hi">प्रकाशित पुस्तकें</span> — sacred texts for devotional reading
      </div>
      {failure && (
        <p className="bhajan-finder-empty" role="alert">
          “{failure.canonicalName}” could not be opened.{' '}
          <button
            type="button"
            disabled={pendingBookId !== undefined}
            onClick={retryFailure}
          >
            Retry
          </button>
        </p>
      )}
      <div className="books-grid">
        {books.map((book, index) => {
          const controlId = `book-open-${book.id}`
          const isSelected = selectedBookId === book.id

          return (
            <button
              id={controlId}
              key={book.id}
              type="button"
              className={`book-card${isSelected ? ' book-card-selected' : ''}`}
              disabled={pendingBookId !== undefined}
              aria-pressed={isSelected}
              aria-label={`Read Book: ${book.title}`}
              onClick={() => openBook(book, controlId)}
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="book-card-cover">
                <img src={assetPath(catalog, book.cover)} alt={book.title} />
              </div>
              <div className="book-card-body">
                <div className="book-card-title">{book.title}</div>
                {book.subtitle && (
                  <div className="book-card-subtitle">{book.subtitle}</div>
                )}
                {book.author && (
                  <div className="book-card-author">{book.author}</div>
                )}
                <div className="book-card-meta">{book.pageCount} pages</div>
                <div className="book-card-btn" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                  </svg>
                  Read Book
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
