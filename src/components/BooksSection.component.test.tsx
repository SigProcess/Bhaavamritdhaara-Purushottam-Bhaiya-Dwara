import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetId, BookId } from '../domain/contracts'
import {
  canonicalCatalogFixture,
  createCatalogFixture,
} from '../test-support/fixtures/catalogs'
import BooksSection from './BooksSection'

const uuid = '00000000-0000-4000-8000-000000000063'
const bookId = (value: string) => value as BookId
const assetId = (value: string) => value as AssetId

beforeEach(() => {
  vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(uuid)
})

describe('Books Browser', () => {
  it('renders exact canonical metadata in catalog order', () => {
    const secondCoverId = assetId('asset-book-cover-second')
    const secondDocumentId = assetId('asset-book-pdf-second')
    const catalog = createCatalogFixture({
      books: [
        {
          id: bookId('book-z-first'),
          title: 'ज़ प्रथम पुस्तक',
          subtitle: 'Exact: subtitle — एक',
          author: 'लेखक, प्रथम',
          pageCount: 321,
          cover: canonicalCatalogFixture.books[0].cover,
          document: canonicalCatalogFixture.books[0].document,
        },
        {
          id: bookId('book-a-second'),
          title: 'A Second Book',
          subtitle: 'Second subtitle',
          author: 'Second Author',
          pageCount: 54,
          cover: { assetId: secondCoverId },
          document: { assetId: secondDocumentId },
        },
      ],
      assets: [
        ...canonicalCatalogFixture.assets,
        {
          id: secondCoverId,
          path: 'images/second-cover.jpeg',
          sha256: '7'.repeat(64),
          byteLength: 128,
          mediaType: 'image/jpeg',
          availability: 'packaged',
        },
        {
          id: secondDocumentId,
          path: 'documents/second.pdf',
          sha256: '8'.repeat(64),
          byteLength: 256,
          mediaType: 'application/pdf',
          availability: 'packaged',
        },
      ],
    })
    const coordinator = { open: vi.fn() }

    render(<BooksSection catalog={catalog} documentCoordinator={coordinator} />)

    const cards = screen.getAllByRole('button', { name: /^Read Book:/ })
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveAccessibleName('Read Book: ज़ प्रथम पुस्तक')
    expect(cards[1]).toHaveAccessibleName('Read Book: A Second Book')
    expect(within(cards[0]).getByText('Exact: subtitle — एक')).toBeInTheDocument()
    expect(within(cards[0]).getByText('लेखक, प्रथम')).toBeInTheDocument()
    expect(within(cards[0]).getByText('321 pages')).toBeInTheDocument()
    expect(within(cards[0]).getByRole('img')).toHaveAttribute(
      'src',
      '/images/book-cover.png',
    )
    expect(within(cards[1]).getByText('Second subtitle')).toBeInTheDocument()
    expect(within(cards[1]).getByText('Second Author')).toBeInTheDocument()
    expect(within(cards[1]).getByText('54 pages')).toBeInTheDocument()
    expect(within(cards[1]).getByRole('img')).toHaveAttribute(
      'src',
      '/images/second-cover.jpeg',
    )
  })

  it('opens the selected canonical book ID without rebuilding or exposing its path', async () => {
    const coordinator = {
      open: vi.fn(async (_options: unknown) => ({
        sessionId: 'session-book',
        documentId: canonicalCatalogFixture.books[0].id,
        kind: 'book',
      })),
    }
    render(
      <BooksSection
        catalog={createCatalogFixture()}
        documentCoordinator={coordinator}
      />,
    )

    const book = screen.getByRole('button', { name: 'Read Book: Rom Rom Mein Ram' })
    fireEvent.click(book)

    await waitFor(() => expect(coordinator.open).toHaveBeenCalledOnce())
    expect(coordinator.open).toHaveBeenCalledWith({
      requestId: uuid,
      documentId: bookId('book-rom-rom'),
      kind: 'book',
      canonicalName: 'Rom Rom Mein Ram',
      focusTargetId: 'book-open-book-rom-rom',
    })
    expect(coordinator.open.mock.calls[0][0]).not.toHaveProperty('path')
    expect(coordinator.open.mock.calls[0][0]).not.toHaveProperty('url')
    expect(book).toHaveAttribute('aria-pressed', 'true')
  })

  it('routes browser opens through the canonical ID-backed document service', async () => {
    const openedWindow = { opener: window } as unknown as WindowProxy
    const open = vi.spyOn(window, 'open').mockReturnValue(openedWindow)
    render(<BooksSection catalog={createCatalogFixture()} />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Read Book: Rom Rom Mein Ram' }),
    )

    await waitFor(() => expect(open).toHaveBeenCalledOnce())
    expect(open.mock.calls[0][0]).toMatch(/\/documents\/book\.pdf$/)
    expect(open.mock.calls[0][1]).toBe('_blank')
    expect(openedWindow.opener).toBeNull()
    expect(screen.queryByRole('link', { name: /Rom Rom Mein Ram/ })).not.toBeInTheDocument()
  })
})
