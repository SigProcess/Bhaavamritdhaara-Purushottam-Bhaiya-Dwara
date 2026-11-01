import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type PropsWithChildren,
} from 'react'
import { Capacitor } from '@capacitor/core'
import packagedCatalogJson from '../../public/catalog.json'
import type {
  Catalog,
  CatalogRepository,
  NetworkStatus,
  PlatformServices,
  RequestId,
  RequestState,
} from '../domain/contracts'
import {
  createTerminatedLaunchNavigationState,
  navigationReducer,
  type NavigationAction,
  type NavigationState,
} from '../domain/navigation/navigationCoordinator'
import {
  BrowserAppMetadataService,
  BrowserLifecycleService,
  BrowserNetworkService,
  detectBrowserPlatform,
  generatedBuildMetadata,
  selectPlatformAdapters,
} from '../platform/browserAdapters'
import {
  CapacitorAppMetadataService,
  CapacitorDocumentService,
  CapacitorLifecycleService,
  CapacitorNetworkService,
} from '../platform/capacitor/capacitorAdapters'
import { createBrowserDocumentService } from '../platform/browserDocumentService'
import {
  DocumentPresentationCoordinator,
  type DocumentRequestEvent,
} from '../platform/documentPresentationCoordinator'
import { YouTubeIframeExternalMediaService } from '../platform/youtubeIframeExternalMediaService'

const packagedCatalog = packagedCatalogJson as unknown as Catalog

type CatalogUpdateStatus = 'idle' | 'checking' | 'failed'

interface CatalogContextValue {
  readonly catalog: Catalog
  readonly source: 'packaged' | 'last-known-good' | 'remote'
  readonly updateStatus: CatalogUpdateStatus
}

interface RequestContextValue {
  readonly requests: Readonly<Record<RequestId, RequestState>>
  readonly recordDocumentEvent: (event: DocumentRequestEvent) => void
}

interface NetworkContextValue {
  readonly status: NetworkStatus
}

interface NavigationContextValue {
  readonly state: NavigationState
  readonly dispatch: (action: NavigationAction) => void
}

export interface AppPlatformServices extends Omit<PlatformServices, 'catalog'> {
  readonly catalog?: CatalogRepository
}

const CatalogContext = createContext<CatalogContextValue | undefined>(undefined)
const PlatformContext = createContext<AppPlatformServices | undefined>(undefined)
const RequestContext = createContext<RequestContextValue | undefined>(undefined)
const NetworkContext = createContext<NetworkContextValue | undefined>(undefined)
const NavigationContext = createContext<NavigationContextValue | undefined>(undefined)

function requiredContext<Value>(value: Value | undefined, name: string): Value {
  if (value === undefined) throw new Error(`${name} must be used within AppProviders`)
  return value
}

export const useCatalog = () => requiredContext(useContext(CatalogContext), 'useCatalog')
export const usePlatformServices = () => requiredContext(useContext(PlatformContext), 'usePlatformServices')
export const useRequests = () => requiredContext(useContext(RequestContext), 'useRequests')
export const useNetwork = () => requiredContext(useContext(NetworkContext), 'useNetwork')
export const useAppNavigation = () => requiredContext(useContext(NavigationContext), 'useAppNavigation')

function CatalogProvider({
  children,
  repository,
}: PropsWithChildren<{ readonly repository?: CatalogRepository }>) {
  const [value, setValue] = useState<CatalogContextValue>({
    catalog: packagedCatalog,
    source: 'packaged',
    updateStatus: 'idle',
  })

  useEffect(() => {
    if (!repository) return undefined
    const controller = new AbortController()
    let active = true

    const load = async () => {
      try {
        const lastKnownGood = await repository.loadLastKnownGood()
        if (active && lastKnownGood) {
          setValue({ catalog: lastKnownGood, source: 'last-known-good', updateStatus: 'checking' })
        } else if (active) {
          setValue((current) => ({ ...current, updateStatus: 'checking' }))
        }
        const result = await repository.checkForUpdate(controller.signal)
        if (!active) return
        if (result.status === 'failed') {
          setValue((current) => ({ ...current, updateStatus: 'failed' }))
        } else {
          setValue({
            catalog: result.catalog,
            source: result.status === 'updated' ? 'remote' : (lastKnownGood ? 'last-known-good' : 'packaged'),
            updateStatus: 'idle',
          })
        }
      } catch {
        if (active) setValue((current) => ({ ...current, updateStatus: 'failed' }))
      }
    }

    const start = globalThis.requestAnimationFrame
      ? globalThis.requestAnimationFrame(() => void load())
      : globalThis.setTimeout(() => void load(), 0)

    return () => {
      active = false
      controller.abort()
      if (globalThis.cancelAnimationFrame && typeof start === 'number') {
        globalThis.cancelAnimationFrame(start)
      } else {
        globalThis.clearTimeout(start)
      }
    }
  }, [repository])

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
}

function documentRecords(catalog: Catalog) {
  const assets = new Map(catalog.assets.map((asset) => [asset.id, asset]))
  return [...catalog.bhajans, ...catalog.books].flatMap((item) => {
    const asset = assets.get(item.document.assetId)
    return asset ? [{ documentId: item.id, path: asset.path }] : []
  })
}

function createDefaultPlatformServices(catalog: Catalog): AppPlatformServices {
  return selectPlatformAdapters({
    capacitor: Capacitor,
    createNativeIOS: () => ({
      documents: new CapacitorDocumentService(),
      network: new CapacitorNetworkService(),
      lifecycle: new CapacitorLifecycleService(),
      metadata: new CapacitorAppMetadataService(),
      externalMedia: new YouTubeIframeExternalMediaService(catalog),
    }),
    createBrowser: () => ({
      documents: createBrowserDocumentService(documentRecords(catalog)),
      network: new BrowserNetworkService(),
      lifecycle: new BrowserLifecycleService(),
      metadata: new BrowserAppMetadataService(
        generatedBuildMetadata,
        detectBrowserPlatform(),
      ),
      externalMedia: new YouTubeIframeExternalMediaService(catalog),
    }),
  })
}

function PlatformProvider({
  children,
  services,
}: PropsWithChildren<{ readonly services?: AppPlatformServices }>) {
  const { catalog } = useCatalog()
  const value = useMemo(
    () => services ?? createDefaultPlatformServices(catalog),
    [catalog, services],
  )
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
}

function requestReducer(
  state: Readonly<Record<RequestId, RequestState>>,
  event: DocumentRequestEvent,
): Readonly<Record<RequestId, RequestState>> {
  const current = state[event.requestId]
  const status = event.type === 'request-started'
    ? 'pending'
    : event.type === 'request-succeeded'
      ? 'succeeded'
      : event.retryable
        ? 'retryable'
        : 'failed'
  return {
    ...state,
    [event.requestId]: {
      requestId: event.requestId,
      kind: event.kind,
      targetId: event.targetId,
      status,
      ...(event.errorCode ? { errorCode: event.errorCode } : {}),
      ...(event.type === 'request-failed' && event.retryable
        ? { retryPolicy: 'immediate' as const }
        : current?.retryPolicy
          ? { retryPolicy: current.retryPolicy }
          : {}),
    },
  }
}

function RequestProvider({ children }: PropsWithChildren) {
  const [requests, recordDocumentEvent] = useReducer(requestReducer, {})
  const value = useMemo(() => ({ requests, recordDocumentEvent }), [requests])
  return <RequestContext.Provider value={value}>{children}</RequestContext.Provider>
}

function NetworkProvider({ children }: PropsWithChildren) {
  const { network } = usePlatformServices()
  const [status, setStatus] = useState<NetworkStatus>('unknown')

  useEffect(() => {
    let active = true
    void network.currentStatus()
      .then((nextStatus) => {
        if (active) setStatus(nextStatus)
      })
      .catch(() => {
        if (active) setStatus('unknown')
      })
    const unsubscribe = network.subscribe(setStatus)
    return () => {
      active = false
      unsubscribe()
    }
  }, [network])

  return <NetworkContext.Provider value={{ status }}>{children}</NetworkContext.Provider>
}

function NavigationProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(
    navigationReducer,
    undefined,
    createTerminatedLaunchNavigationState,
  )
  return (
    <NavigationContext.Provider value={{ state, dispatch }}>
      {children}
    </NavigationContext.Provider>
  )
}

export interface AppProvidersProps extends PropsWithChildren {
  readonly services?: AppPlatformServices
  readonly catalogRepository?: CatalogRepository
}

export default function AppProviders({
  children,
  services,
  catalogRepository,
}: AppProvidersProps) {
  return (
    <CatalogProvider repository={catalogRepository ?? services?.catalog}>
      <PlatformProvider services={services}>
        <RequestProvider>
          <NetworkProvider>
            <NavigationProvider>{children}</NavigationProvider>
          </NetworkProvider>
        </RequestProvider>
      </PlatformProvider>
    </CatalogProvider>
  )
}

export function useDocumentCoordinator(): DocumentPresentationCoordinator {
  const { documents } = usePlatformServices()
  const { recordDocumentEvent } = useRequests()
  return useMemo(
    () => new DocumentPresentationCoordinator(documents, recordDocumentEvent),
    [documents, recordDocumentEvent],
  )
}
