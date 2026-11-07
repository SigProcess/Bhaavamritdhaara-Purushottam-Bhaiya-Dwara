import type {
  Catalog,
  ExternalMediaOpenRequest,
  ExternalMediaPlayerState,
  ExternalMediaService,
  PlaybackRequest,
  PlaybackRequestId,
  PlayerHandle,
  PlaylistRecord,
  Unsubscribe,
} from '../domain/contracts'
import { detectBrowserPlatform } from './browser/browserAdapters'

const YOUTUBE_ANDROID_PACKAGE = 'com.google.android.youtube'

interface YouTubePlayerEvent {
  readonly data: number
}

interface YouTubePlayerInstance {
  playVideo(): void
  getCurrentTime(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getIframe(): HTMLIFrameElement
  destroy(): void
}

interface YouTubePlayerOptions {
  readonly videoId?: string
  readonly playerVars: Readonly<Record<string, string | number>>
  readonly events: {
    readonly onReady: () => void
    readonly onStateChange: (event: YouTubePlayerEvent) => void
    readonly onError: () => void
  }
}

interface YouTubeApi {
  readonly Player: new (
    target: HTMLElement,
    options: YouTubePlayerOptions,
  ) => YouTubePlayerInstance
  readonly PlayerState: {
    readonly ENDED: number
    readonly PLAYING: number
    readonly PAUSED: number
  }
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YouTubeApi> | undefined

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  const pendingApi = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.()
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YOUTUBE_API_UNAVAILABLE'))
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-bhaavamrit-youtube-api]',
    )
    if (existing) return

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.dataset.bhaavamritYoutubeApi = 'true'
    script.addEventListener('error', () => reject(new Error('YOUTUBE_API_LOAD_FAILED')), {
      once: true,
    })
    document.head.append(script)
  }).catch((error: unknown) => {
    document.querySelector<HTMLScriptElement>(
      'script[data-bhaavamrit-youtube-api]',
    )?.remove()
    apiPromise = undefined
    throw error
  })
  apiPromise = pendingApi

  return pendingApi
}

/**
 * Chrome resolves an intent URI to the installed app and follows
 * `browser_fallback_url` when no app can handle it.
 */
function androidIntentUrl(target: string): string {
  const { host, pathname, search } = new URL(target)
  return [
    `intent://${host}${pathname}${search}#Intent`,
    'scheme=https',
    `package=${YOUTUBE_ANDROID_PACKAGE}`,
    `S.browser_fallback_url=${encodeURIComponent(target)}`,
    'end',
  ].join(';')
}

/**
 * An Android Trusted Web Activity can swallow a `_blank` popup, which looks to
 * the user like the link does nothing, so Android navigates to an intent URI
 * instead. Browsers and the Capacitor iOS bridge both hand a `_blank` target to
 * the system already, so they keep the popup and stay on the current page.
 */
function openExternalUrl(target: string): void {
  if (detectBrowserPlatform() === 'android') {
    window.location.assign(androidIntentUrl(target))
    return
  }
  window.open(target, '_blank', 'noopener,noreferrer')
}

function findPlaylist(catalog: Catalog, request: PlaybackRequest): PlaylistRecord {
  const playlist = [...catalog.collectionPlaylists, ...catalog.standalonePlaylists]
    .find(({ id }) => id === request.playlistId)
  if (!playlist) throw new Error('PLAYLIST_NOT_FOUND')
  return playlist
}

class YouTubePlayerHandle implements PlayerHandle {
  readonly selectedVideoId
  private readonly listeners = new Set<(state: ExternalMediaPlayerState) => void>()

  constructor(
    readonly requestId: PlaybackRequestId,
    readonly playlistId: PlaybackRequest['playlistId'],
    selectedVideoId: PlaybackRequest['videoId'],
    private readonly player: YouTubePlayerInstance,
  ) {
    this.selectedVideoId = selectedVideoId
  }

  play(): void {
    this.player.playVideo()
  }

  getCurrentTime(): number {
    const position = this.player.getCurrentTime()
    return Number.isFinite(position) ? Math.max(0, position) : 0
  }

  seekTo(positionSeconds: number): void {
    this.player.seekTo(Math.max(0, positionSeconds), true)
  }

  subscribeState(listener: (state: ExternalMediaPlayerState) => void): Unsubscribe {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  emit(state: ExternalMediaPlayerState): void {
    for (const listener of this.listeners) listener(state)
  }

  supportsFullscreen(): boolean {
    return typeof this.player.getIframe().requestFullscreen === 'function'
  }

  async enterFullscreen(): Promise<void> {
    const iframe = this.player.getIframe()
    if (!iframe.requestFullscreen) throw new Error('FULLSCREEN_UNAVAILABLE')
    await iframe.requestFullscreen()
  }

  dispose(): void {
    this.listeners.clear()
    this.player.destroy()
  }
}

/** Browser adapter that resolves stable catalog IDs before constructing YouTube media. */
export class YouTubeIframeExternalMediaService implements ExternalMediaService {
  private readonly requests = new Map<
    PlaybackRequestId,
    { readonly request: PlaybackRequest; readonly target: HTMLElement }
  >()

  constructor(private readonly catalog: Catalog) {}

  async prepare(request: PlaybackRequest, target: HTMLElement): Promise<PlayerHandle> {
    const playlist = findPlaylist(this.catalog, request)
    const video = request.videoId === undefined
      ? undefined
      : playlist.videos?.find(({ id }) => id === request.videoId)

    if (request.videoId !== undefined && !video) throw new Error('VIDEO_NOT_FOUND')
    if (request.videoId === undefined && !playlist.youtubePlaylistId) {
      throw new Error('PLAYLIST_IDENTIFIER_NOT_FOUND')
    }

    this.requests.set(request.requestId, { request, target })
    const api = await loadYouTubeApi()

    target.replaceChildren()
    const playerTarget = document.createElement('div')
    target.append(playerTarget)

    return new Promise<PlayerHandle>((resolve, reject) => {
      let handle: YouTubePlayerHandle | undefined
      let ready = false
      const player = new api.Player(playerTarget, {
        ...(video ? { videoId: video.sourceVideoId } : {}),
        playerVars: video
          ? { autoplay: 0, rel: 0, playsinline: 1 }
          : {
              autoplay: 0,
              rel: 0,
              playsinline: 1,
              listType: 'playlist',
              list: playlist.youtubePlaylistId!,
            },
        events: {
          onReady: () => {
            handle = new YouTubePlayerHandle(
              request.requestId,
              request.playlistId,
              request.videoId,
              player,
            )
            ready = true
            resolve(handle)
          },
          onStateChange: ({ data }) => {
            if (!handle) return
            if (data === api.PlayerState.PLAYING) handle.emit('playing')
            if (data === api.PlayerState.PAUSED) handle.emit('paused')
            if (data === api.PlayerState.ENDED) handle.emit('ended')
          },
          onError: () => {
            if (ready && handle) handle.emit('failed')
            else reject(new Error('YOUTUBE_PLAYBACK_FAILED'))
          },
        },
      })
    })
  }

  async retry(requestId: PlaybackRequestId): Promise<PlayerHandle> {
    const context = this.requests.get(requestId)
    if (!context) throw new Error('PLAYBACK_REQUEST_NOT_FOUND')
    return this.prepare(context.request, context.target)
  }

  async openExternally(request: ExternalMediaOpenRequest): Promise<void> {
    const playlist = findPlaylist(this.catalog, request)
    const video = request.videoId === undefined
      ? undefined
      : playlist.videos?.find(({ id }) => id === request.videoId)
    if (request.videoId !== undefined && !video) throw new Error('VIDEO_NOT_FOUND')
    if (!video && !playlist.youtubePlaylistId) {
      throw new Error('PLAYLIST_IDENTIFIER_NOT_FOUND')
    }
    const url = video
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.sourceVideoId)}`
      : `https://www.youtube.com/playlist?list=${encodeURIComponent(playlist.youtubePlaylistId!)}`
    openExternalUrl(url)
  }
}
