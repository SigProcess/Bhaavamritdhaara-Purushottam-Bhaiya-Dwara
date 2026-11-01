import { useCallback, useEffect, useMemo, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { validateCatalog } from '../domain/catalog/catalog'
import { BrowserNetworkService } from '../platform/browserNetworkService'
import { CapacitorNetworkService } from '../platform/capacitor/capacitorAdapters'
import CollectionBrowser from './CollectionBrowser'
import VideoPlayer from './VideoPlayer'

const CATALOG_URL = '/catalog.json'

/**
 * @param {{
 *   activeRoute?: import('../domain/contracts').AppRoute,
 *   onOpenRoute?: (route: import('../domain/contracts').AppRoute, focusTargetId: import('../domain/contracts').ElementId) => void,
 *   onBack?: () => void,
 *   catalog?: import('../domain/contracts').Catalog,
 *   networkService?: import('../domain/contracts').NetworkService,
 * }} props
 */
export default function PlaylistSections({
  activeRoute,
  onOpenRoute,
  onBack,
  catalog: providedCatalog,
  networkService: providedNetworkService,
}) {
  const [attempt, setAttempt] = useState(0)
  const [loadedCatalog, setLoadedCatalog] = useState(null)
  const [error, setError] = useState(false)
  const catalog = providedCatalog ?? loadedCatalog
  const fallbackNetworkService = useMemo(
    () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
      ? new CapacitorNetworkService()
      : new BrowserNetworkService(),
    [],
  )
  const networkService = providedNetworkService ?? fallbackNetworkService

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  useEffect(() => {
    if (providedCatalog) return undefined

    const controller = new AbortController()
    setError(false)

    fetch(CATALOG_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`)
        return response.json()
      })
      .then((value) => setLoadedCatalog(validateCatalog(value)))
      .catch((requestError) => {
        if (requestError?.name !== 'AbortError') setError(true)
      })

    return () => controller.abort()
  }, [attempt, providedCatalog])

  if (error) {
    return (
      <section className="sections-container" aria-labelledby="collections-heading">
        <h2 id="collections-heading" className="section-heading">Collections</h2>
        <div className="catalog-state catalog-error" role="alert">
          <p>Could not load the devotional catalog.</p>
          <button type="button" onClick={retry}>Retry collections</button>
        </div>
      </section>
    )
  }

  if (!catalog) {
    return (
      <section className="sections-container" aria-labelledby="collections-heading" aria-busy="true">
        <h2 id="collections-heading" className="section-heading">Collections</h2>
        <p className="catalog-state" role="status" aria-live="polite" aria-atomic="true">Loading collections…</p>
      </section>
    )
  }

  return (
    <CollectionBrowser
      catalog={catalog}
      activeRoute={activeRoute}
      onOpenRoute={onOpenRoute}
      onBack={onBack}
      renderPlaylist={(playlist, close) => (
        <VideoPlayer
          catalog={catalog}
          playlist={playlist}
          onClose={close}
          networkService={networkService}
        />
      )}
    />
  )
}
