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

/**
 * Autoplay is a per-platform decision, not a preference.
 *
 * Android Chrome rejects a cross-origin `playVideo()` from the parent frame
 * because that frame's activation does not reach the iframe, so the start has
 * to live inside the iframe's own load (`autoplay: 1`). WebKit refuses the
 * opposite way round: audible media may only start from a gesture on the media
 * itself, so `autoplay: 1` cannot succeed on iOS at all and only makes the
 * player look broken while it waits. There, the embed is created paused and
 * YouTube's own play button inside the iframe does the starting.
 *
 * Muting is never an option: these are devotional recordings, so an extra tap
 * beats silent playback.
 */
function autoplayStartsPlayback(): boolean {
  return detectBrowserPlatform() !== 'ios'
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
  private lastState: ExternalMediaPlayerState | undefined

  constructor(
    readonly requestId: PlaybackRequestId,
    readonly playlistId: PlaybackRequest['playlistId'],
    selectedVideoId: PlaybackRequest['videoId'],
    readonly startsAutomatically: boolean,
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

  /**
   * YouTube can report a state before the consumer subscribes, because the
   * player's first message can arrive ahead of `onReady`. Replaying the last
   * state keeps a late subscriber from missing an already-started playback.
   */
  subscribeState(listener: (state: ExternalMediaPlayerState) => void): Unsubscribe {
    this.listeners.add(listener)
    if (this.lastState !== undefined) listener(this.lastState)
    return () => this.listeners.delete(listener)
  }

  emit(state: ExternalMediaPlayerState): void {
    this.lastState = state
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

  /**
   * An explicit video request starts inside the iframe's own load
   * (`autoplay: 1`) wherever that is allowed, because a cross-origin
   * `playVideo()` from the parent frame has no user activation of its own and
   * Chrome for Android rejects it. On iOS the same parameter is `0`, since
   * WebKit cannot honour it, and the resulting handle reports
   * `startsAutomatically: false` so the caller waits for the user instead of
   * treating a quiet player as a failure. The playlist fallback keeps
   * `autoplay: 0` so merely opening a playlist is silent.
   */
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
    const autostarts = video !== undefined && autoplayStartsPlayback()

    return new Promise<PlayerHandle>((resolve, reject) => {
      let handle: YouTubePlayerHandle | undefined
      let ready = false
      let stateBeforeReady: ExternalMediaPlayerState | undefined
      const player = new api.Player(playerTarget, {
        ...(video ? { videoId: video.sourceVideoId } : {}),
        playerVars: video
          ? { autoplay: autostarts ? 1 : 0, rel: 0, playsinline: 1 }
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
              autostarts,
              player,
            )
            ready = true
            if (stateBeforeReady !== undefined) handle.emit(stateBeforeReady)
            resolve(handle)
          },
          onStateChange: ({ data }) => {
            const state: ExternalMediaPlayerState | undefined =
              data === api.PlayerState.PLAYING
                ? 'playing'
                : data === api.PlayerState.PAUSED
                  ? 'paused'
                  : data === api.PlayerState.ENDED
                    ? 'ended'
                    : undefined
            if (state === undefined) return
            if (!handle) {
              stateBeforeReady = state
              return
            }
            handle.emit(state)
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
