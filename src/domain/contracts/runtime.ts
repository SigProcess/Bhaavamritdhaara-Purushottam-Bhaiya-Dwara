import type {
  AssetId,
  Catalog,
  CatalogVersionId,
  CollectionId,
  DocumentId,
  PlaylistId,
  VideoId,
} from './catalog'
import type { NavigationStack } from './navigation'
import type {
  DocumentSessionId,
  NetworkStatus,
  PlaybackRequestId,
  RequestId,
} from './platform'
export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'failed'

export interface RecordedVideoPlayerState {
  readonly mode: 'recorded-videos'
  readonly playlistId: PlaylistId
  readonly selectedVideoId: VideoId
  readonly playbackState: PlaybackState
  readonly positionSeconds?: number
}

export interface PlaylistEmbedPlayerState {
  readonly mode: 'playlist-embed'
  readonly playlistId: PlaylistId
  readonly playbackState: PlaybackState
  readonly positionSeconds?: number
}

export interface UnavailablePlayerState {
  readonly mode: 'unavailable'
  readonly playlistId: PlaylistId
  /** Canonical title used to name the unavailable playlist while its origin remains visible. */
  readonly playlistTitle: string
  readonly playbackState: 'failed'
}

export type PlayerState =
  | RecordedVideoPlayerState
  | PlaylistEmbedPlayerState
  | UnavailablePlayerState

export type RequestKind =
  | 'catalog-update'
  | 'collection'
  | 'thumbnail'
  | 'playback'
  | 'document-open'
  | 'document-export'

export type RequestStatus = 'pending' | 'failed' | 'retryable' | 'succeeded'

export type RequestTargetId =
  | CollectionId
  | PlaylistId
  | VideoId
  | AssetId
  | DocumentId
  | DocumentSessionId
  | CatalogVersionId

export interface RequestState {
  readonly requestId: RequestId
  readonly kind: RequestKind
  /** Stable catalog or session ID; never a native path or external URL. */
  readonly targetId: RequestTargetId
  readonly status: RequestStatus
  readonly errorCode?: string
  /** Network-bound failures remain disabled until connectivity returns. */
  readonly retryPolicy?: 'immediate' | 'when-online'
}

export interface CatalogState {
  readonly active: Catalog
  readonly source: 'packaged' | 'last-known-good' | 'remote'
  readonly updateRequestId?: RequestId
}

export interface BhajanFinderState {
  readonly rawQuery: string
  readonly showAll: boolean
}

export interface DocumentPresentationState {
  readonly documentId: DocumentId
  readonly sessionId: DocumentSessionId
}

export interface AppState {
  readonly catalog: CatalogState
  readonly navigation: NavigationStack
  readonly bhajanFinder: BhajanFinderState
  readonly player?: PlayerState
  readonly documentPresentation?: DocumentPresentationState
  readonly requests: Readonly<Record<RequestId, RequestState>>
  readonly activePlaybackRequestId?: PlaybackRequestId
  readonly network: NetworkStatus
}
