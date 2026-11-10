import type {
  AppMetadataService,
  AppPlatform,
  LifecycleService,
  LifecycleState,
  NetworkService,
  NetworkStatus,
  Unsubscribe,
} from '../../domain/contracts'

export interface GeneratedBuildMetadata {
  readonly releaseVersion: string
}

export type BrowserRequestOutcome = 'succeeded' | 'network-failed'

interface BrowserEventSource {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

interface BrowserNetworkEnvironment extends BrowserEventSource {
  readonly navigator?: Pick<Navigator, 'onLine'>
}

interface BrowserLifecycleEnvironment extends BrowserEventSource {
  readonly document?: Pick<Document, 'visibilityState'>
}

const browserNetworkEnvironment = (): BrowserNetworkEnvironment => {
  const eventTarget =
    typeof globalThis.addEventListener === 'function' ? globalThis : undefined
  return {
    navigator: typeof navigator === 'undefined' ? undefined : navigator,
    addEventListener: (type, listener) =>
      eventTarget?.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      eventTarget?.removeEventListener(type, listener),
  }
}

const browserLifecycleEnvironment = (): BrowserLifecycleEnvironment => {
  const browserDocument = typeof document === 'undefined' ? undefined : document
  return {
    document: browserDocument,
    addEventListener: (type, listener) =>
      browserDocument?.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      browserDocument?.removeEventListener(type, listener),
  }
}

const advisoryNetworkStatus = (
  browserNavigator: BrowserNetworkEnvironment['navigator'],
): NetworkStatus => {
  if (!browserNavigator || typeof browserNavigator.onLine !== 'boolean') return 'unknown'
  return browserNavigator.onLine ? 'online' : 'offline'
}

/**
 * Browser reachability is advisory. Browser events update the current hint,
 * while actual request outcomes can confirm connectivity or invalidate a stale
 * online hint without marking every server error as offline.
 */
export class BrowserNetworkService implements NetworkService {
  private status: NetworkStatus
  private readonly listeners = new Set<(status: NetworkStatus) => void>()

  constructor(
    private readonly environment: BrowserNetworkEnvironment = browserNetworkEnvironment(),
  ) {
    this.status = advisoryNetworkStatus(environment.navigator)
  }

  async currentStatus(): Promise<NetworkStatus> {
    return this.status
  }

  subscribe(listener: (status: NetworkStatus) => void): Unsubscribe {
    const online = () => this.setStatus('online')
    const offline = () => this.setStatus('offline')
    this.listeners.add(listener)
    this.environment.addEventListener('online', online)
    this.environment.addEventListener('offline', offline)

    return () => {
      this.listeners.delete(listener)
      this.environment.removeEventListener('online', online)
      this.environment.removeEventListener('offline', offline)
    }
  }

  reportRequestOutcome(outcome: BrowserRequestOutcome): void {
    if (outcome === 'succeeded') {
      this.setStatus('online')
      return
    }
    this.setStatus(
      this.environment.navigator?.onLine === false ? 'offline' : 'unknown',
    )
  }

  private setStatus(status: NetworkStatus): void {
    if (status === this.status) return
    this.status = status
    for (const listener of this.listeners) listener(status)
  }
}

const lifecycleState = (
  browserDocument: BrowserLifecycleEnvironment['document'],
): LifecycleState =>
  browserDocument?.visibilityState === 'hidden' ? 'background' : 'active'

export class BrowserLifecycleService implements LifecycleService {
  constructor(
    private readonly environment: BrowserLifecycleEnvironment = browserLifecycleEnvironment(),
  ) {}

  async currentState(): Promise<LifecycleState> {
    return lifecycleState(this.environment.document)
  }

  subscribe(listener: (state: LifecycleState) => void): Unsubscribe {
    const visibilityChanged = () => listener(lifecycleState(this.environment.document))
    this.environment.addEventListener('visibilitychange', visibilityChanged)
    return () =>
      this.environment.removeEventListener('visibilitychange', visibilityChanged)
  }
}

const validateReleaseVersion = (value: string): string => {
  const version = value.trim()
  if (!version || version.length > 64) {
    throw new Error('Generated build metadata contains an invalid release version.')
  }
  return version
}

/**
 * Names the browser runtime the app has to branch on. Android is checked first
 * because only Android resolves YouTube intent URIs. The Apple handhelds are
 * reported as `'ios'` because WebKit refuses to start audible media without a
 * gesture on the media itself, which rules out autoplay there.
 *
 * Every Apple handheld runtime carries one of these tokens, including the
 * Capacitor WKWebView (which keeps WebKit's default agent, since the app sets
 * neither `appendUserAgent` nor `overrideUserAgent`) and Chrome or Firefox for
 * iOS (which are WebKit underneath and keep `iPhone`/`iPad` in their agents).
 *
 * Known limitation: iPadOS Safari requests desktop sites by default and sends a
 * macOS agent, so an iPad in that mode is reported as `'web'`. Desktop Safari
 * gates audible autoplay too, so both fall back to the same correction: a
 * player that stays on screen with its own play button.
 */
export const detectBrowserPlatform = (
  userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent,
): AppPlatform => {
  if (/\bAndroid\b/i.test(userAgent)) return 'android'
  if (/\b(?:iPhone|iPad|iPod)\b/i.test(userAgent)) return 'ios'
  return 'web'
}

export class BrowserAppMetadataService implements AppMetadataService {
  private readonly version: string

  constructor(
    metadata: GeneratedBuildMetadata,
    private readonly platform: AppPlatform = detectBrowserPlatform(),
  ) {
    this.version = validateReleaseVersion(metadata.releaseVersion)
  }

  async getVersion(): Promise<string> {
    return this.version
  }

  getPlatform(): AppPlatform {
    return this.platform
  }
}

export interface CapacitorPlatformDetector {
  isNativePlatform(): boolean
  getPlatform(): string
}

/**
 * Selects native adapters only for a confirmed Capacitor iOS runtime. The
 * browser factory handles ordinary browsers, Android browsers/TWAs, tests, and
 * server-side rendering without importing or invoking a native plugin.
 */
export function selectPlatformAdapters<BrowserValue, NativeIOSValue>(options: {
  readonly capacitor?: CapacitorPlatformDetector
  readonly createBrowser: () => BrowserValue
  readonly createNativeIOS: () => NativeIOSValue
}): BrowserValue | NativeIOSValue {
  const { capacitor } = options
  try {
    if (
      capacitor?.isNativePlatform() === true &&
      capacitor.getPlatform() === 'ios'
    ) {
      return options.createNativeIOS()
    }
  } catch {
    // A missing or partially initialized bridge must behave like a browser.
  }
  return options.createBrowser()
}
