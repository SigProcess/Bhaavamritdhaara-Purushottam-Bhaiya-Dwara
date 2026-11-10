import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Catalog, PlaybackRequestId, PlayerHandle } from '../domain/contracts'
import { canonicalCatalogFixture } from '../test-support/fixtures/catalogs'
import { YouTubeIframeExternalMediaService } from './youtubeIframeExternalMediaService'

const EMBED_ORIGIN = 'https://purushottambhaiya.netlify.app'
const REAL_VIDEO_ID = 'vokyaFhvtXs'

/**
 * The fixture catalogue uses readable placeholder ids, which are deliberately not real YouTube
 * ids. The host page refuses anything that is not one, so the nested path needs a catalogue whose
 * first video carries a real id.
 */
function catalogWithRealVideoId(sourceVideoId = REAL_VIDEO_ID): Catalog {
  const [playlist, ...otherPlaylists] = canonicalCatalogFixture.collectionPlaylists
  const [video, ...otherVideos] = playlist.videos!
  return {
    ...canonicalCatalogFixture,
    collectionPlaylists: [
      { ...playlist, videos: [{ ...video, sourceVideoId }, ...otherVideos] },
      ...otherPlaylists,
    ],
  }
}

/** Pretends the page was served from the iOS app's own origin. */
function runOnCapacitorOrigin(): void {
  vi.spyOn(window, 'location', 'get').mockReturnValue({
    ...window.location,
    protocol: 'capacitor:',
    origin: 'capacitor://localhost',
    href: 'capacitor://localhost/',
  } as unknown as Location)
}

interface HostFrame {
  readonly window: Window
  readonly posted: ReturnType<typeof vi.fn>
  readonly send: (data: unknown, origin?: string, source?: unknown) => void
}

/**
 * Stands in for `embed.html`: a real same-document frame whose window is substituted for the
 * player iframe's, so commands are observable and relayed messages carry a genuine `source`.
 */
function attachHostFrame(iframe: HTMLIFrameElement): HostFrame {
  const carrier = document.createElement('iframe')
  document.body.append(carrier)
  const hostWindow = carrier.contentWindow!
  const posted = vi.fn()
  Object.defineProperty(hostWindow, 'postMessage', { value: posted, configurable: true })
  Object.defineProperty(iframe, 'contentWindow', { value: hostWindow, configurable: true })
  return {
    window: hostWindow,
    posted,
    send: (data, origin = EMBED_ORIGIN, source: unknown = hostWindow) => {
      window.dispatchEvent(
        new MessageEvent('message', { data, origin, source: source as MessageEventSource }),
      )
    },
  }
}

const state = (value: string) => ({ source: 'bhaavamrit-embed', type: 'state', state: value })
const time = (positionSeconds: number) =>
  ({ source: 'bhaavamrit-embed', type: 'time', positionSeconds })
const ready = { source: 'bhaavamrit-embed', type: 'ready' }

function playerIframe(target: HTMLElement): HTMLIFrameElement {
  const iframe = target.querySelector('iframe')
  if (!iframe) throw new Error('no iframe was mounted')
  return iframe
}

/**
 * Starts a single-video request and completes the handshake the host page would complete.
 * `prepare` mounts the iframe synchronously, so the frame can be substituted before the
 * promise is awaited.
 */
async function prepareThroughHost(options: {
  readonly catalog?: Catalog
  readonly requestId?: string
} = {}): Promise<{
  readonly handle: PlayerHandle
  readonly host: HostFrame
  readonly target: HTMLElement
  readonly iframe: HTMLIFrameElement
}> {
  const catalog = options.catalog ?? catalogWithRealVideoId()
  const service = new YouTubeIframeExternalMediaService(catalog)
  const target = document.createElement('div')
  document.body.append(target)
  const playlist = catalog.collectionPlaylists[0]
  const pending = service.prepare({
    requestId: (options.requestId ?? 'playback-embed-host') as PlaybackRequestId,
    playlistId: playlist.id,
    videoId: playlist.videos![0].id,
  }, target)

  const iframe = playerIframe(target)
  const host = attachHostFrame(iframe)
  host.send(ready)
  return { handle: await pending, host, target, iframe }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.replaceChildren()
  delete window.YT
})

describe('nested host-page playback on a custom-scheme origin', () => {
  it('frames the HTTPS host page instead of YouTube, and never loads the IFrame API', async () => {
    runOnCapacitorOrigin()
    const { iframe } = await prepareThroughHost()

    expect(iframe.src).toBe(`${EMBED_ORIGIN}/embed.html?v=${REAL_VIDEO_ID}`)
    expect(iframe.allowFullscreen).toBe(true)
    expect(
      document.querySelector('script[data-bhaavamrit-youtube-api]'),
    ).toBeNull()
    expect(iframe.src).not.toContain('mute')
  })

  /**
   * WebKit still needs the tap on YouTube's own play button, so the handle reports that it will
   * not self-start and the caller keeps its "tap play" path. What is new is that the player then
   * reports real state, instead of the screen having none at all.
   */
  it('waits for the tap and then relays the player states behind it', async () => {
    runOnCapacitorOrigin()
    const { handle, host } = await prepareThroughHost()
    expect(handle.startsAutomatically).toBe(false)

    const listener = vi.fn()
    handle.subscribeState(listener)
    host.send(state('playing'))
    expect(listener).toHaveBeenLastCalledWith('playing')
    host.send(state('paused'))
    expect(listener).toHaveBeenLastCalledWith('paused')
    host.send(state('ended'))
    expect(listener).toHaveBeenLastCalledWith('ended')
    host.send(state('failed'))
    expect(listener).toHaveBeenLastCalledWith('failed')
  })

  it('replays a state observed before the subscriber attaches', async () => {
    runOnCapacitorOrigin()
    const { handle, host } = await prepareThroughHost()
    host.send(state('playing'))

    const listener = vi.fn()
    handle.subscribeState(listener)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith('playing')
  })

  it('answers getCurrentTime from the position the host page reports', async () => {
    runOnCapacitorOrigin()
    const { handle, host } = await prepareThroughHost()

    expect(handle.getCurrentTime()).toBe(0)
    host.send(time(41.25))
    expect(handle.getCurrentTime()).toBe(41.25)
    host.send(time(0))
    expect(handle.getCurrentTime()).toBe(0)
  })

  it('sends only the closed command set, addressed to the embed host alone', async () => {
    runOnCapacitorOrigin()
    const { handle, host } = await prepareThroughHost()
    host.posted.mockClear()

    handle.play()
    handle.seekTo(90)
    handle.seekTo(-30)

    expect(host.posted.mock.calls.map(([message]) => message)).toEqual([
      { source: 'bhaavamrit-embed-host', type: 'play' },
      { source: 'bhaavamrit-embed-host', type: 'seek', positionSeconds: 90 },
      { source: 'bhaavamrit-embed-host', type: 'seek', positionSeconds: 0 },
    ])
    for (const [, origin] of host.posted.mock.calls) expect(origin).toBe(EMBED_ORIGIN)
    // A clamped seek is also what the handle then reports back.
    expect(handle.getCurrentTime()).toBe(0)
  })

  it('pauses, unhooks the channel, and removes the frame when disposed', async () => {
    runOnCapacitorOrigin()
    const { handle, host, target } = await prepareThroughHost()
    const listener = vi.fn()
    handle.subscribeState(listener)
    host.posted.mockClear()

    handle.dispose()

    expect(host.posted).toHaveBeenCalledWith(
      { source: 'bhaavamrit-embed-host', type: 'pause' },
      EMBED_ORIGIN,
    )
    expect(target.querySelector('iframe')).toBeNull()
    host.send(state('playing'))
    expect(listener).not.toHaveBeenCalled()
  })

  it('offers fullscreen through its own frame element', async () => {
    runOnCapacitorOrigin()
    const { handle, iframe } = await prepareThroughHost()
    const requestFullscreen = vi.fn(async () => {})
    Object.defineProperty(iframe, 'requestFullscreen', {
      value: requestFullscreen,
      configurable: true,
    })

    expect(handle.supportsFullscreen()).toBe(true)
    await handle.enterFullscreen()
    expect(requestFullscreen).toHaveBeenCalledOnce()
  })

  it('refuses a request whose catalogue id is not a YouTube video id', async () => {
    runOnCapacitorOrigin()
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const target = document.createElement('div')
    const playlist = canonicalCatalogFixture.collectionPlaylists[0]

    await expect(service.prepare({
      requestId: 'playback-bad-id' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: playlist.videos![0].id,
    }, target)).rejects.toThrow('EMBED_VIDEO_ID_REJECTED')
    expect(target.querySelector('iframe')).toBeNull()
  })

  it('reports a host-page failure raised before the handshake as a failed request', async () => {
    runOnCapacitorOrigin()
    const service = new YouTubeIframeExternalMediaService(catalogWithRealVideoId())
    const target = document.createElement('div')
    document.body.append(target)
    const playlist = catalogWithRealVideoId().collectionPlaylists[0]
    const pending = service.prepare({
      requestId: 'playback-host-failed' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: playlist.videos![0].id,
    }, target)

    const host = attachHostFrame(playerIframe(target))
    host.send(state('failed'))

    await expect(pending).rejects.toThrow('YOUTUBE_PLAYBACK_FAILED')
    expect(target.querySelector('iframe')).toBeNull()
  })
})

describe('the host-page channel treats every inbound message as untrusted', () => {
  it('ignores a handshake from any origin other than the embed host', async () => {
    runOnCapacitorOrigin()
    vi.useFakeTimers()
    const service = new YouTubeIframeExternalMediaService(catalogWithRealVideoId())
    const target = document.createElement('div')
    document.body.append(target)
    const playlist = catalogWithRealVideoId().collectionPlaylists[0]
    const settled = vi.fn()
    const failed = vi.fn()
    service.prepare({
      requestId: 'playback-foreign-origin' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: playlist.videos![0].id,
    }, target).then(settled, failed)

    const host = attachHostFrame(playerIframe(target))
    host.send(ready, 'https://evil.example')
    host.send(ready, 'capacitor://localhost')
    host.send(state('playing'), 'https://www.youtube.com')
    await Promise.resolve()
    expect(settled).not.toHaveBeenCalled()

    // Nothing legitimate ever arrives, so the request gives up rather than hang.
    await vi.advanceTimersByTimeAsync(16_000)
    expect(settled).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledOnce()
    expect(String(failed.mock.calls[0][0])).toContain('EMBED_HOST_UNAVAILABLE')
    vi.useRealTimers()
  })

  it('ignores a message from a different frame, a different envelope, or a bad shape', async () => {
    runOnCapacitorOrigin()
    const { handle, host } = await prepareThroughHost()
    const listener = vi.fn()
    handle.subscribeState(listener)
    const impostor = document.createElement('iframe')
    document.body.append(impostor)

    host.send(state('playing'), EMBED_ORIGIN, impostor.contentWindow)
    host.send({ source: 'bhaavamrit-embed-host', type: 'state', state: 'playing' })
    host.send({ event: 'infoDelivery', info: { playerState: 1 } })
    host.send({ source: 'bhaavamrit-embed', type: 'state', state: 'buffering' })
    host.send({ source: 'bhaavamrit-embed', type: 'eval', code: 'window.close()' })
    host.send('playing')
    host.send(null)

    expect(listener).not.toHaveBeenCalled()
    host.send(time(-5))
    host.send(time(Number.NaN))
    expect(handle.getCurrentTime()).toBe(0)
  })
})

describe('an http(s) runtime keeps the direct embed', () => {
  it('builds the YouTube player itself and frames no host page', async () => {
    // jsdom serves the test document over http:, which is the web and TWA case.
    expect(window.location.protocol).toBe('http:')
    const installs: Array<{ videoId?: string }> = []
    window.YT = {
      Player: class {
        readonly iframe = document.createElement('iframe')
        constructor(_target: HTMLElement, options: {
          videoId?: string
          events: { onReady(): void }
        }) {
          installs.push({ videoId: options.videoId })
          queueMicrotask(() => options.events.onReady())
        }
        playVideo() {}
        getCurrentTime() { return 0 }
        seekTo() {}
        getIframe() { return this.iframe }
        destroy() {}
      },
      PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
    } as never

    const catalog = catalogWithRealVideoId()
    const service = new YouTubeIframeExternalMediaService(catalog)
    const target = document.createElement('div')
    const playlist = catalog.collectionPlaylists[0]
    const handle = await service.prepare({
      requestId: 'playback-direct' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: playlist.videos![0].id,
    }, target)

    expect(installs).toEqual([{ videoId: REAL_VIDEO_ID }])
    expect(handle.startsAutomatically).toBe(true)
    expect(target.innerHTML).not.toContain(EMBED_ORIGIN)
  })
})
