import { describe, expect, it } from 'vitest'

import { CatalogGenerationError, generateCatalog } from '../../../scripts/lib/catalog-generator.mjs'
import {
  CatalogValidationError,
  compareCatalogToSnapshot,
  createValidationSnapshot,
  validateCatalogSnapshot,
  validateReleaseCatalog,
} from '../../../scripts/lib/catalog-validator.mjs'

const image = Buffer.from('image-bytes')
const pdf = Buffer.from('%PDF-1.7\nfixture')
const asset = (kind: 'thumbnail' | 'cover' | 'document', id: string, path: string) => ({ id, kind, path })

const sources = () => ({
  collections: [{
    id: 'collection:one',
    title: 'Collection',
    thumbnail: asset('thumbnail', 'asset:collection', '/collection.jpg'),
    playlistIds: ['playlist:one'],
  }],
  collectionPlaylists: [{
    id: 'playlist:one',
    title: 'Playlist',
    thumbnail: asset('thumbnail', 'asset:playlist', '/playlist.jpg'),
    youtubePlaylistId: 'PL_ONE',
    collectionId: 'collection:one',
    videos: [
      { id: 'video:one', sourceVideoId: 'youtube-one', title: 'First', thumbnail: asset('thumbnail', 'asset:video-one', '/video-one.jpg') },
      { id: 'video:two', sourceVideoId: 'youtube-two', title: 'Second', thumbnail: asset('thumbnail', 'asset:video-two', '/video-two.jpg') },
    ],
  }],
  standalonePlaylists: [],
  bhajans: [{
    id: 'bhajan:one',
    hindiTitle: 'भजन',
    englishTitle: 'Bhajan',
    document: asset('document', 'asset:bhajan', '/bhajan.pdf'),
  }],
  books: [{
    id: 'book:one',
    title: 'Book',
    pageCount: 10,
    cover: asset('cover', 'asset:book-cover', '/book.png'),
    document: asset('document', 'asset:book-document', '/book.pdf'),
  }],
})

const assetBytes = new Map([
  ['/collection.jpg', image],
  ['/playlist.jpg', image],
  ['/video-one.jpg', image],
  ['/video-two.jpg', image],
  ['/bhajan.pdf', pdf],
  ['/book.png', image],
  ['/book.pdf', pdf],
])

const readAsset = async ({ path }: { path: string }) => {
  const value = assetBytes.get(path)
  if (!value) throw new Error('missing fixture asset')
  return value
}

const buildSnapshot = async () => {
  const generated = await generateCatalog({
    sources: sources(),
    sourceFiles: [{ sourceId: 'catalog-source', bytes: Buffer.from('source') }],
    readAsset,
    metadata: {
      generatedAt: '2025-01-01T00:00:00.000Z',
      sourceRevision: 'revision-one',
    },
  })
  return createValidationSnapshot({
    catalog: generated.catalog,
    sourceFiles: generated.sourceFiles,
  })
}

const clone = <T>(value: T): T => structuredClone(value)

describe('release catalog generation fixtures', () => {
  it('generates the same complete catalog from the same immutable inputs', async () => {
    const input = {
      sources: sources(),
      sourceFiles: [{ sourceId: 'catalog-source', bytes: Buffer.from('source') }],
      readAsset,
      metadata: {
        generatedAt: '2025-01-01T00:00:00.000Z',
        sourceRevision: 'revision-one',
      },
    }

    const first = await generateCatalog(input)
    const second = await generateCatalog({ ...input, sources: clone(input.sources) })

    expect(second).toEqual(first)
    expect(first.catalog).toMatchObject({
      collections: [expect.objectContaining({ id: 'collection:one' })],
      collectionPlaylists: [expect.objectContaining({ id: 'playlist:one' })],
      bhajans: [expect.objectContaining({ id: 'bhajan:one' })],
      books: [expect.objectContaining({ id: 'book:one' })],
      assets: expect.arrayContaining([expect.objectContaining({ id: 'asset:book-document' })]),
    })
    expect(first.catalog.contentHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('blocks duplicate IDs with a canonical scope', async () => {
    const duplicateSources = sources()
    duplicateSources.books.push({ ...duplicateSources.books[0] })

    const generation = generateCatalog({
      sources: duplicateSources,
      sourceFiles: [{ sourceId: 'catalog-source', bytes: Buffer.from('source') }],
      readAsset,
      metadata: { generatedAt: '2025-01-01T00:00:00.000Z', sourceRevision: 'revision-one' },
    })

    await expect(generation).rejects.toBeInstanceOf(CatalogGenerationError)
    await expect(generation).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ scope: 'book', code: 'DUPLICATE_ID', id: 'book:one' }),
      ]),
    })
  })

  it('blocks missing assets without exposing reader filesystem details', async () => {
    const privatePath = '/private/fixture-library/book.pdf'
    const generation = generateCatalog({
      sources: sources(),
      sourceFiles: [{ sourceId: 'catalog-source', bytes: Buffer.from('source') }],
      readAsset: async ({ id, path }: { id: string; path: string }) => {
        if (id === 'asset:book-document') throw new Error(`${privatePath}: permission denied`)
        return readAsset({ path })
      },
      metadata: { generatedAt: '2025-01-01T00:00:00.000Z', sourceRevision: 'revision-one' },
    })

    await expect(generation).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ scope: 'asset', code: 'MISSING_ASSET', id: 'asset:book-document' }),
      ]),
    })
    await expect(generation).rejects.not.toThrow(privatePath)
  })
})

describe('exact catalog snapshot validation', () => {
  it('accepts exact parity and keeps the start snapshot deeply immutable', async () => {
    const snapshot = await buildSnapshot()
    const candidate = clone(snapshot.catalog)

    expect(compareCatalogToSnapshot(snapshot, candidate)).toEqual({ matches: true, diffs: [] })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.catalog.collections)).toBe(true)
    expect(() => {
      ;(snapshot.catalog.collections as Array<unknown>).push({})
    }).toThrow()
  })

  it.each([
    ['missing', (catalog: any) => catalog.books.pop(), { scope: 'book', reason: 'missing', id: 'book:one' }],
    ['additional', (catalog: any) => catalog.bhajans.push({ ...catalog.bhajans[0], id: 'bhajan:extra' }), { scope: 'bhajan', reason: 'additional', id: 'bhajan:extra' }],
    ['reordered', (catalog: any) => catalog.collectionPlaylists[0].videos.reverse(), { scope: 'video', reason: 'order', id: 'playlist:one', field: 'videos' }],
    ['reassigned', (catalog: any) => {
      const [playlist] = catalog.collectionPlaylists.splice(0, 1)
      delete playlist.collectionId
      catalog.standalonePlaylists.push(playlist)
    }, { scope: 'playlist', reason: 'membership', id: 'playlist:one', field: 'assignment' }],
    ['membership changed', (catalog: any) => { catalog.collections[0].playlistIds = [] }, { scope: 'collection', reason: 'membership', id: 'collection:one', field: 'playlistIds' }],
    ['metadata changed', (catalog: any) => { catalog.books[0].title = 'Changed' }, { scope: 'book', reason: 'metadata', id: 'book:one', field: 'title' }],
    ['hash mismatched', (catalog: any) => { catalog.assets[0].sha256 = '0'.repeat(64) }, { scope: 'asset', reason: 'hash-mismatch', field: 'sha256' }],
    ['incomplete', (catalog: any) => { delete catalog.books }, { scope: 'book', reason: 'unreadable', field: 'books' }],
  ])('blocks a %s candidate with a scoped difference', async (_name, mutate, expectedDiff) => {
    const snapshot = await buildSnapshot()
    const candidate: any = clone(snapshot.catalog)
    mutate(candidate)

    const result = compareCatalogToSnapshot(snapshot, candidate)

    expect(result.matches).toBe(false)
    expect(result.diffs).toEqual(expect.arrayContaining([expect.objectContaining(expectedDiff)]))
    expect(() => validateCatalogSnapshot(snapshot, candidate)).toThrow(CatalogValidationError)
  })

  it('fails closed when the candidate cannot be read or the snapshot is incomplete', async () => {
    const snapshot = await buildSnapshot()
    const unreadable = compareCatalogToSnapshot(snapshot, undefined)
    expect(unreadable).toEqual({
      matches: false,
      diffs: [expect.objectContaining({ scope: 'catalog', reason: 'unreadable', field: 'candidate' })],
    })

    const incompleteSnapshot = clone(snapshot) as any
    incompleteSnapshot.sourceFiles = []
    expect(compareCatalogToSnapshot(incompleteSnapshot, snapshot.catalog).diffs).toEqual(
      expect.arrayContaining([expect.objectContaining({ scope: 'catalog', reason: 'unreadable', field: 'sourceFiles' })]),
    )
  })

  it('blocks unreadable and hash-mismatched asset bytes without leaking reader errors', async () => {
    const snapshot = await buildSnapshot()
    const candidate = clone(snapshot.catalog)
    const validation = validateReleaseCatalog({
      snapshot,
      candidate,
      readAsset: async ({ id }: { id: string }) => {
        if (id === 'asset:collection') throw new Error('/private/catalog/collection.jpg')
        if (id === 'asset:playlist') return Buffer.from('changed')
        const assetRecord = candidate.assets.find((item: { id: string; path: string }) => item.id === id)
        return readAsset({ path: assetRecord?.path ?? '' })
      },
    })

    await expect(validation).rejects.toMatchObject({
      diffs: expect.arrayContaining([
        expect.objectContaining({ scope: 'asset', id: 'asset:collection', reason: 'unreadable' }),
        expect.objectContaining({ scope: 'asset', id: 'asset:playlist', reason: 'hash-mismatch' }),
      ]),
    })
    await expect(validation).rejects.not.toThrow('/private/catalog')
  })
})
