import type {
  AssetId,
  AssetRecord,
  BhajanId,
  BhajanRecord,
  BookId,
  Catalog,
  CatalogVersionId,
  CollectionId,
  PlaylistId,
  VideoId,
} from '../../domain/contracts'

const assetId = (value: string) => value as AssetId
const bhajanId = (value: string) => value as BhajanId
const bookId = (value: string) => value as BookId
const catalogVersionId = (value: string) => value as CatalogVersionId
const collectionId = (value: string) => value as CollectionId
const playlistId = (value: string) => value as PlaylistId
const videoId = (value: string) => value as VideoId

const assets: readonly AssetRecord[] = [
  {
    id: assetId('asset-collection-thumb'),
    path: 'images/collection.jpg',
    sha256: '1'.repeat(64),
    byteLength: 128,
    mediaType: 'image/jpeg',
    availability: 'packaged',
  },
  {
    id: assetId('asset-playlist-thumb'),
    path: 'images/playlist.jpg',
    sha256: '2'.repeat(64),
    byteLength: 256,
    mediaType: 'image/jpeg',
    availability: 'packaged',
  },
  {
    id: assetId('asset-video-thumb'),
    path: 'https://example.com/images/video.jpg',
    sha256: '3'.repeat(64),
    byteLength: 512,
    mediaType: 'image/jpeg',
    availability: 'remote',
  },
  {
    id: assetId('asset-bhajan-pdf'),
    path: 'documents/आनन्दघन-प्रभु.pdf',
    sha256: '4'.repeat(64),
    byteLength: 1024,
    mediaType: 'application/pdf',
    availability: 'packaged',
  },
  {
    id: assetId('asset-book-cover'),
    path: 'images/book-cover.png',
    sha256: '5'.repeat(64),
    byteLength: 2048,
    mediaType: 'image/png',
    availability: 'packaged',
  },
  {
    id: assetId('asset-book-pdf'),
    path: 'documents/book.pdf',
    sha256: '6'.repeat(64),
    byteLength: 4096,
    mediaType: 'application/pdf',
    availability: 'packaged',
  },
]

const hindiBhajan: BhajanRecord = {
  id: bhajanId('bhajan-aanandghan-prabhu'),
  hindiTitle: 'आनन्दघन प्रभु',
  englishTitle: 'Aanandghan Prabhu',
  meaning: 'आनन्द स्वरूप प्रभु का स्मरण',
  document: { assetId: assetId('asset-bhajan-pdf') },
}

const englishBhajan: BhajanRecord = {
  id: bhajanId('bhajan-tu-mera-main-tera'),
  hindiTitle: 'तू मेरा मैं तेरा',
  englishTitle: 'Tu Mera Main Tera',
  document: { assetId: assetId('asset-bhajan-pdf') },
}

export const canonicalCatalogFixture: Catalog = {
  schemaVersion: 1,
  catalogVersion: catalogVersionId('fixture-1'),
  generatedAt: '2025-01-01T00:00:00.000Z',
  sourceRevision: 'fixture-revision',
  contentHash: 'a'.repeat(64),
  collections: [
    {
      id: collectionId('collection-pravachans'),
      title: 'Pravachans',
      thumbnail: { assetId: assetId('asset-collection-thumb') },
      playlistIds: [playlistId('playlist-recorded')],
    },
  ],
  collectionPlaylists: [
    {
      id: playlistId('playlist-recorded'),
      title: 'Recorded Devotional Talks',
      thumbnail: { assetId: assetId('asset-playlist-thumb') },
      youtubePlaylistId: 'PL_FIXTURE_RECORDED',
      collectionId: collectionId('collection-pravachans'),
      videos: [
        {
          id: videoId('video-hindi'),
          sourceVideoId: 'youtube-hindi',
          title: 'हिन्दी प्रवचन',
          thumbnail: { assetId: assetId('asset-video-thumb') },
        },
        {
          id: videoId('video-english'),
          sourceVideoId: 'youtube-english',
          title: 'English Discourse',
          thumbnail: { assetId: assetId('asset-video-thumb') },
        },
      ],
    },
  ],
  standalonePlaylists: [
    {
      id: playlistId('playlist-embed-only'),
      title: 'Embed-only Playlist',
      thumbnail: { assetId: assetId('asset-playlist-thumb') },
      youtubePlaylistId: 'PL_FIXTURE_EMBED',
    },
    {
      id: playlistId('playlist-unavailable'),
      title: 'Unavailable Playlist',
      thumbnail: { assetId: assetId('asset-playlist-thumb') },
    },
  ],
  bhajans: [hindiBhajan, englishBhajan],
  books: [
    {
      id: bookId('book-rom-rom'),
      title: 'Rom Rom Mein Ram',
      subtitle: 'रोम रोम में राम',
      author: 'Purushottam Bhaiya',
      pageCount: 108,
      cover: { assetId: assetId('asset-book-cover') },
      document: { assetId: assetId('asset-book-pdf') },
    },
  ],
  assets,
}

export const duplicateBhajanCatalogFixture: Catalog = {
  ...canonicalCatalogFixture,
  catalogVersion: catalogVersionId('fixture-duplicate-bhajan'),
  bhajans: [hindiBhajan, englishBhajan, { ...hindiBhajan }],
}

export const emptyCatalogFixture: Catalog = {
  schemaVersion: 1,
  catalogVersion: catalogVersionId('fixture-empty'),
  generatedAt: '2025-01-01T00:00:00.000Z',
  sourceRevision: 'fixture-revision-empty',
  contentHash: '0'.repeat(64),
  collections: [],
  collectionPlaylists: [],
  standalonePlaylists: [],
  bhajans: [],
  books: [],
  assets: [],
}

/** Returns a fresh mutable-safe copy so one test cannot contaminate another. */
export function createCatalogFixture(
  overrides: Partial<Catalog> = {},
): Catalog {
  return structuredClone({ ...canonicalCatalogFixture, ...overrides })
}
