import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalCatalogFixture } from '../test-support/fixtures/catalogs'
import {
  FakeExternalMediaService,
  FakeNetworkService,
} from '../test-support/fakes/platformServices'
import VideoPlayer from './VideoPlayer'

const recordedPlaylist = canonicalCatalogFixture.collectionPlaylists[0]
const embedPlaylist = canonicalCatalogFixture.standalonePlaylists[0]

afterEach(() => {
  vi.useRealTimers()
})

describe('VideoPlayer', () => {
  it('renders canonical metadata in order with one selection and no initial autoplay', () => {
    const media = new FakeExternalMediaService()
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
      />,
    )

    const heading = screen.getByRole('heading', { level: 1, name: recordedPlaylist.title })
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('2 videos')).toBeInTheDocument()
    const list = screen.getByRole('listbox', { name: `${recordedPlaylist.title} videos` })
    const options = within(list).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual([
      expect.stringContaining('हिन्दी प्रवचन'),
      expect.stringContaining('English Discourse'),
    ])
    expect(options.filter((option) => option.getAttribute('aria-selected') === 'true')).toEqual([
      options[0],
    ])
    expect(within(options[0]).getByRole('img', { name: 'हिन्दी प्रवचन' })).toHaveAttribute(
      'src',
      'https://example.com/images/video.jpg',
    )
    expect(media.prepareCalls).toHaveLength(0)
    expect(media.handles).toHaveLength(0)
  })

  it('plays only after explicit selection and accepts playing before the deadline', async () => {
    vi.useFakeTimers()
    const media = new FakeExternalMediaService()
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
      />,
    )

    fireEvent.click(screen.getByRole('option', { name: /English Discourse/ }))
    await vi.advanceTimersByTimeAsync(0)

    expect(media.prepareCalls[0]).toMatchObject({
      playlistId: recordedPlaylist.id,
      videoId: recordedPlaylist.videos![1].id,
    })
    expect(media.handles[0].playCalls).toHaveLength(1)
    expect(screen.getByRole('option', { name: /English Discourse/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )

    await vi.advanceTimersByTimeAsync(29_999)
    media.handles[0].emit('playing')
    await vi.advanceTimersByTimeAsync(1)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    expect(status).toHaveTextContent('Playing English Discourse.')
  })

  /**
   * The deadline exists to catch a player that never arrives, not to punish a
   * player that is simply waiting for a tap. A ready player therefore stays on
   * screen, because YouTube's own play button inside the iframe is the only
   * thing WebKit will accept for audible media.
   */
  it('keeps a timed-out but ready player on screen and asks for a tap', async () => {
    vi.useFakeTimers()
    const media = new FakeExternalMediaService()
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play selected video' }))
    await vi.advanceTimersByTimeAsync(30_000)

    expect(screen.getByRole('status')).toHaveTextContent(
      'Tap play in the player to start हिन्दी प्रवचन.',
    )
    expect(media.handles[0].disposeCalls).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^Retry/ })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open हिन्दी प्रवचन in YouTube' }),
    ).toBeInTheDocument()

    // The tap inside the iframe finally starts playback, long after the deadline.
    media.handles[0].emit('playing')
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByRole('status')).toHaveTextContent('Playing हिन्दी प्रवचन.')
  })

  it('presents playlist fallback without starting playback', async () => {
    const media = new FakeExternalMediaService()
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={embedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
      />,
    )

    await waitFor(() => expect(media.prepareCalls).toHaveLength(1))
    expect(media.prepareCalls[0]).toMatchObject({ playlistId: embedPlaylist.id })
    expect(media.prepareCalls[0].videoId).toBeUndefined()
    expect(media.handles[0].playCalls).toHaveLength(0)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('keeps the selected video and media instance through full-screen exit', async () => {
    const user = userEvent.setup()
    const media = new FakeExternalMediaService()
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
      />,
    )

    await user.click(screen.getByRole('option', { name: /English Discourse/ }))
    await waitFor(() => expect(media.handles).toHaveLength(1))
    media.handles[0].seekTo(37)
    await user.click(await screen.findByRole('button', { name: 'Enter full screen' }))
    fireEvent(document, new Event('fullscreenchange'))

    expect(media.handles[0].fullscreenCalls).toHaveLength(1)
    expect(media.prepareCalls).toHaveLength(1)
    expect(screen.getByRole('option', { name: /English Discourse/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(media.handles[0].getCurrentTime()).toBe(37)
  })
})


describe('VideoPlayer failure recovery', () => {
  it('disposes a player that never became ready and retries only that request', async () => {
    vi.useFakeTimers()
    const media = new FakeExternalMediaService()
    const network = new FakeNetworkService('online')
    media.stallNextRequest()
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
        networkService={network}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play selected video' }))
    await vi.advanceTimersByTimeAsync(30_000)

    const requestId = media.prepareCalls[0].requestId
    expect(media.handles).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(
      'हिन्दी प्रवचन did not begin playing in time.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open हिन्दी प्रवचन in YouTube' }))
    expect(media.externalOpenCalls).toEqual([
      expect.objectContaining({
        requestId,
        playlistId: recordedPlaylist.id,
        videoId: recordedPlaylist.videos![0].id,
      }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Retry हिन्दी प्रवचन' }))
    await vi.advanceTimersByTimeAsync(0)

    expect(media.retryCalls).toEqual([requestId])
    expect(media.prepareCalls).toHaveLength(1)
    expect(media.handles[0].playCalls).toHaveLength(1)
  })

  /**
   * iOS: the embed is created paused, so nothing is pending and nothing has
   * failed. The player stays mounted with YouTube's play button, the external
   * fallback stays available, and no deadline tears any of it down.
   */
  it('waits for a tap, without a deadline, when the platform refuses autoplay', async () => {
    vi.useFakeTimers()
    const media = new FakeExternalMediaService(false)
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
        networkService={new FakeNetworkService('online')}
      />,
    )

    fireEvent.click(screen.getByRole('option', { name: /English Discourse/ }))
    await vi.advanceTimersByTimeAsync(0)

    expect(media.handles[0].playCalls).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tap play in the player to start English Discourse.',
    )
    expect(
      screen.getByRole('button', { name: 'Open English Discourse in YouTube' }),
    ).toBeInTheDocument()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(media.handles[0].disposeCalls).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^Retry/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tap play in the player to start English Discourse.',
    )

    media.handles[0].emit('playing')
    await vi.advanceTimersByTimeAsync(0)
    expect(screen.getByRole('status')).toHaveTextContent('Playing English Discourse.')
    expect(
      screen.queryByRole('button', { name: /in YouTube$/ }),
    ).not.toBeInTheDocument()
  })

  /**
   * Option A on iOS: the embed declares an origin, so YouTube has no channel
   * back to this frame and will never report a state. The screen has to be
   * usable on that basis alone — the player mounted, the prompt shown, the
   * external fallback offered, and no countdown to a failure that is not one.
   */
  it('stays usable when the player can never report a state', async () => {
    vi.useFakeTimers()
    const media = new FakeExternalMediaService(false)
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
        networkService={new FakeNetworkService('online')}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play selected video' }))
    await vi.advanceTimersByTimeAsync(0)

    // Immediately, without waiting out any deadline.
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tap play in the player to start हिन्दी प्रवचन.',
    )
    expect(media.handles[0].playCalls).toHaveLength(0)

    // No state ever arrives. Nothing degrades.
    await vi.advanceTimersByTimeAsync(300_000)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tap play in the player to start हिन्दी प्रवचन.',
    )
    expect(media.handles[0].disposeCalls).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^Retry/ })).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Open हिन्दी प्रवचन in YouTube' }),
    ).toBeInTheDocument()
  })

  it('keeps metadata usable offline and enables the same retry after reconnection', async () => {
    const media = new FakeExternalMediaService()
    const network = new FakeNetworkService('offline')
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
        networkService={network}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Play selected video' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'हिन्दी प्रवचन requires a network connection.',
    )
    const retry = screen.getByRole('button', { name: 'Retry हिन्दी प्रवचन' })
    expect(retry).toBeDisabled()
    expect(media.prepareCalls).toHaveLength(0)
    expect(screen.getByRole('listbox', { name: `${recordedPlaylist.title} videos` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled()

    network.setStatus('online')
    await waitFor(() => expect(retry).toBeEnabled())
    fireEvent.click(retry)
    await waitFor(() => expect(media.prepareCalls).toHaveLength(1))

    expect(media.prepareCalls[0]).toMatchObject({
      requestId: expect.any(String),
      playlistId: recordedPlaylist.id,
      videoId: recordedPlaylist.videos![0].id,
    })
    expect(media.retryCalls).toHaveLength(0)
  })

  it('maps service failure to one scoped retry and explicit external fallback', async () => {
    const media = new FakeExternalMediaService()
    const network = new FakeNetworkService('online')
    media.failNextRequest('YOUTUBE_PLAYBACK_FAILED')
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
        networkService={network}
      />,
    )

    fireEvent.click(screen.getByRole('option', { name: /English Discourse/ }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'English Discourse is unavailable in the embedded player.',
    )
    const requestId = media.prepareCalls[0].requestId
    const external = screen.getByRole('button', {
      name: 'Open English Discourse in YouTube',
    })

    fireEvent.click(external)
    expect(media.externalOpenCalls).toEqual([
      expect.objectContaining({
        requestId,
        playlistId: recordedPlaylist.id,
        videoId: recordedPlaylist.videos![1].id,
      }),
    ])

    fireEvent.click(screen.getByRole('button', { name: 'Retry English Discourse' }))
    await waitFor(() => expect(media.retryCalls).toEqual([requestId]))
    expect(media.handles[0].playCalls).toHaveLength(1)
  })
})


describe('VideoPlayer selection brings the player into view', () => {
  interface ScrollCall {
    readonly element: Element
    readonly options: unknown
  }

  function stubScrollIntoView(): ScrollCall[] {
    const calls: ScrollCall[] = []
    Element.prototype.scrollIntoView = vi.fn(function (
      this: Element,
      options?: unknown,
    ) {
      calls.push({ element: this, options })
    }) as unknown as Element['scrollIntoView']
    return calls
  }

  afterEach(() => {
    // jsdom ships no `scrollIntoView`, so the clean state is its absence.
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  it('scrolls the player surface to the top of the viewport on selection', async () => {
    const calls = stubScrollIntoView()
    const media = new FakeExternalMediaService()
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
      />,
    )

    fireEvent.click(screen.getByRole('option', { name: /English Discourse/ }))

    // Two calls by design: one during the tap, and one re-asserted after the
    // commit because WebKit discards a programmatic smooth scroll while touch
    // momentum is settling and the mounting player shifts layout again.
    expect(calls).toHaveLength(2)
    expect(calls[0].element).toHaveClass('video-player-surface')
    expect(calls[1].element).toHaveClass('video-player-surface')
    expect(calls[0].options).toEqual({ block: 'start' })
    expect(calls[1].options).toEqual({ block: 'start' })
    expect(Object.keys(calls[0].options as object)).toEqual(['block'])
    await waitFor(() => expect(media.prepareCalls).toHaveLength(1))
  })

  it('scrolls again when the already-selected video is re-tapped', async () => {
    const calls = stubScrollIntoView()
    const media = new FakeExternalMediaService()
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
      />,
    )

    const selected = screen.getByRole('option', { name: /हिन्दी प्रवचन/ })
    expect(selected).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(selected)

    expect(calls).toHaveLength(1)
    expect(calls[0].element).toHaveClass('video-player-surface')
    await waitFor(() => expect(media.prepareCalls).toHaveLength(1))
  })

  it('scrolls even when the playback request fails', async () => {
    const calls = stubScrollIntoView()
    const media = new FakeExternalMediaService()
    media.failNextRequest('YOUTUBE_PLAYBACK_FAILED')
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
        networkService={new FakeNetworkService('online')}
      />,
    )

    fireEvent.click(screen.getByRole('option', { name: /English Discourse/ }))

    expect(calls).toHaveLength(2)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'English Discourse is unavailable in the embedded player.',
    )
  })

  it('selects and starts playback where scrollIntoView is unavailable', async () => {
    delete (Element.prototype as Partial<Element>).scrollIntoView
    const media = new FakeExternalMediaService()
    render(
      <VideoPlayer
        catalog={canonicalCatalogFixture}
        playlist={recordedPlaylist}
        onClose={vi.fn()}
        mediaService={media}
      />,
    )

    expect(Element.prototype.scrollIntoView).toBeUndefined()
    fireEvent.click(screen.getByRole('option', { name: /English Discourse/ }))

    expect(screen.getByRole('option', { name: /English Discourse/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await waitFor(() => expect(media.prepareCalls).toHaveLength(1))
    expect(media.prepareCalls[0]).toMatchObject({
      playlistId: recordedPlaylist.id,
      videoId: recordedPlaylist.videos![1].id,
    })
  })
})
