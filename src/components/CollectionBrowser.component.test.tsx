import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { CollectionBrowserEnvironment } from './CollectionBrowser'
import CollectionBrowser from './CollectionBrowser'
import type { ElementId, RequestId } from '../domain/contracts'
import {
  canonicalCatalogFixture,
  createCatalogFixture,
} from '../test-support/fixtures/catalogs'
import { failedRequestFixtures } from '../test-support/fixtures/requests'

const environment = (y = 0): CollectionBrowserEnvironment => ({
  getScroll: () => ({ x: 0, y }),
  restoreScroll: vi.fn(),
  restoreFocus: vi.fn(),
})

describe('CollectionBrowser', () => {
  it('renders exact collection metadata and standalone playlists in canonical order', () => {
    render(<CollectionBrowser catalog={canonicalCatalogFixture} environment={environment()} />)

    expect(screen.getByRole('heading', { name: 'Collections' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Pravachans, 1 playlist' })).toBeInTheDocument()
    expect(screen.getByAltText('Pravachans collection')).toHaveAttribute('src', '/images/collection.jpg')

    const standaloneHeading = screen.getByRole('heading', { level: 3, name: 'More Playlists' })
    const standalone = standaloneHeading.parentElement!
    const buttons = within(standalone).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Embed-only Playlist'),
      expect.stringContaining('Unavailable Playlist'),
    ])
  })

  it('opens a collection and renders its exact playlists in membership order', async () => {
    const user = userEvent.setup()
    const catalog = createCatalogFixture({
      collections: [{
        ...canonicalCatalogFixture.collections[0],
        playlistIds: [
          canonicalCatalogFixture.collectionPlaylists[0].id,
          'playlist-second' as typeof canonicalCatalogFixture.collectionPlaylists[0]['id'],
        ],
      }],
      collectionPlaylists: [
        canonicalCatalogFixture.collectionPlaylists[0],
        {
          ...canonicalCatalogFixture.collectionPlaylists[0],
          id: 'playlist-second' as typeof canonicalCatalogFixture.collectionPlaylists[0]['id'],
          title: 'Second canonical playlist',
        },
      ],
    })
    render(<CollectionBrowser catalog={catalog} environment={environment()} />)

    await user.click(screen.getByRole('button', { name: 'Open Pravachans, 2 playlists' }))

    const collectionHeading = screen.getByRole('heading', { level: 1, name: 'Pravachans' })
    expect(collectionHeading).toHaveAttribute('tabindex', '-1')
    expect(screen.getByText('2 playlists')).toBeInTheDocument()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Back to collections',
      expect.stringContaining('Recorded Devotional Talks'),
      expect.stringContaining('Second canonical playlist'),
    ])
  })

  it('names a valid empty collection', async () => {
    const user = userEvent.setup()
    const catalog = createCatalogFixture({
      collections: [{ ...canonicalCatalogFixture.collections[0], playlistIds: [] }],
      collectionPlaylists: [],
    })
    render(<CollectionBrowser catalog={catalog} environment={environment()} />)

    await user.click(screen.getByRole('button', { name: 'Open Pravachans, 0 playlists' }))
    expect(screen.getByRole('status')).toHaveTextContent('No playlists are available in Pravachans.')
  })

  it('names a failed collection and retries only its request', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn<(requestId: RequestId) => void>()
    const request = failedRequestFixtures.collection
    render(
      <CollectionBrowser
        catalog={canonicalCatalogFixture}
        environment={environment()}
        requests={{ [request.requestId]: request }}
        onRetry={onRetry}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Open Pravachans, 1 playlist' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load Pravachans.')
    await user.click(screen.getByRole('button', { name: 'Retry Pravachans' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(onRetry).toHaveBeenCalledWith(request.requestId)
  })

  it('keeps the origin visible and names an unavailable standalone playlist', async () => {
    const user = userEvent.setup()
    render(<CollectionBrowser catalog={canonicalCatalogFixture} environment={environment()} />)

    await user.click(screen.getByRole('button', { name: 'Play Unavailable Playlist' }))

    expect(screen.getByRole('heading', { name: 'Collections' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Unavailable Playlist is unavailable.')
  })

  it('opens available standalone and collection playlists through the playlist route', async () => {
    const user = userEvent.setup()
    const renderPlaylist = vi.fn((playlist, close: () => void) => (
      <><h2>{playlist.title}</h2><button onClick={close}>Close player</button></>
    ))
    const { rerender } = render(
      <CollectionBrowser
        catalog={canonicalCatalogFixture}
        environment={environment()}
        renderPlaylist={renderPlaylist}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Play Embed-only Playlist' }))
    expect(screen.getByRole('heading', { name: 'Embed-only Playlist' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close player' }))

    rerender(
      <CollectionBrowser
        catalog={canonicalCatalogFixture}
        environment={environment()}
        renderPlaylist={renderPlaylist}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Open Pravachans, 1 playlist' }))
    await user.click(screen.getByRole('button', { name: 'Play Recorded Devotional Talks' }))
    expect(screen.getByRole('heading', { name: 'Recorded Devotional Talks' })).toBeInTheDocument()
    expect(renderPlaylist).toHaveBeenLastCalledWith(
      canonicalCatalogFixture.collectionPlaylists[0],
      expect.any(Function),
    )
  })

  it('restores each predecessor scroll position and focus target after closing', async () => {
    const user = userEvent.setup()
    const env = environment(275)
    render(<CollectionBrowser catalog={canonicalCatalogFixture} environment={env} />)

    await user.click(screen.getByRole('button', { name: 'Open Pravachans, 1 playlist' }))
    await user.click(screen.getByRole('button', { name: 'Play Recorded Devotional Talks' }))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    expect(env.restoreScroll).toHaveBeenLastCalledWith({ x: 0, y: 275 })
    expect(env.restoreFocus).toHaveBeenLastCalledWith(
      'playlist-playlist-recorded' as ElementId,
    )

    await user.click(screen.getByRole('button', { name: 'Back to collections' }))
    expect(env.restoreScroll).toHaveBeenLastCalledWith({ x: 0, y: 275 })
    expect(env.restoreFocus).toHaveBeenLastCalledWith(
      'collection-collection-pravachans' as ElementId,
    )
  })
})
