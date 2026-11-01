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

  it('plays only after explicit selection and accepts playing before five seconds', async () => {
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

    await vi.advanceTimersByTimeAsync(4_999)
    media.handles[0].emit('playing')
    await vi.advanceTimersByTimeAsync(1)

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-atomic', 'true')
    expect(status).toHaveTextContent('Playing English Discourse.')
  })

  it('enforces the five-second playing-state deadline', async () => {
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
    await vi.advanceTimersByTimeAsync(5_000)

    expect(screen.getByRole('status')).toHaveTextContent(
      'हिन्दी प्रवचन did not begin playing within 5 seconds.',
    )
    media.handles[0].emit('playing')
    expect(screen.getByRole('status')).toHaveTextContent(
      'हिन्दी प्रवचन did not begin playing within 5 seconds.',
    )
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
  it('disposes a timed-out player and retries only the same playback request', async () => {
    vi.useFakeTimers()
    const media = new FakeExternalMediaService()
    const network = new FakeNetworkService('online')
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
    await vi.advanceTimersByTimeAsync(5_000)

    const requestId = media.prepareCalls[0].requestId
    expect(media.handles[0].disposeCalls).toHaveLength(1)
    expect(screen.getByRole('status')).toHaveTextContent(
      'हिन्दी प्रवचन did not begin playing within 5 seconds.',
    )
    expect(screen.queryByRole('button', { name: /Open .* in YouTube/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry हिन्दी प्रवचन' }))
    await vi.advanceTimersByTimeAsync(0)

    expect(media.retryCalls).toEqual([requestId])
    expect(media.prepareCalls).toHaveLength(1)
    expect(media.handles[1].playCalls).toHaveLength(1)
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
