import type {
  BookId,
  Catalog,
  DocumentId,
  PlaylistId,
  VideoId,
} from './catalog'

export type RequestId = string & { readonly __requestIdKind: 'request' }
export type PlaybackRequestId = RequestId & {
  readonly __playbackRequestIdKind: 'playback-request'
}
export type DocumentSessionId = string & {
  readonly __documentSessionIdKind: 'document-session'
}
export type Unsubscribe = () => void

export type DocumentKind = 'bhajan' | 'book'

/** Native document boundaries accept catalog IDs only, never paths or URLs. */
export interface DocumentRequest {
  readonly requestId: RequestId
  readonly documentId: DocumentId
  readonly kind: DocumentKind
}

export interface DocumentSession {
  readonly sessionId: DocumentSessionId
  readonly documentId: DocumentId
  readonly kind: DocumentKind
}

export interface DocumentDismissedEvent {
  readonly sessionId: DocumentSessionId
  readonly documentId: DocumentId
  readonly kind: DocumentKind
}

export interface DocumentService {
  open(request: DocumentRequest): Promise<DocumentSession>
  export(sessionId: DocumentSessionId): Promise<'completed' | 'cancelled'>
  close(sessionId: DocumentSessionId): Promise<void>
  /** User-driven native dismissal; stale or malformed events are ignored by adapters. */
  subscribeDismissed(listener: (event: DocumentDismissedEvent) => void): Unsubscribe
}

export type NetworkStatus = 'online' | 'offline' | 'unknown'

export interface NetworkService {
  currentStatus(): Promise<NetworkStatus>
  subscribe(listener: (status: NetworkStatus) => void): Unsubscribe
}

export type AppPlatform = 'web' | 'android' | 'ios'

export interface AppMetadataService {
  getVersion(): Promise<string>
  getPlatform(): AppPlatform
}

export type LifecycleState = 'active' | 'background'

export interface LifecycleService {
  currentState(): Promise<LifecycleState>
  subscribe(listener: (state: LifecycleState) => void): Unsubscribe
}

export interface PlaybackRequest {
  readonly requestId: PlaybackRequestId
  readonly playlistId: PlaylistId
  readonly videoId?: VideoId
}

export type ExternalMediaPlayerState = 'playing' | 'paused' | 'ended' | 'failed'

export interface PlayerHandle {
  readonly requestId: PlaybackRequestId
  readonly playlistId: PlaylistId
  readonly selectedVideoId?: VideoId
  /**
   * False when the prepared player cannot start on its own and playback waits
   * for the user to press play inside it. WebKit refuses to start audible media
   * without a gesture on the media itself, and these are devotional recordings,
   * so muting to win autoplay is not an option.
   */
  readonly startsAutomatically: boolean
  play(): void
  getCurrentTime(): number
  seekTo(positionSeconds: number): void
  subscribeState(listener: (state: ExternalMediaPlayerState) => void): Unsubscribe
  supportsFullscreen(): boolean
  enterFullscreen(): Promise<void>
  dispose(): void
}

export interface ExternalMediaOpenRequest {
  readonly requestId: PlaybackRequestId
  readonly playlistId: PlaylistId
  readonly videoId?: VideoId
}

export interface ExternalMediaService {
  prepare(request: PlaybackRequest, target: HTMLElement): Promise<PlayerHandle>
  retry(requestId: PlaybackRequestId): Promise<PlayerHandle>
  openExternally(request: ExternalMediaOpenRequest): Promise<void>
}

export type CatalogUpdateResult =
  | { readonly status: 'up-to-date'; readonly catalog: Catalog }
  | { readonly status: 'updated'; readonly catalog: Catalog }
  | {
      readonly status: 'failed'
      readonly requestId: RequestId
      readonly errorCode: string
    }

export interface CatalogRepository {
  loadPackaged(): Promise<Catalog>
  loadLastKnownGood(): Promise<Catalog | null>
  checkForUpdate(signal: AbortSignal): Promise<CatalogUpdateResult>
}

/** A selected book retry remains bound to the same canonical book ID. */
export interface BookOpenRequest extends DocumentRequest {
  readonly documentId: BookId
  readonly kind: 'book'
}

export interface PlatformServices {
  readonly catalog: CatalogRepository
  readonly documents: DocumentService
  readonly network: NetworkService
  readonly lifecycle: LifecycleService
  readonly metadata: AppMetadataService
  readonly externalMedia: ExternalMediaService
}
