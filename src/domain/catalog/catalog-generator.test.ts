import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'

import {
  CatalogGenerationError,
  generateCatalog,
} from '../../../scripts/lib/catalog-generator.mjs'
import { captureRepositorySources } from '../../../scripts/generate-catalog.mjs'

const bytes = (value: string) => Buffer.from(value)
const image = bytes('image-bytes')
const pdf = bytes('%PDF-1.7\nfixture')

const asset = (kind: 'thumbnail' | 'cover' | 'document', id: string, path: string) => ({ id, kind, path })

const createSources = () => {
  const collectionThumbnail = asset('thumbnail', 'asset:collection', '/collection.jpg')
  const playlistThumbnail = asset('thumbnail', 'asset:playlist', 'https://example.com/playlist.jpg')
  const videoThumbnail = asset('thumbnail', 'asset:video', 'https://example.com/video.jpg')
  const bhajanDocument = asset('document', 'asset:bhajan', '/bhajan.pdf')
  const bookCover = asset('cover', 'asset:book-cover', '/book.png')
  const bookDocument = asset('document', 'asset:book-document', '/book.pdf')

  return {
    collections: [{
      id: 'collection:one',
      title: 'Collection',
      thumbnail: collectionThumbnail,
      playlistIds: ['playlist:one'],
    }],
    collectionPlaylists: [{
      id: 'playlist:one',
      sourcePlaylistId: 1,
      title: 'Playlist',
      thumbnail: playlistThumbnail,
      youtubePlaylistId: 'PL_ONE',
      collectionId: 'collection:one',
      videos: [{
        id: 'video:one',
        sourceVideoId: 'youtube-one',
        title: 'Video',
        thumbnail: videoThumbnail,
      }],
    }],
    standalonePlaylists: [],
    bhajans: [{
      id: 'bhajan:one',
      hindiTitle: 'भजन',
      englishTitle: 'Bhajan',
      document: bhajanDocument,
    }],
    books: [{
      id: 'book:one',
      title: 'Book',
      pageCount: 1,
      cover: bookCover,
      document: bookDocument,
    }],
  }
}

const sourceFiles = [
  { sourceId: 'playlists', bytes: bytes('playlists-source') },
  { sourceId: 'documents', bytes: bytes('documents-source') },
]

const metadata = {
  generatedAt: '2025-01-01T00:00:00.000Z',
  sourceRevision: 'revision-one',
}

const assetBytes = new Map([
  ['/collection.jpg', image],
  ['https://example.com/playlist.jpg', image],
  ['https://example.com/video.jpg', image],
  ['/bhajan.pdf', pdf],
  ['/book.png', image],
  ['/book.pdf', pdf],
])

const reader = vi.fn(async ({ path }: { path: string }) => {
  const value = assetBytes.get(path)
  if (!value) throw new Error('missing')
  return value
})

describe('catalog generator', () => {
  it('emits deterministic catalog content, source digests, and a complete asset manifest', async () => {
    reader.mockClear()
    const first = await generateCatalog({ sources: createSources(), sourceFiles, readAsset: reader, metadata })
    const second = await generateCatalog({ sources: createSources(), sourceFiles, readAsset: reader, metadata })

    expect(second).toEqual(first)
    expect(first.catalog).toMatchObject({
      schemaVersion: 1,
      generatedAt: metadata.generatedAt,
      sourceRevision: metadata.sourceRevision,
      contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      catalogVersion: expect.stringMatching(/^catalog:[a-f0-9]{64}$/),
    })
    expect(first.catalog.collectionPlaylists).toHaveLength(1)
    expect(first.catalog.assets).toHaveLength(assetBytes.size)
    expect(first.catalog.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'asset:bhajan',
        mediaType: 'application/pdf',
        byteLength: pdf.byteLength,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        availability: 'packaged',
      }),
      expect.objectContaining({ id: 'asset:video', availability: 'remote' }),
    ]))
    expect(first.sourceFiles).toEqual([
      expect.objectContaining({ sourceId: 'playlists', byteLength: sourceFiles[0].bytes.byteLength }),
      expect.objectContaining({ sourceId: 'documents', byteLength: sourceFiles[1].bytes.byteLength }),
    ])
  })

  it('reads each repository source exactly once when capturing a validation snapshot', async () => {
    const counts = new Map<string, number>()
    const trackedRead = async (path: string) => {
      counts.set(path, (counts.get(path) ?? 0) + 1)
      return readFile(path)
    }

    const snapshot = await captureRepositorySources(
      process.cwd(),
      trackedRead as unknown as typeof readFile,
    )

    expect(snapshot.sourceFiles).toHaveLength(4)
    expect([...counts.values()]).toEqual([1, 1, 1, 1])
  })

  it('rejects duplicate record IDs and invalid collection membership with scoped diagnostics', async () => {
    const sources = createSources()
    sources.books[0].id = 'bhajan:one'
    sources.collections[0].playlistIds = ['playlist:missing']

    await expect(generateCatalog({ sources, sourceFiles, readAsset: reader, metadata })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ scope: 'book', code: 'DUPLICATE_ID', id: 'bhajan:one' }),
        expect.objectContaining({ scope: 'collection', code: 'INVALID_REFERENCE', id: 'collection:one' }),
      ]),
    })
  })

  it('rejects missing assets without exposing filesystem paths in diagnostics', async () => {
    const missingReader = vi.fn(async () => { throw new Error('/private/repository/public/book.pdf') })

    await expect(generateCatalog({ sources: createSources(), sourceFiles, readAsset: missingReader, metadata })).rejects.toBeInstanceOf(CatalogGenerationError)
    try {
      await generateCatalog({ sources: createSources(), sourceFiles, readAsset: missingReader, metadata })
    } catch (error) {
      const generated = error as CatalogGenerationError & { diagnostics: Array<{ code: string; message: string }> }
      const diagnostics = generated.diagnostics as Array<{ code: string; message: string }>
      expect(diagnostics.some(({ code }: { code: string }) => code === 'MISSING_ASSET')).toBe(true)
      expect(JSON.stringify(diagnostics)).not.toContain('/private/repository')
    }
  })

  it('rejects unsupported document types and invalid PDF bytes', async () => {
    const unsupported = createSources()
    unsupported.bhajans[0].document.path = '/bhajan.txt'
    await expect(generateCatalog({ sources: unsupported, sourceFiles, readAsset: reader, metadata })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ scope: 'asset', code: 'UNSUPPORTED_MEDIA_TYPE', id: 'asset:bhajan' }),
      ]),
    })

    const invalidReader = async ({ path }: { path: string }) =>
      path === '/bhajan.pdf' ? bytes('not-pdf') : reader({ path })
    await expect(generateCatalog({ sources: createSources(), sourceFiles, readAsset: invalidReader, metadata })).rejects.toMatchObject({
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ scope: 'asset', code: 'INVALID_DOCUMENT', id: 'asset:bhajan' }),
      ]),
    })
  })
})
