import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlaybackRequestId } from '../domain/contracts'
import { canonicalCatalogFixture } from '../test-support/fixtures/catalogs'
import { YouTubeIframeExternalMediaService } from './youtubeIframeExternalMediaService'

interface CapturedOptions {
  videoId?: string
  playerVars: Record<string, string | number>
  events: {
    onReady(): void
    onStateChange(event: { data: number }): void
    onError(): void
  }
}

const installs: Array<{ target: HTMLElement; options: CapturedOptions }> = []

class FakeYouTubePlayer {
  readonly iframe = document.createElement('iframe')
  readonly playVideo = vi.fn()
  readonly seekTo = vi.fn()
  readonly destroy = vi.fn()
  currentTime = 19

  constructor(target: HTMLElement, readonly options: CapturedOptions) {
    installs.push({ target, options })
    queueMicrotask(() => options.events.onReady())
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  getIframe(): HTMLIFrameElement {
    return this.iframe
  }
}

function installApi(): void {
  installs.length = 0
  window.YT = {
    Player: FakeYouTubePlayer as never,
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
  }
}

/** Reproduces YouTube reporting a state in its first message, before `onReady`. */
class EarlyStateYouTubePlayer extends FakeYouTubePlayer {
  constructor(target: HTMLElement, options: CapturedOptions) {
    super(target, options)
    options.events.onStateChange({ data: 1 })
  }
}

function installEarlyStateApi(): void {
  installs.length = 0
  window.YT = {
    Player: EarlyStateYouTubePlayer as never,
    PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2 },
  }
}

describe('YouTubeIframeExternalMediaService', () => {
  it('resolves a stable video ID and creates an autoplaying controllable player', async () => {
    installApi()
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const target = document.createElement('div')
    const playlist = canonicalCatalogFixture.collectionPlaylists[0]
    const video = playlist.videos![0]
    const handle = await service.prepare({
      requestId: 'playback-recorded' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    }, target)

    expect(installs[0].options.videoId).toBe(video.sourceVideoId)
    expect(installs[0].options.playerVars.autoplay).toBe(1)
    expect(installs[0].options.playerVars).not.toHaveProperty('mute')
    expect(installs[0].options.playerVars).not.toHaveProperty('muted')
    expect(handle.startsAutomatically).toBe(true)
    handle.play()
    expect((handle as unknown as { player: FakeYouTubePlayer }).player.playVideo).toHaveBeenCalledOnce()

    const listener = vi.fn()
    handle.subscribeState(listener)
    installs[0].options.events.onStateChange({ data: 1 })
    expect(listener).toHaveBeenCalledWith('playing')
  })

  it('keeps the Android embed autoplaying, unmuted, and inline', async () => {
    installApi()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    )
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const playlist = canonicalCatalogFixture.collectionPlaylists[0]
    const video = playlist.videos![0]
    const handle = await service.prepare({
      requestId: 'playback-android' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    }, document.createElement('div'))

    expect(installs[0].options.playerVars).toMatchObject({
      autoplay: 1,
      playsinline: 1,
      rel: 0,
    })
    expect(installs[0].options.playerVars).not.toHaveProperty('mute')
    expect(installs[0].options.playerVars).not.toHaveProperty('muted')
    expect(handle.startsAutomatically).toBe(true)
    vi.restoreAllMocks()
  })

  /**
   * WebKit only starts audible media from a gesture on the media itself, so an
   * autoplaying embed can never start on iOS and just leaves the player
   * looking stuck. The embed is created paused instead, and stays unmuted:
   * muting these recordings would be worse than asking for one tap.
   */
  it('creates a paused, unmuted embed on iOS and reports that it will not self-start', async () => {
    installApi()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    )
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const playlist = canonicalCatalogFixture.collectionPlaylists[0]
    const video = playlist.videos![0]
    const handle = await service.prepare({
      requestId: 'playback-ios' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    }, document.createElement('div'))

    expect(installs[0].options.videoId).toBe(video.sourceVideoId)
    expect(installs[0].options.playerVars).toMatchObject({
      autoplay: 0,
      playsinline: 1,
      rel: 0,
    })
    expect(installs[0].options.playerVars).not.toHaveProperty('mute')
    expect(installs[0].options.playerVars).not.toHaveProperty('muted')
    expect(handle.startsAutomatically).toBe(false)
    vi.restoreAllMocks()
  })

  it('replays a state observed before the subscriber attaches', async () => {
    installEarlyStateApi()
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const playlist = canonicalCatalogFixture.collectionPlaylists[0]
    const video = playlist.videos![0]
    const handle = await service.prepare({
      requestId: 'playback-early-state' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    }, document.createElement('div'))

    const listener = vi.fn()
    handle.subscribeState(listener)

    expect(listener).toHaveBeenCalledWith('playing')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('uses the canonical playlist identifier for non-autoplay fallback', async () => {
    installApi()
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const playlist = canonicalCatalogFixture.standalonePlaylists[0]
    await service.prepare({
      requestId: 'playback-embed' as PlaybackRequestId,
      playlistId: playlist.id,
    }, document.createElement('div'))

    expect(installs[0].options.videoId).toBeUndefined()
    expect(installs[0].options.playerVars).toMatchObject({
      autoplay: 0,
      listType: 'playlist',
      list: playlist.youtubePlaylistId,
    })
  })
})

/**
 * The Capacitor iOS web view serves the bundle from `capacitor://localhost`.
 * YouTube cannot resolve that origin, so it reduces player functionality to the
 * point where the embed paints and its play button does nothing at all. These
 * cases pin the correction: declare the published origin on the embed URL, and
 * do not ask for a JS API that could never answer across a declared origin.
 */
describe('YouTubeIframeExternalMediaService on an origin YouTube cannot resolve', () => {
  const playlist = canonicalCatalogFixture.collectionPlaylists[0]
  const video = playlist.videos![0]
  const publishedOrigin = 'https://purushottambhaiya.netlify.app'

  function useOrigin(origin: string): void {
    vi.spyOn(window, 'location', 'get').mockReturnValue(
      { ...window.location, origin } as unknown as Location,
    )
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('declares the published origin and referrer, unmuted, with no JS API', async () => {
    useOrigin('capacitor://localhost')
    // No YouTube API is installed: taking the API path at all would throw here.
    delete window.YT
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const target = document.createElement('div')

    const handle = await service.prepare({
      requestId: 'playback-capacitor' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    }, target)

    const iframe = target.querySelector('iframe')
    expect(iframe).not.toBeNull()
    const url = new URL(iframe!.src)
    expect(url.origin + url.pathname).toBe(
      `https://www.youtube.com/embed/${encodeURIComponent(video.sourceVideoId)}`,
    )
    expect(url.searchParams.get('origin')).toBe(publishedOrigin)
    expect(url.searchParams.get('widget_referrer')).toBe(publishedOrigin)
    expect(url.searchParams.get('playsinline')).toBe('1')
    expect(url.searchParams.get('autoplay')).toBe('0')
    expect(url.searchParams.get('rel')).toBe('0')
    expect(url.searchParams.has('enablejsapi')).toBe(false)
    expect(url.searchParams.has('mute')).toBe(false)
    expect(url.searchParams.has('muted')).toBe(false)
    expect(iframe!.allowFullscreen).toBe(true)
    expect(handle.startsAutomatically).toBe(false)
  })

  /**
   * Nothing on this path can report playback, so the handle must not imply it
   * can. A caller that saw a subscription accepted would wait for a state event
   * that YouTube has no channel to deliver.
   */
  it('reports no playback state and no position, and cannot start playback', async () => {
    useOrigin('capacitor://localhost')
    delete window.YT
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const target = document.createElement('div')
    const handle = await service.prepare({
      requestId: 'playback-capacitor-state' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    }, target)

    const listener = vi.fn()
    const unsubscribe = handle.subscribeState(listener)
    handle.play()
    handle.seekTo(42)

    expect(listener).not.toHaveBeenCalled()
    expect(handle.getCurrentTime()).toBe(0)
    unsubscribe()

    handle.dispose()
    expect(target.querySelector('iframe')).toBeNull()
  })

  it('declares the same identity on the playlist embed', async () => {
    useOrigin('capacitor://localhost')
    delete window.YT
    const standalone = canonicalCatalogFixture.standalonePlaylists[0]
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const target = document.createElement('div')

    await service.prepare({
      requestId: 'playback-capacitor-playlist' as PlaybackRequestId,
      playlistId: standalone.id,
    }, target)

    const url = new URL(target.querySelector('iframe')!.src)
    expect(url.origin + url.pathname).toBe('https://www.youtube.com/embed/videoseries')
    expect(url.searchParams.get('list')).toBe(standalone.youtubePlaylistId)
    expect(url.searchParams.get('origin')).toBe(publishedOrigin)
    expect(url.searchParams.has('enablejsapi')).toBe(false)
  })

  /**
   * The guard is the origin scheme, not the platform. An https page keeps the
   * controllable JS API player it has today, which is what mobile Safari, the
   * Android Trusted Web Activity, and the desktop site all rely on.
   */
  it('leaves an https page on the JS API player', async () => {
    installApi()
    useOrigin('https://purushottambhaiya.netlify.app')
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const target = document.createElement('div')

    const handle = await service.prepare({
      requestId: 'playback-https' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    }, target)

    expect(installs).toHaveLength(1)
    expect(installs[0].options.videoId).toBe(video.sourceVideoId)
    expect(target.querySelector('iframe')).toBeNull()
    expect(handle.startsAutomatically).toBe(true)

    const listener = vi.fn()
    handle.subscribeState(listener)
    installs[0].options.events.onStateChange({ data: 1 })
    expect(listener).toHaveBeenCalledWith('playing')
  })

  it('keeps the Android Trusted Web Activity on the autoplaying JS API player', async () => {
    installApi()
    useOrigin('https://purushottambhaiya.netlify.app')
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
    )
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const target = document.createElement('div')

    const handle = await service.prepare({
      requestId: 'playback-twa' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    }, target)

    expect(installs[0].options.playerVars).toMatchObject({ autoplay: 1, playsinline: 1, rel: 0 })
    expect(installs[0].options.playerVars).not.toHaveProperty('mute')
    expect(handle.startsAutomatically).toBe(true)
    expect(target.querySelector('iframe')).toBeNull()
  })
})


describe('YouTubeIframeExternalMediaService failures', () => {
  it('reports a player error that occurs after the handle is ready', async () => {
    installApi()
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const playlist = canonicalCatalogFixture.collectionPlaylists[0]
    const video = playlist.videos![0]
    const handle = await service.prepare({
      requestId: 'playback-post-ready-error' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    }, document.createElement('div'))
    const listener = vi.fn()
    handle.subscribeState(listener)

    installs[0].options.events.onError()

    expect(listener).toHaveBeenCalledWith('failed')
  })

  it('hands Android an intent URI that falls back to the canonical watch URL', async () => {
    installApi()
    const assign = vi.fn()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36',
    )
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      assign,
    } as unknown as Location)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const playlist = canonicalCatalogFixture.collectionPlaylists[0]
    const video = playlist.videos![0]

    await service.openExternally({
      requestId: 'playback-external-android' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    })

    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(video.sourceVideoId)}`
    expect(open).not.toHaveBeenCalled()
    expect(assign).toHaveBeenCalledWith(
      `intent://www.youtube.com/watch?v=${encodeURIComponent(video.sourceVideoId)}`
      + '#Intent;scheme=https;package=com.google.android.youtube'
      + `;S.browser_fallback_url=${encodeURIComponent(watchUrl)};end`,
    )
    vi.restoreAllMocks()
  })

  it('opens only a canonical video or playlist target externally', async () => {
    installApi()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const service = new YouTubeIframeExternalMediaService(canonicalCatalogFixture)
    const playlist = canonicalCatalogFixture.collectionPlaylists[0]
    const video = playlist.videos![0]

    await service.openExternally({
      requestId: 'playback-external' as PlaybackRequestId,
      playlistId: playlist.id,
      videoId: video.id,
    })

    expect(open).toHaveBeenCalledWith(
      `https://www.youtube.com/watch?v=${encodeURIComponent(video.sourceVideoId)}`,
      '_blank',
      'noopener,noreferrer',
    )
    open.mockRestore()
  })
})
