import { describe, expect, it, vi } from 'vitest'
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

describe('YouTubeIframeExternalMediaService', () => {
  it('resolves a stable video ID and creates a non-autoplay controllable player', async () => {
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
    expect(installs[0].options.playerVars.autoplay).toBe(0)
    handle.play()
    expect((handle as unknown as { player: FakeYouTubePlayer }).player.playVideo).toHaveBeenCalledOnce()

    const listener = vi.fn()
    handle.subscribeState(listener)
    installs[0].options.events.onStateChange({ data: 1 })
    expect(listener).toHaveBeenCalledWith('playing')
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
