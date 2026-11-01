import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCatalogFixture } from '../test-support/fixtures/catalogs'
import BhajanFinder from './BhajansPage'
import BooksSection from './BooksSection'

const uuid = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(uuid)
})

describe('native document actions', () => {
  it('opens and exports a canonical bhajan while retaining finder state on cancellation', async () => {
    const session = {
      sessionId: 'session-1',
      documentId: 'bhajan:one',
      kind: 'bhajan',
    }
    const coordinator = {
      open: vi.fn(async () => session),
      export: vi.fn(async () => 'cancelled'),
    }
    render(<BhajanFinder documentCoordinator={coordinator} />)
    const search = screen.getByRole('searchbox', { name: 'भजन खोजें / Search bhajans' })
    fireEvent.change(search, { target: { value: 'प्रभु' } })
    const exportButton = screen.getAllByRole('button', { name: /^Export / })[0]

    fireEvent.click(exportButton)
    await waitFor(() => expect(coordinator.export).toHaveBeenCalledOnce())

    expect(coordinator.open).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: expect.stringMatching(/^bhajan:/),
        kind: 'bhajan',
        requestId: uuid,
      }),
    )
    expect(coordinator.export).toHaveBeenCalledWith({
      sessionId: session.sessionId,
      canonicalName: expect.any(String),
      requestId: uuid,
    })
    expect(search).toHaveValue('प्रभु')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('retries a failed book open with the same request and canonical book identity', async () => {
    const coordinator = {
      open: vi
        .fn()
        .mockRejectedValueOnce(new Error('native detail'))
        .mockResolvedValueOnce({
          sessionId: 'session-2',
          documentId: 'book:rom-rom-ga-raha',
          kind: 'book',
        }),
    }
    render(
      <BooksSection
        catalog={createCatalogFixture()}
        documentCoordinator={coordinator}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /Read Book/ })[0])

    const retry = await screen.findByRole('button', { name: 'Retry' })
    expect(screen.getByRole('alert')).toHaveTextContent('Rom Rom Mein Ram')
    fireEvent.click(retry)
    await waitFor(() => expect(coordinator.open).toHaveBeenCalledTimes(2))

    expect(coordinator.open.mock.calls[0][0]).toMatchObject({
      documentId: 'book-rom-rom',
      requestId: uuid,
      kind: 'book',
    })
    expect(coordinator.open.mock.calls[1][0]).toEqual(
      coordinator.open.mock.calls[0][0],
    )
    expect(
      screen.getByRole('button', { name: 'Read Book: Rom Rom Mein Ram' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })
})
