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

/**
 * The origin this app is published under on the web. It is the one identity
 * YouTube can resolve for this project, so an embed that has no usable origin
 * of its own declares this one.
 */
const PUBLISHED_WEB_ORIGIN = 'https://purushottambhaiya.netlify.app'

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

/**
 * Names the origin an embed has to declare for itself, or `undefined` when the
 * page already has one YouTube can read.
 *
 * YouTube identifies an embedding client by the origin and referrer of the page
 * that frames it, and reduces player functionality for a client it cannot
 * identify. The Capacitor iOS web view serves the bundled app from
 * `capacitor://localhost`, which resolves to nothing YouTube knows, and the
 * result on a device is exactly that reduction: the player paints with its own
 * play button and tapping it does nothing at all — no error, no retry state.
 *
 * The real condition is "the runtime origin is not an http(s) origin", not "the
 * platform is iOS". Every http(s) host this app runs on — the published site,
 * the Android Trusted Web Activity, the dev server, jsdom — already carries an
 * identity YouTube accepts and is left alone. Any custom-scheme host has the
 * same problem whatever platform it belongs to. Where no runtime can be
 * inspected at all, assume the published origin, which keeps the existing path.
 */
function originToDeclare(
  runtimeOrigin = typeof window === 'undefined'
    ? PUBLISHED_WEB_ORIGIN
    : window.location.origin,
): string | undefined {
  return /^https?:\/\//i.test(runtimeOrigin) ? undefined : PUBLISHED_WEB_ORIGIN
}

/**
 * Builds an embed URL that declares who is framing it.
 *
 * `enablejsapi` is deliberately absent. The declared origin cannot match this
 * page's real origin — that is the whole point of declaring it — so YouTube's
 * postMessage replies have nowhere to land and the JS API could never deliver a
 * state event or accept a command. Asking for an API that cannot answer would
 * only leave the app waiting for a PLAYING event that never arrives. `mute` is
 * absent too, and stays absent: these are devotional recordings, so one tap on
 * YouTube's own play button beats silent playback.
 */
function declaredOriginEmbedUrl(options: {
  readonly origin: string
  readonly sourceVideoId?: string
  readonly youtubePlaylistId?: string
}): string {
  const parameters = new URLSearchParams({
    autoplay: '0',
    rel: '0',
    playsinline: '1',
    origin: options.origin,
    widget_referrer: options.origin,
  })
  if (options.sourceVideoId !== undefined) {
    const path = encodeURIComponent(options.sourceVideoId)
    return `https://www.youtube.com/embed/${path}?${parameters.toString()}`
  }
  parameters.set('list', options.youtubePlaylistId!)
  return `https://www.youtube.com/embed/videoseries?${parameters.toString()}`
}

function findPlaylist(catalog: Catalog, request: PlaybackRequest): PlaylistRecord {
  const playlist = [...catalog.collectionPlaylists, ...catalog.standalonePlaylists]
    .find(({ id }) => id === request.playlistId)
  if (!playlist) throw new Error('PLAYLIST_NOT_FOUND')
  return playlist
}

/**
 * A player that only YouTube drives.
 *
 * With no JS API channel there is no playback state to report and no way to
 * start, seek, or stop playback from here, so this handle says so rather than
 * pretending: it never emits a state, and `startsAutomatically` is false, which
 * is what makes the caller present the embed as ready to tap immediately
 * instead of counting down to a timeout. The accepted cost is that the app
 * cannot display "Playing" or drive its own controls on this path.
 */
class DeclaredOriginEmbedHandle implements PlayerHandle {
  readonly selectedVideoId
  readonly startsAutomatically = false

  constructor(
    readonly requestId: PlaybackRequestId,
    readonly playlistId: PlaybackRequest['playlistId'],
    selectedVideoId: PlaybackRequest['videoId'],
    private readonly iframe: HTMLIFrameElement,
  ) {
    this.selectedVideoId = selectedVideoId
  }

  /** YouTube's own play button is the only thing that can start this embed. */
  play(): void {}

  /** No API channel, so no position is observable. Zero is the honest answer. */
  getCurrentTime(): number {
    return 0
  }

  seekTo(): void {}

  subscribeState(): Unsubscribe {
    return () => {}
  }

  supportsFullscreen(): boolean {
    return typeof this.iframe.requestFullscreen === 'function'
  }

  async enterFullscreen(): Promise<void> {
    if (!this.iframe.requestFullscreen) throw new Error('FULLSCREEN_UNAVAILABLE')
    await this.iframe.requestFullscreen()
  }

  dispose(): void {
    this.iframe.remove()
  }
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
   *
   * A runtime whose origin YouTube cannot resolve takes a different route
   * entirely: a plain embed that declares the published origin, with no JS API,
   * because without an identity YouTube will not play at all.
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

    const declaredOrigin = originToDeclare()
    if (declaredOrigin !== undefined) {
      return this.prepareDeclaredOriginEmbed(request, target, {
        origin: declaredOrigin,
        ...(video ? { sourceVideoId: video.sourceVideoId } : {}),
        ...(video ? {} : { youtubePlaylistId: playlist.youtubePlaylistId! }),
      })
    }

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

  /**
   * Mounts a plain embed and hands back a handle straight away. There is no
   * load or ready event worth waiting for: once the iframe is in the document
   * YouTube's player is the only thing left to act, and waiting on a signal
   * that may never come is what made this screen look broken in the first
   * place. The caller sees `startsAutomatically: false` and points the reader
   * at the play button immediately.
   */
  private async prepareDeclaredOriginEmbed(
    request: PlaybackRequest,
    target: HTMLElement,
    embed: {
      readonly origin: string
      readonly sourceVideoId?: string
      readonly youtubePlaylistId?: string
    },
  ): Promise<PlayerHandle> {
    target.replaceChildren()
    const iframe = document.createElement('iframe')
    iframe.src = declaredOriginEmbedUrl(embed)
    iframe.title = 'YouTube video player'
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture'
    iframe.allowFullscreen = true
    iframe.setAttribute('frameborder', '0')
    target.append(iframe)

    return new DeclaredOriginEmbedHandle(
      request.requestId,
      request.playlistId,
      request.videoId,
      iframe,
    )
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
