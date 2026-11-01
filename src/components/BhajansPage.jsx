import React, { useEffect, useMemo, useState } from 'react'
import { bhajans as sourceBhajans } from '../data/catalogSources'
import { resolveBhajanResults } from '../domain/bhajans/bhajanSearch'
import { createBrowserDocumentService } from '../platform/browserDocumentService'
import { DocumentPresentationCoordinator } from '../platform/documentPresentationCoordinator'

const catalogBhajans = sourceBhajans.map((bhajan) => ({
  id: bhajan.id,
  hindiTitle: bhajan.hindiTitle,
  englishTitle: bhajan.englishTitle,
  ...('meaning' in bhajan ? { meaning: bhajan.meaning } : {}),
  document: { assetId: bhajan.document.id },
}))

const browserDocuments = createBrowserDocumentService(
  sourceBhajans.map((bhajan) => ({
    documentId: bhajan.id,
    path: bhajan.document.path,
  })),
)

const requestId = () => crypto.randomUUID()

function errorCode(error, fallback) {
  return error && typeof error === 'object' && typeof error.code === 'string'
    ? error.code
    : fallback
}

export default function BhajanFinder({
  bhajans = catalogBhajans,
  documentCoordinator,
}) {
  const fallbackCoordinator = useMemo(
    () => documentCoordinator ?? new DocumentPresentationCoordinator(browserDocuments, () => {}),
    [documentCoordinator],
  )
  const ownsCoordinator = documentCoordinator === undefined

  useEffect(
    () => () => {
      if (ownsCoordinator) fallbackCoordinator.dispose()
    },
    [fallbackCoordinator, ownsCoordinator],
  )

  const [query, setQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [pendingActions, setPendingActions] = useState({})
  const [failures, setFailures] = useState({})

  const results = useMemo(
    () => resolveBhajanResults(bhajans, query, showAll),
    [bhajans, query, showAll],
  )

  const setPending = (actionKey, pending) => {
    setPendingActions((current) => ({ ...current, [actionKey]: pending }))
  }

  const clearFailure = (failedRequestId) => {
    setFailures((current) => {
      if (!(failedRequestId in current)) return current
      const next = { ...current }
      delete next[failedRequestId]
      return next
    })
  }

  const recordFailure = (failure) => {
    setFailures((current) => ({ ...current, [failure.requestId]: failure }))
  }

  const openDocument = async (
    bhajan,
    focusTargetId,
    openRequestId = requestId(),
  ) => {
    const actionKey = `open:${bhajan.id}`
    clearFailure(openRequestId)
    setPending(actionKey, true)

    try {
      await fallbackCoordinator.open({
        requestId: openRequestId,
        documentId: bhajan.id,
        kind: 'bhajan',
        canonicalName: `${bhajan.hindiTitle} / ${bhajan.englishTitle}`,
        focusTargetId,
      })
    } catch (error) {
      recordFailure({
        requestId: openRequestId,
        operation: 'open',
        documentId: bhajan.id,
        hindiTitle: bhajan.hindiTitle,
        focusTargetId,
        code: errorCode(error, 'DOCUMENT_OPEN_FAILED'),
      })
    } finally {
      setPending(actionKey, false)
    }
  }

  const exportActiveSession = async (
    bhajan,
    sessionId,
    exportRequestId = requestId(),
  ) => {
    const actionKey = `export:${bhajan.id}`
    clearFailure(exportRequestId)
    setPending(actionKey, true)

    try {
      await fallbackCoordinator.export({
        requestId: exportRequestId,
        sessionId,
        canonicalName: `${bhajan.hindiTitle} / ${bhajan.englishTitle}`,
      })
    } catch (error) {
      recordFailure({
        requestId: exportRequestId,
        operation: 'export-session',
        documentId: bhajan.id,
        hindiTitle: bhajan.hindiTitle,
        sessionId,
        code: errorCode(error, 'EXPORT_FAILED'),
      })
    } finally {
      setPending(actionKey, false)
    }
  }

  const exportDocument = async (
    bhajan,
    focusTargetId,
    openRequestId = requestId(),
  ) => {
    const actionKey = `export:${bhajan.id}`
    clearFailure(openRequestId)
    setPending(actionKey, true)

    try {
      const session = await fallbackCoordinator.open({
        requestId: openRequestId,
        documentId: bhajan.id,
        kind: 'bhajan',
        canonicalName: `${bhajan.hindiTitle} / ${bhajan.englishTitle}`,
        focusTargetId,
      })
      await exportActiveSession(bhajan, session.sessionId)
    } catch (error) {
      recordFailure({
        requestId: openRequestId,
        operation: 'export-open',
        documentId: bhajan.id,
        hindiTitle: bhajan.hindiTitle,
        focusTargetId,
        code: errorCode(error, 'DOCUMENT_OPEN_FAILED'),
      })
    } finally {
      setPending(actionKey, false)
    }
  }

  const retryFailure = (failure) => {
    const bhajan = bhajans.find(({ id }) => id === failure.documentId)
    if (!bhajan) return

    if (failure.operation === 'open') {
      void openDocument(bhajan, failure.focusTargetId, failure.requestId)
    } else if (failure.operation === 'export-open') {
      void exportDocument(bhajan, failure.focusTargetId, failure.requestId)
    } else {
      void exportActiveSession(bhajan, failure.sessionId, failure.requestId)
    }
  }

  const failuresByDocument = Object.values(failures).reduce((grouped, failure) => {
    const existing = grouped[failure.documentId] ?? []
    grouped[failure.documentId] = [...existing, failure]
    return grouped
  }, {})

  const countLabel = results.kind === 'zero-results'
    ? 'कोई भजन नहीं मिला — No bhajan found.'
    : results.didExecuteSearch
      ? `${results.resultCount} results — ${results.resultCount} परिणाम`
      : `${results.totalCount} bhajans — ${results.totalCount} भजन`

  return (
    <section className="bhajan-finder" id="bhajan-finder" aria-labelledby="bhajan-finder-title">
      <h2 className="section-heading" id="bhajan-finder-title">Bhajan Finder</h2>
      <div className="section-subheading">
        <span className="hi">भजन खोजें</span> — search {results.totalCount} bhajans by Hindi or English title
      </div>

      <div className="bhajan-finder-tools">
        <div className="bhajan-finder-search-wrap">
          <input
            type="search"
            className="bhajan-finder-search"
            placeholder="भजन खोजें / Search bhajan by name..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setShowAll(false)
            }}
            aria-label="भजन खोजें / Search bhajans"
            aria-describedby={results.kind === 'overlength' ? 'bhajan-query-error' : undefined}
            aria-invalid={results.kind === 'overlength'}
          />
          {query.length > 0 && (
            <button
              type="button"
              className="bhajan-finder-clear"
              onClick={() => {
                setQuery('')
                setShowAll(false)
              }}
            >
              Clear — साफ़ करें
            </button>
          )}
        </div>
        <div className="bhajan-finder-count" role="status" aria-live="polite" aria-atomic="true">
          {countLabel}
        </div>
      </div>

      {results.kind === 'overlength' && (
        <p className="bhajan-finder-validation" id="bhajan-query-error" role="alert">
          {results.validationMessage} Maximum 200 characters. — अधिकतम 200 अक्षर।
        </p>
      )}

      {results.kind === 'zero-results' && (
        <div className="bhajan-finder-empty">
          <p className="hi">कोई भजन नहीं मिला</p>
          <p>No bhajan found.</p>
        </div>
      )}

      <div className="bhajan-finder-list" role="list">
        {results.items.map((bhajan, index) => {
          const documentFailures = failuresByDocument[bhajan.id] ?? []
          const openPending = Boolean(pendingActions[`open:${bhajan.id}`])
          const exportPending = Boolean(pendingActions[`export:${bhajan.id}`])
          const openControlId = `bhajan-open-${index}`
          const exportControlId = `bhajan-export-${index}`

          return (
            <article className="bhajan-finder-row" role="listitem" key={bhajan.id}>
              <div className="bhajan-finder-meta">
                <div className="bhajan-finder-name" lang="hi">{bhajan.hindiTitle}</div>
                <div className="bhajan-finder-name-en" lang="en">{bhajan.englishTitle}</div>
                {bhajan.meaning && (
                  <div className="bhajan-finder-meaning">{bhajan.meaning}</div>
                )}
                {documentFailures.map((failure) => (
                  <div className="bhajan-finder-error" role="alert" key={failure.requestId}>
                    <p>
                      {failure.operation === 'open' ? 'Could not open' : 'Could not export'}{' '}
                      <span lang="hi">{failure.hindiTitle}</span>. ({failure.code})
                    </p>
                    <button
                      type="button"
                      className="bhajan-finder-retry"
                      onClick={() => retryFailure(failure)}
                      disabled={failure.operation === 'open' ? openPending : exportPending}
                      aria-label={`Retry ${failure.operation === 'open' ? 'opening' : 'exporting'} ${failure.hindiTitle}`}
                    >
                      Retry — पुनः प्रयास करें
                    </button>
                  </div>
                ))}
              </div>
              <div className="bhajan-finder-actions">
                <button
                  id={openControlId}
                  type="button"
                  className="bhajan-finder-btn primary"
                  onClick={() => void openDocument(bhajan, openControlId)}
                  disabled={openPending}
                  aria-label={`Open ${bhajan.hindiTitle}`}
                >
                  {openPending ? 'Opening…' : 'Open — खोलें'}
                </button>
                <button
                  id={exportControlId}
                  type="button"
                  className="bhajan-finder-btn secondary"
                  onClick={() => void exportDocument(bhajan, exportControlId)}
                  disabled={exportPending}
                  aria-label={`Export ${bhajan.hindiTitle}`}
                >
                  {exportPending ? 'Exporting…' : 'Export — साझा करें'}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {results.kind === 'initial' && results.totalCount > results.items.length && (
        <button
          type="button"
          className="bhajan-finder-show-all"
          onClick={() => setShowAll(true)}
        >
          Show all {results.totalCount} bhajans — <span className="hi">पूरी सूची देखें</span>
        </button>
      )}
    </section>
  )
}
