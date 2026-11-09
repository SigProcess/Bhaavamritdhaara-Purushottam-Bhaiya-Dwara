import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  FakeAppMetadataService,
  FakeDocumentService,
  FakeExternalMediaService,
  FakeNetworkService,
} from './test-support/fakes/platformServices'

vi.mock('@capacitor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@capacitor/core')>()
  return {
    ...actual,
    Capacitor: { ...actual.Capacitor, isNativePlatform: () => false, getPlatform: () => 'web' },
  }
})
vi.mock('./components/Nav', () => ({ default: () => <nav aria-label="Primary" /> }))
vi.mock('./components/BhajansPage', () => ({ default: () => null }))
vi.mock('./components/PlaylistSections', () => ({
  default: ({
    activeRoute,
    onOpenRoute,
    onBack,
  }: {
    activeRoute?: { kind: string }
    onOpenRoute?: (route: unknown, focusTargetId: string) => void
    onBack?: () => void
  }) => activeRoute?.kind === 'playlist' ? (
    <section aria-labelledby="playlist-screen-title">
      <button type="button" onClick={onBack}>Back to the collection</button>
      <h1 id="playlist-screen-title" tabIndex={-1}>Test playlist</h1>
    </section>
  ) : activeRoute?.kind === 'collection' ? (
    <section aria-labelledby="collection-screen-title">
      <button type="button" onClick={onBack}>Back to collections</button>
      <h1 id="collection-screen-title" tabIndex={-1}>Test collection</h1>
      <button
        id="playlist-test"
        type="button"
        onClick={() => onOpenRoute?.(
          { kind: 'playlist', playlistId: 'playlist:test', collectionId: 'collection:test' },
          'playlist-test',
        )}
      >
        Open test playlist
      </button>
    </section>
  ) : (
    <button
      id="collection-test"
      type="button"
      onClick={() => onOpenRoute?.({ kind: 'collection', collectionId: 'collection:test' }, 'collection-test')}
    >
      Open test collection
    </button>
  ),
}))
vi.mock('./components/BooksSection', () => ({ default: () => null }))

import App from './App'

vi.stubGlobal('React', React)

describe('App privacy navigation', () => {
  it('opens the maintained notice and restores Home and trigger focus', async () => {
    const user = userEvent.setup()
    render(<App />)

    const openButton = screen.getByRole('button', { name: 'Open Privacy Notice' })
    await user.click(openButton)

    const title = screen.getByRole('heading', { level: 1, name: 'Privacy Notice' })
    expect(title).toHaveFocus()
    expect(screen.getAllByText('Service: YouTube / Google').length).toBeGreaterThan(0)
    expect(screen.getByText('Service: Netlify')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close Privacy Notice and return to Home' }))

    expect(screen.getByRole('heading', { name: 'Bhaavamritdhaara — Purushottam Bhaiya Dwara' })).toBeInTheDocument()
    await waitFor(() => expect(openButton).toHaveFocus())
  })
})

describe('App shell Home route', () => {
  it('cold-launches Home with the exact bilingual identity and categories', () => {
    render(<App />)

    expect(document.querySelector('.app')).toHaveAttribute('data-route', 'home')
    expect(screen.getByRole('heading', {
      level: 1,
      name: 'Bhaavamritdhaara — Purushottam Bhaiya Dwara',
    })).toBeInTheDocument()
    expect(screen.getByText('भावामृत धारा')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Shri Purushottam Bhaiya' }))
      .toHaveAttribute('src', '/bhaiya-banner.jpg')

    const categoryNavigation = screen.getByRole('navigation', {
      name: 'Devotional categories',
    })
    expect(categoryNavigation).toHaveTextContent(
      'BhajansPravachansLekhVani VishleshanPublished Books',
    )
    expect(screen.queryByText(/sign in|register|sponsored|advertisement/i))
      .not.toBeInTheDocument()
  })

  it('keeps local Home content visible and identifies online content when offline', async () => {
    const network = new FakeNetworkService('offline')
    render(
      <App services={{
        documents: new FakeDocumentService(),
        network,
        lifecycle: {
          currentState: async () => 'active' as const,
          subscribe: () => () => undefined,
        },
        metadata: new FakeAppMetadataService(),
        externalMedia: new FakeExternalMediaService(),
      }} />,
    )

    expect(screen.getByRole('heading', {
      name: 'Bhaavamritdhaara — Purushottam Bhaiya Dwara',
    })).toBeInTheDocument()
    expect(screen.getByText('भावामृत धारा')).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Local devotional content remains available; online videos and updates are unavailable.',
    )
  })
})

describe('App shell catalog routing', () => {
  it('pushes collection navigation, focuses its heading, and restores its trigger', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    render(<App />)

    const trigger = screen.getByRole('button', { name: 'Open test collection' })
    await user.click(trigger)

    expect(document.querySelector('.app')).toHaveAttribute('data-route', 'collection')
    expect(screen.queryByRole('heading', {
      name: 'Bhaavamritdhaara — Purushottam Bhaiya Dwara',
    })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Test collection' })).toHaveFocus()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })

    await user.click(screen.getByRole('button', { name: 'Back to collections' }))
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Open test collection' }),
    ).toHaveFocus())

    // Back restores the recorded offset positionally and must not reset to top.
    expect(scrollTo.mock.calls.filter(([first]) => typeof first === 'object')).toHaveLength(1)
    expect(scrollTo).toHaveBeenCalledWith(0, 0)
    scrollTo.mockRestore()
  })

  it('resets the scroll again when a playlist opens from a collection', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Open test collection' }))
    await user.click(screen.getByRole('button', { name: 'Open test playlist' }))

    expect(document.querySelector('.app')).toHaveAttribute('data-route', 'playlist')
    expect(screen.getByRole('heading', { level: 1, name: 'Test playlist' })).toHaveFocus()
    expect(scrollTo.mock.calls.filter(([first]) => typeof first === 'object')).toEqual([
      [{ top: 0, left: 0, behavior: 'instant' }],
      [{ top: 0, left: 0, behavior: 'instant' }],
    ])

    await user.click(screen.getByRole('button', { name: 'Back to the collection' }))
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Open test playlist' }),
    ).toHaveFocus())

    expect(scrollTo.mock.calls.filter(([first]) => typeof first === 'object')).toHaveLength(2)
    scrollTo.mockRestore()
  })
})
