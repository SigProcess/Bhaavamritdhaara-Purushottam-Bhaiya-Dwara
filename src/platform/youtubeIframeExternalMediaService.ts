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
 * The HTTPS page that hosts the player when this runtime cannot supply an origin YouTube accepts.
 * Served from `public/embed.html` on the deployed site.
 */
const EMBED_HOST_ORIGIN = 'https://purushottambhaiya.netlify.app'
const EMBED_HOST_PATH = '/embed.html'

/** Envelope names for the two directions of the bridge. */
const EMBED_HOST_MESSAGE_SOURCE = 'bhaavamrit-embed-host'
const EMBED_MESSAGE_SOURCE = 'bhaavamrit-embed'

const EMBED_HELLO_INTERVAL_MS = 250
const EMBED_READY_TIMEOUT_MS = 15_000

/** YouTube video ids are exactly eleven URL-safe base64 characters. */
export const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export function isSupportedYouTubeVideoId(value: unknown): value is string {
  return typeof value === 'string' && YOUTUBE_VIDEO_ID_PATTERN.test(value)
}

/**
 * True where the page's own origin is not one YouTube can resolve.
 *
 * The iOS app serves its bundled assets from `capacitor://localhost`, and a page on a custom
 * scheme sends no HTTP `Origin` or `Referer` header at all. YouTube reads those headers, not the
 * `origin` parameter an embed URL declares, so an embed created directly by such a page is
 * refused. Everything on `http:` or `https:` already has an origin YouTube accepts and keeps the
 * direct embed untouched.
 */
export function requiresEmbedHost(
  protocol: string = typeof window === 'undefined' ? 'https:' : window.location.protocol,
): boolean {
  return protocol !== 'http:' && protocol !== 'https:'
}

/** Builds the host-page URL. Rejects any id that is not exactly a YouTube video id. */
export function embedHostUrl(sourceVideoId: string): string {
  if (!isSupportedYouTubeVideoId(sourceVideoId)) throw new Error('EMBED_VIDEO_ID_REJECTED')
  return `${EMBED_HOST_ORIGIN}${EMBED_HOST_PATH}?v=${encodeURIComponent(sourceVideoId)}`
}

type EmbedInboundMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'state'; readonly state: ExternalMediaPlayerState }
  | { readonly type: 'time'; readonly positionSeconds: number }

interface EmbedMessageEventLike {
  readonly origin: string
  readonly source: unknown
  readonly data: unknown
}

/**
 * Validates one inbound message from the host page before any of it is acted on.
 *
 * The channel is cross-origin, so the message is untrusted input: the origin has to be the embed
 * host exactly, the sender has to be the frame this handle created, the envelope has to carry the
 * expected `source`, and the type has to be one of three with a payload that type-checks. Anything
 * else is dropped. `expectedSource` is compared only when it is known, because a frame whose
 * window is not yet reachable cannot be matched against anything.
 */
export function parseEmbedMessage(
  event: EmbedMessageEventLike,
  expectedSource: unknown,
): EmbedInboundMessage | undefined {
  if (event.origin !== EMBED_HOST_ORIGIN) return undefined
  if (expectedSource !== null && expectedSource !== undefined && event.source !== expectedSource) {
    return undefined
  }
  if (typeof event.data !== 'object' || event.data === null) return undefined
  const data = event.data as Record<string, unknown>
  if (data.source !== EMBED_MESSAGE_SOURCE) return undefined

  if (data.type === 'ready') return { type: 'ready' }
  if (data.type === 'state') {
    const { state } = data
    return state === 'playing' || state === 'paused' || state === 'ended' || state === 'failed'
      ? { type: 'state', state }
      : undefined
  }
  if (data.type === 'time') {
    const { positionSeconds } = data
    return typeof positionSeconds === 'number'
      && Number.isFinite(positionSeconds)
      && positionSeconds >= 0
      ? { type: 'time', positionSeconds }
      : undefined
  }
  return undefined
}

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

/**
 * A player that lives two frames down: this handle drives `public/embed.html`, which in turn
 * frames YouTube from a real HTTPS origin.
 *
 * Only the commands the caller genuinely uses cross the channel. `getCurrentTime()` has to stay
 * synchronous for the `PlayerHandle` contract, so the host page reports its position on a timer
 * and on every state change, and this handle answers from the last report.
 */
class EmbedHostPlayerHandle implements PlayerHandle {
  readonly selectedVideoId
  /**
   * Always false. The host page creates its player paused and unmuted, because WebKit starts
   * audible media only from a gesture on the media itself. The point of the nested page is that
   * the tap on YouTube's own play button now works, not that playback starts by itself.
   */
  readonly startsAutomatically = false
  private readonly listeners = new Set<(state: ExternalMediaPlayerState) => void>()
  private lastState: ExternalMediaPlayerState | undefined
  private positionSeconds = 0
  private disposed = false

  constructor(
    readonly requestId: PlaybackRequestId,
    readonly playlistId: PlaybackRequest['playlistId'],
    selectedVideoId: PlaybackRequest['videoId'],
    private readonly iframe: HTMLIFrameElement,
    private readonly detach: () => void,
  ) {
    this.selectedVideoId = selectedVideoId
  }

  private command(
    message: { readonly type: 'play' | 'pause' } | { readonly type: 'seek'; readonly positionSeconds: number },
  ): void {
    this.iframe.contentWindow?.postMessage(
      { source: EMBED_HOST_MESSAGE_SOURCE, ...message },
      EMBED_HOST_ORIGIN,
    )
  }

  play(): void {
    this.command({ type: 'play' })
  }

  getCurrentTime(): number {
    return this.positionSeconds
  }

  seekTo(positionSeconds: number): void {
    const position = Math.max(0, positionSeconds)
    this.positionSeconds = position
    this.command({ type: 'seek', positionSeconds: position })
  }

  /** Records a position report from the host page. */
  reportPosition(positionSeconds: number): void {
    this.positionSeconds = Math.max(0, positionSeconds)
  }

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
    return typeof this.iframe.requestFullscreen === 'function'
  }

  async enterFullscreen(): Promise<void> {
    if (!this.iframe.requestFullscreen) throw new Error('FULLSCREEN_UNAVAILABLE')
    await this.iframe.requestFullscreen()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    // Silence the recording before the frame goes, so audio never outlives the screen.
    this.command({ type: 'pause' })
    this.listeners.clear()
    this.detach()
    this.iframe.remove()
  }
}

/**
 * Mounts the HTTPS host page and completes a handshake with it.
 *
 * The host page cannot address its parent until the parent speaks first: the app's origin may
 * serialise opaquely in WebKit, and `postMessage` cannot name an opaque origin. So the parent
 * greets on a short repeat until the page answers `ready`, which also removes any dependence on
 * the iframe's `load` event firing.
 */
function prepareEmbedHostPlayer(
  request: PlaybackRequest,
  target: HTMLElement,
  sourceVideoId: string,
): Promise<PlayerHandle> {
  const source = embedHostUrl(sourceVideoId)
  target.replaceChildren()
  const iframe = document.createElement('iframe')
  iframe.title = 'YouTube video player'
  iframe.allow = 'encrypted-media; fullscreen; picture-in-picture'
  iframe.allowFullscreen = true
  iframe.src = source
  target.append(iframe)

  return new Promise<PlayerHandle>((resolve, reject) => {
    let handle: EmbedHostPlayerHandle | undefined
    let settled = false
    let stateBeforeReady: ExternalMediaPlayerState | undefined
    let greeting: ReturnType<typeof setInterval> | undefined
    let deadline: ReturnType<typeof setTimeout> | undefined

    const stopHandshake = (): void => {
      if (greeting !== undefined) clearInterval(greeting)
      greeting = undefined
      if (deadline !== undefined) clearTimeout(deadline)
      deadline = undefined
    }
    const detach = (): void => {
      stopHandshake()
      window.removeEventListener('message', receive)
    }
    const abandon = (reason: string): void => {
      settled = true
      detach()
      iframe.remove()
      reject(new Error(reason))
    }

    function receive(event: MessageEvent): void {
      const message = parseEmbedMessage(event, iframe.contentWindow)
      if (message === undefined) return

      if (message.type === 'time') {
        handle?.reportPosition(message.positionSeconds)
        return
      }
      if (message.type === 'ready') {
        if (settled) return
        settled = true
        stopHandshake()
        handle = new EmbedHostPlayerHandle(
          request.requestId,
          request.playlistId,
          request.videoId,
          iframe,
          detach,
        )
        if (stateBeforeReady !== undefined) handle.emit(stateBeforeReady)
        resolve(handle)
        return
      }
      if (!settled) {
        // A failure before the handshake is a player that never existed, which matches how the
        // direct embed reports an error raised before `onReady`.
        if (message.state === 'failed') abandon('YOUTUBE_PLAYBACK_FAILED')
        else stateBeforeReady = message.state
        return
      }
      handle?.emit(message.state)
    }

    const greet = (): void => {
      iframe.contentWindow?.postMessage(
        { source: EMBED_HOST_MESSAGE_SOURCE, type: 'hello' },
        EMBED_HOST_ORIGIN,
      )
    }

    window.addEventListener('message', receive)
    greet()
    greeting = setInterval(greet, EMBED_HELLO_INTERVAL_MS)
    deadline = setTimeout(() => {
      if (settled) return
      abandon('EMBED_HOST_UNAVAILABLE')
    }, EMBED_READY_TIMEOUT_MS)
  })
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
   * Where the page's own origin is not one YouTube resolves — the iOS app on
   * `capacitor://localhost` — a single video is routed through the HTTPS host
   * page instead, which supplies the origin and relays state back over
   * `postMessage`. That handle also reports `startsAutomatically: false`, so
   * the caller's wait-for-the-tap path is unchanged; what changes is that the
   * tap now reaches a player YouTube is willing to start.
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

    // A runtime without an origin YouTube can resolve plays through the HTTPS host page instead
    // of embedding YouTube itself. Only an explicit single-video request takes that route; the
    // playlist fallback and every http(s) runtime keep the direct embed below, untouched.
    if (video !== undefined && requiresEmbedHost()) {
      return prepareEmbedHostPlayer(request, target, video.sourceVideoId)
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
