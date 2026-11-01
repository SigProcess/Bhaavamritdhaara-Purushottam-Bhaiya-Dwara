import { useEffect, useLayoutEffect, useRef } from 'react'
import Hero from '../components/Hero'
import BhajanFinder from '../components/BhajansPage'
import PlaylistSections from '../components/PlaylistSections'
import BooksSection from '../components/BooksSection'
import Footer from '../components/Footer'
import Nav from '../components/Nav'
import PrivacyNotice from '../components/PrivacyNotice'
import { selectDistinctBhajans } from '../domain/catalog/catalog'
import { activeNavigationEntry } from '../domain/navigation/navigationCoordinator'
import type { AppRoute, ElementId } from '../domain/contracts'
import {
  useAppNavigation,
  useCatalog,
  useDocumentCoordinator,
  useNetwork,
  usePlatformServices,
  useRequests,
} from './AppProviders'

const categories = [
  ['Bhajans', '#bhajan-finder'],
  ['Pravachans', '#collections-heading'],
  ['Lekh', '#collections-heading'],
  ['Vani Vishleshan', '#collections-heading'],
  ['Published Books', '#published-books'],
] as const

function SectionBreak() {
  return (
    <div className="section-break" aria-hidden="true">
      <div className="section-break-line" />
      <div className="section-break-icon">&#x0950;</div>
      <div className="section-break-line" />
    </div>
  )
}

function HomeRoute({
  documentCoordinator,
  onOpenRoute,
}: {
  readonly documentCoordinator: ReturnType<typeof useDocumentCoordinator>
  readonly onOpenRoute: (route: AppRoute, focusTargetId: ElementId) => void
}) {
  const { catalog } = useCatalog()
  const { network } = usePlatformServices()
  return (
    <>
      <Hero />
      <nav className="category-navigation" aria-label="Devotional categories">
        <ul>
          {categories.map(([label, href]) => (
            <li key={label}><a href={href}>{label}</a></li>
          ))}
        </ul>
      </nav>
      <SectionBreak />
      <BhajanFinder
        bhajans={[...selectDistinctBhajans(catalog)]}
        documentCoordinator={documentCoordinator}
      />
      <SectionBreak />
      <PlaylistSections
        catalog={catalog}
        networkService={network}
        activeRoute={{ kind: 'home' }}
        onOpenRoute={onOpenRoute}
      />
      <SectionBreak />
      <div id="published-books">
        <BooksSection catalog={catalog} documentCoordinator={documentCoordinator} />
      </div>
    </>
  )
}

function AvailabilityStatus() {
  const { status } = useNetwork()
  const { updateStatus } = useCatalog()
  const { requests } = useRequests()
  const failedRequests = Object.values(requests).filter(
    (request) => request.status === 'failed' || request.status === 'retryable',
  ).length

  if (status !== 'offline' && updateStatus !== 'failed' && failedRequests === 0) {
    return null
  }

  return (
    <div className="app-availability-status" role="status" aria-live="polite" aria-atomic="true">
      {status === 'offline'
        ? 'You are offline. Local devotional content remains available; online videos and updates are unavailable.'
        : updateStatus === 'failed'
          ? 'The latest online catalog could not be checked. Local devotional content remains available.'
          : `${failedRequests} request${failedRequests === 1 ? '' : 's'} could not be completed.`}
    </div>
  )
}

export default function AppShell() {
  const { state, dispatch } = useAppNavigation()
  const documentCoordinator = useDocumentCoordinator()
  const privacyHeadingRef = useRef<HTMLHeadingElement>(null)
  const privacyButtonRef = useRef<HTMLButtonElement>(null)
  const restorePrivacyFocus = useRef(false)
  const previousCatalogRouteDepth = useRef(0)
  const activeRoute = activeNavigationEntry(state).route
  const catalogRouteKey = activeRoute.kind === 'collection'
    ? `collection:${activeRoute.collectionId}`
    : activeRoute.kind === 'playlist'
      ? `playlist:${activeRoute.playlistId}`
      : undefined
  const { catalog } = useCatalog()
  const { network } = usePlatformServices()

  useEffect(() => () => documentCoordinator.dispose(), [documentCoordinator])

  useEffect(() => {
    if (activeRoute.kind === 'privacy') {
      privacyHeadingRef.current?.focus()
    } else if (restorePrivacyFocus.current) {
      restorePrivacyFocus.current = false
      privacyButtonRef.current?.focus()
    }
  }, [activeRoute.kind])

  useLayoutEffect(() => {
    const routeDepth = activeRoute.kind === 'collection'
      ? 1
      : activeRoute.kind === 'playlist'
        ? 2
        : 0
    const isForwardNavigation = routeDepth > previousCatalogRouteDepth.current
    previousCatalogRouteDepth.current = routeDepth
    if (!isForwardNavigation) return

    const headingId = activeRoute.kind === 'collection'
      ? 'collection-screen-title'
      : 'playlist-screen-title'
    document.getElementById(headingId)?.focus({ preventScroll: true })
  }, [activeRoute.kind, catalogRouteKey])

  const pushRoute = (route: AppRoute, focusTargetId: ElementId) => {
    dispatch({
      type: 'push',
      route,
      originScroll: { x: window.scrollX, y: window.scrollY },
      originFocusTargetId: focusTargetId,
    })
  }

  const openPrivacy = () => {
    pushRoute({ kind: 'privacy' }, 'open-privacy-notice' as ElementId)
  }

  const closeCatalogRoute = () => {
    const predecessor = state.stack[state.stack.length - 2]
    dispatch({ type: 'pop' })
    if (!predecessor) return
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.scrollTo(predecessor.scroll.x, predecessor.scroll.y)
      if (predecessor.focusTargetId) {
        document.getElementById(predecessor.focusTargetId)?.focus({ preventScroll: true })
      }
    }))
  }

  const closePrivacy = () => {
    restorePrivacyFocus.current = true
    dispatch({ type: 'pop' })
  }

  return (
    <div className="app" data-route={activeRoute.kind}>
      <div className="bg-grain" aria-hidden="true" />
      <div className="bg-glow-top" aria-hidden="true" />
      <div className="bg-glow-bottom" aria-hidden="true" />
      <Nav />
      <AvailabilityStatus />
      <main>
        {activeRoute.kind === 'privacy' ? (
          <PrivacyNotice ref={privacyHeadingRef} onClose={closePrivacy} />
        ) : activeRoute.kind === 'home' ? (
          <HomeRoute
            documentCoordinator={documentCoordinator}
            onOpenRoute={pushRoute}
          />
        ) : (
          <PlaylistSections
            catalog={catalog}
            networkService={network}
            activeRoute={activeRoute}
            onOpenRoute={pushRoute}
            onBack={closeCatalogRoute}
          />
        )}
      </main>
      <Footer
        onOpenPrivacy={openPrivacy}
        privacyButtonRef={privacyButtonRef}
      />
    </div>
  )
}
