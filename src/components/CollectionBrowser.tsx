import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppRoute,
  AssetRef,
  Catalog,
  CollectionId,
  ElementId,
  NavigationEntry,
  PlaylistRecord,
  RequestId,
  RequestState,
  ScrollSnapshot,
} from '../domain/contracts'
import {
  selectCollectionPlaylists,
  selectCollections,
  selectStandalonePlaylists,
} from '../domain/catalog/catalog'
import {
  activeNavigationEntry,
  createTerminatedLaunchNavigationState,
  navigationReducer,
} from '../domain/navigation/navigationCoordinator'
import { resolvePlaylistAvailability } from '../domain/player/playerReducer'
import Card from './Card'
import { CollectionCardButton } from './CollectionCard'

export interface CollectionBrowserEnvironment {
  readonly getScroll: () => ScrollSnapshot
  readonly restoreScroll: (scroll: ScrollSnapshot) => void
  readonly restoreFocus: (targetId: ElementId) => void
}

export interface CollectionBrowserProps {
  readonly catalog: Catalog
  readonly activeRoute?: AppRoute
  readonly onOpenRoute?: (route: AppRoute, focusTargetId: ElementId) => void
  readonly onBack?: () => void
  readonly requests?: Readonly<Record<RequestId, RequestState>>
  readonly onRetry?: (requestId: RequestId) => void
  readonly renderPlaylist?: (
    playlist: PlaylistRecord,
    close: () => void,
  ) => ReactNode
  readonly environment?: CollectionBrowserEnvironment
}

const browserEnvironment: CollectionBrowserEnvironment = {
  getScroll: () => ({ x: window.scrollX, y: window.scrollY }),
  restoreScroll: ({ x, y }) => window.scrollTo(x, y),
  restoreFocus: (targetId) => document.getElementById(targetId)?.focus(),
}

const focusId = (kind: 'collection' | 'playlist', id: string): ElementId =>
  `${kind}-${id}` as ElementId

function assetPath(catalog: Catalog, reference: AssetRef): string | undefined {
  const asset = catalog.assets.find(({ id }) => id === reference.assetId)
  if (!asset) return undefined
  if (asset.availability === 'remote' || asset.path.startsWith('/')) return asset.path
  return `/${asset.path}`
}

function collectionRequest(
  requests: Readonly<Record<RequestId, RequestState>>,
  collectionId: CollectionId,
): RequestState | undefined {
  return Object.values(requests).find(
    (request) =>
      request.kind === 'collection' &&
      request.targetId === collectionId &&
      (request.status === 'failed' || request.status === 'retryable'),
  )
}

export default function CollectionBrowser({
  catalog,
  activeRoute: controlledRoute,
  onOpenRoute,
  onBack,
  requests = {},
  onRetry,
  renderPlaylist,
  environment = browserEnvironment,
}: CollectionBrowserProps) {
  const [navigation, dispatchNavigation] = useReducer(
    navigationReducer,
    undefined,
    createTerminatedLaunchNavigationState,
  )
  const [unavailableTitle, setUnavailableTitle] = useState<string>()
  const pendingRestoration = useRef<NavigationEntry | undefined>(undefined)
  const activeEntry = controlledRoute
    ? { route: controlledRoute, scroll: { x: 0, y: 0 } }
    : activeNavigationEntry(navigation)

  const collections = useMemo(() => selectCollections(catalog), [catalog])
  const standalonePlaylists = useMemo(
    () => selectStandalonePlaylists(catalog),
    [catalog],
  )

  useLayoutEffect(() => {
    const predecessor = pendingRestoration.current
    if (!predecessor || predecessor.route !== activeEntry.route) return
    pendingRestoration.current = undefined
    environment.restoreScroll(predecessor.scroll)
    if (predecessor.focusTargetId) {
      environment.restoreFocus(predecessor.focusTargetId)
    }
  }, [activeEntry.route, environment])

  const pushRoute = useCallback(
    (route: NavigationEntry['route'], targetId: ElementId) => {
      setUnavailableTitle(undefined)
      if (onOpenRoute) {
        onOpenRoute(route, targetId)
        return
      }
      dispatchNavigation({
        type: 'push',
        route,
        originScroll: environment.getScroll(),
        originFocusTargetId: targetId,
      })
    },
    [environment, onOpenRoute],
  )

  const goBack = useCallback(() => {
    setUnavailableTitle(undefined)
    if (onBack) {
      onBack()
      return
    }
    if (navigation.stack.length === 1) return
    pendingRestoration.current = navigation.stack[navigation.stack.length - 2]
    dispatchNavigation({ type: 'pop' })
  }, [navigation.stack, onBack])

  const openPlaylist = useCallback(
    (playlist: PlaylistRecord) => {
      if (resolvePlaylistAvailability(playlist) === 'unavailable') {
        setUnavailableTitle(playlist.title)
        return
      }
      pushRoute(
        {
          kind: 'playlist',
          playlistId: playlist.id,
          ...(playlist.collectionId
            ? { collectionId: playlist.collectionId }
            : {}),
        },
        focusId('playlist', playlist.id),
      )
    },
    [pushRoute],
  )

  if (activeEntry.route.kind === 'playlist') {
    const playlistRoute = activeEntry.route
    const playlist = [...catalog.collectionPlaylists, ...catalog.standalonePlaylists]
      .find(({ id }) => id === playlistRoute.playlistId)
    if (!playlist) return null

    return (
      <section className="sections-container catalog-route" aria-labelledby="playlist-screen-title">
        {renderPlaylist ? (
          renderPlaylist(playlist, goBack)
        ) : (
          <>
            <button type="button" className="catalog-back-button" onClick={goBack}>
              Back
            </button>
            <h1 id="playlist-screen-title" className="section-heading" tabIndex={-1}>{playlist.title}</h1>
            <p className="section-subheading">Video Player</p>
          </>
        )}
      </section>
    )
  }

  if (activeEntry.route.kind === 'collection') {
    const collectionRoute = activeEntry.route
    const collection = collections.find(({ id }) => id === collectionRoute.collectionId)
    if (!collection) return null
    const playlists = selectCollectionPlaylists(catalog, collection.id)
    const failedRequest = collectionRequest(requests, collection.id)

    return (
      <section className="sections-container catalog-route" aria-labelledby="collection-screen-title">
        <button type="button" className="catalog-back-button" onClick={goBack}>
          Back to collections
        </button>
        <h1 id="collection-screen-title" className="section-heading" tabIndex={-1}>{collection.title}</h1>
        <p className="section-subheading">
          {playlists.length} {playlists.length === 1 ? 'playlist' : 'playlists'}
        </p>

        {failedRequest ? (
          <div className="catalog-state catalog-error" role="alert">
            <p>Could not load {collection.title}.</p>
            {failedRequest.status === 'retryable' && onRetry && (
              <button type="button" onClick={() => onRetry(failedRequest.requestId)}>
                Retry {collection.title}
              </button>
            )}
          </div>
        ) : playlists.length === 0 ? (
          <p className="catalog-state" role="status" aria-live="polite" aria-atomic="true">
            No playlists are available in {collection.title}.
          </p>
        ) : (
          <div className="playlists-grid">
            {playlists.map((playlist, index) => (
              <Card
                key={playlist.id}
                id={focusId('playlist', playlist.id)}
                playlist={playlist}
                thumbnail={assetPath(catalog, playlist.thumbnail)}
                index={index}
                onClick={() => openPlaylist(playlist)}
              />
            ))}
          </div>
        )}

        {unavailableTitle && (
          <p className="catalog-state catalog-error" role="alert">
            {unavailableTitle} is unavailable.
          </p>
        )}
      </section>
    )
  }

  return (
    <section className="sections-container" aria-labelledby="collections-heading">
      <h2 id="collections-heading" className="section-heading">Collections</h2>
      <p className="section-subheading">
        <span className="hi">संग्रह</span> — curated series of bhajans and pravachans
      </p>
      <div className="collections-grid">
        {collections.map((collection, index) => (
          <CollectionCardButton
            key={collection.id}
            id={focusId('collection', collection.id)}
            collection={collection}
            thumbnail={assetPath(catalog, collection.thumbnail)}
            onClick={() =>
              pushRoute(
                { kind: 'collection', collectionId: collection.id },
                focusId('collection', collection.id),
              )
            }
            index={index}
          />
        ))}
      </div>

      {standalonePlaylists.length > 0 && (
        <div className="playlists-section" aria-labelledby="standalone-playlists-heading">
          <h3 id="standalone-playlists-heading" className="section-heading">More Playlists</h3>
          <p className="section-subheading">
            <span className="hi">अन्य प्लेलिस्ट</span> — individual devotional playlists
          </p>
          <div className="playlists-grid">
            {standalonePlaylists.map((playlist, index) => (
              <Card
                key={playlist.id}
                id={focusId('playlist', playlist.id)}
                playlist={playlist}
                thumbnail={assetPath(catalog, playlist.thumbnail)}
                index={index}
                onClick={() => openPlaylist(playlist)}
              />
            ))}
          </div>
        </div>
      )}

      {unavailableTitle && (
        <p className="catalog-state catalog-error" role="alert">
          {unavailableTitle} is unavailable.
        </p>
      )}
    </section>
  )
}
