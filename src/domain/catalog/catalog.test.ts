import { describe, expect, it } from 'vitest'

import type { AssetId, BhajanId, CollectionId, PlaylistId } from '../contracts'
import { createCatalogFixture } from '../../test-support/fixtures/catalogs'
import {
  CatalogValidationError,
  selectBooks,
  selectCollectionPlaylists,
  selectCollections,
  selectDistinctBhajans,
  selectPlaylistVideos,
  selectStandalonePlaylists,
  validateCatalog,
} from './catalog'

const collectionId = (value: string) => value as CollectionId
const playlistId = (value: string) => value as PlaylistId
const bhajanId = (value: string) => value as BhajanId
const assetId = (value: string) => value as AssetId

const invalidCatalog = (mutate: (catalog: Record<string, any>) => void) => {
  const catalog = createCatalogFixture() as unknown as Record<string, any>
  mutate(catalog)
  return catalog
}

const expectDiagnostic = (input: unknown, code: string, path: string) => {
  try {
    validateCatalog(input)
    throw new Error('Expected catalog validation to fail.')
  } catch (error) {
    expect(error).toBeInstanceOf(CatalogValidationError)
    expect((error as CatalogValidationError).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code, path }),
    ]))
  }
}

describe('catalog schema validation', () => {
  it('returns a detached, deeply immutable catalog after complete validation', () => {
    const source = createCatalogFixture()
    const catalog = validateCatalog(source)

    expect(catalog).toEqual(source)
    expect(catalog).not.toBe(source)
    expect(Object.isFrozen(catalog)).toBe(true)
    expect(Object.isFrozen(catalog.collections)).toBe(true)
    expect(Object.isFrozen(catalog.collections[0].thumbnail)).toBe(true)
  })

  it('rejects unsupported envelopes, duplicate IDs, and invalid optional fields', () => {
    expectDiagnostic(invalidCatalog((catalog) => { catalog.schemaVersion = 2 }), 'UNSUPPORTED_SCHEMA_VERSION', '$.schemaVersion')
    expectDiagnostic(invalidCatalog((catalog) => { catalog.books[0].id = catalog.bhajans[0].id }), 'DUPLICATE_ID', '$.books[0].id')
    expectDiagnostic(invalidCatalog((catalog) => { catalog.books[0].subtitle = 42 }), 'INVALID_FIELD', '$.books[0].subtitle')
    expectDiagnostic(invalidCatalog((catalog) => { catalog.standalonePlaylists[0].videos = 'invalid' }), 'INVALID_FIELD', '$.standalonePlaylists[0].videos')
  })

  it('rejects broken collection membership and ownership references', () => {
    expectDiagnostic(
      invalidCatalog((catalog) => { catalog.collections[0].playlistIds = ['playlist-missing'] }),
      'INVALID_REFERENCE',
      '$.collections[0].playlistIds[0]',
    )
    expectDiagnostic(
      invalidCatalog((catalog) => { catalog.collectionPlaylists[0].collectionId = 'collection-missing' }),
      'INVALID_REFERENCE',
      '$.collectionPlaylists[0].collectionId',
    )
    expectDiagnostic(
      invalidCatalog((catalog) => { catalog.standalonePlaylists[0].collectionId = catalog.collections[0].id }),
      'INVALID_REFERENCE',
      '$.standalonePlaylists[0].collectionId',
    )
  })

  it('rejects missing, malformed, insecure, and wrong-media assets', () => {
    expectDiagnostic(
      invalidCatalog((catalog) => { catalog.books[0].cover.assetId = 'asset-missing' }),
      'INVALID_REFERENCE',
      '$.books[0].cover.assetId',
    )
    expectDiagnostic(
      invalidCatalog((catalog) => { catalog.assets[0].sha256 = 'not-a-hash' }),
      'INVALID_ASSET',
      '$.assets[0].sha256',
    )
    expectDiagnostic(
      invalidCatalog((catalog) => {
        catalog.assets[2].availability = 'remote'
        catalog.assets[2].path = 'http://example.com/video.jpg'
      }),
      'INVALID_ASSET',
      '$.assets[2].path',
    )
    expectDiagnostic(
      invalidCatalog((catalog) => { catalog.assets[5].mediaType = 'image/png' }),
      'INVALID_ASSET',
      '$.books[0].document.assetId',
    )
  })
})

describe('immutable ordered catalog selectors', () => {
  it('preserves collection, membership, standalone playlist, video, and book order and metadata', () => {
    const catalog = validateCatalog(createCatalogFixture())

    const collections = selectCollections(catalog)
    const collectionPlaylists = selectCollectionPlaylists(catalog, collectionId('collection-pravachans'))
    const standalone = selectStandalonePlaylists(catalog)
    const videos = selectPlaylistVideos(catalog, playlistId('playlist-recorded'))
    const books = selectBooks(catalog)

    expect(collections.map(({ title }) => title)).toEqual(['Pravachans'])
    expect(collectionPlaylists.map(({ id }) => id)).toEqual(['playlist-recorded'])
    expect(standalone.map(({ id }) => id)).toEqual(['playlist-embed-only', 'playlist-unavailable'])
    expect(videos.map(({ title }) => title)).toEqual(['हिन्दी प्रवचन', 'English Discourse'])
    expect(books[0]).toMatchObject({
      title: 'Rom Rom Mein Ram',
      subtitle: 'रोम रोम में राम',
      author: 'Purushottam Bhaiya',
      pageCount: 108,
      cover: { assetId: 'asset-book-cover' },
    })
    for (const selected of [collections, collectionPlaylists, standalone, videos, books]) {
      expect(Object.isFrozen(selected)).toBe(true)
    }
  })

  it('returns distinct bhajan documents in first-occurrence order without rewriting metadata', () => {
    const source = createCatalogFixture()
    const first = source.bhajans[0]
    const catalog = validateCatalog({
      ...source,
      bhajans: [
        ...source.bhajans,
        {
          ...first,
          id: bhajanId('bhajan-duplicate-document'),
          hindiTitle: 'दूसरा अभिलेख',
          document: { assetId: assetId('asset-bhajan-pdf') },
        },
      ],
    })

    const bhajans = selectDistinctBhajans(catalog)

    expect(bhajans.map(({ id }) => id)).toEqual([
      'bhajan-aanandghan-prabhu',
    ])
    expect(bhajans[0]).toEqual(first)
    expect(Object.isFrozen(bhajans)).toBe(true)
  })

  it('returns immutable empty views for unknown collections and playlists', () => {
    const catalog = validateCatalog(createCatalogFixture())
    const playlists = selectCollectionPlaylists(catalog, collectionId('collection-missing'))
    const videos = selectPlaylistVideos(catalog, playlistId('playlist-missing'))

    expect(playlists).toEqual([])
    expect(videos).toEqual([])
    expect(Object.isFrozen(playlists)).toBe(true)
    expect(Object.isFrozen(videos)).toBe(true)
  })
})
