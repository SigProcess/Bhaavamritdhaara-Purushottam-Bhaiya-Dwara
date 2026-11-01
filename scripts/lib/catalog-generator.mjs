import { createHash } from 'node:crypto'

const DOCUMENT_MEDIA_TYPE = 'application/pdf'
const IMAGE_MEDIA_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
])

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    )
  }
  return value
}

export const stableJson = (value) => JSON.stringify(canonicalize(value))

export class CatalogGenerationError extends Error {
  constructor(diagnostics) {
    super(`Catalog generation failed with ${diagnostics.length} diagnostic(s)`)
    this.name = 'CatalogGenerationError'
    this.diagnostics = Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic })))
  }
}

const diagnostic = (scope, code, message, details = {}) => ({
  scope,
  code,
  message,
  ...details,
})

const extensionOf = (path) => {
  try {
    return new URL(path).pathname.toLowerCase().match(/\.[^.\/]+$/)?.[0] ?? ''
  } catch {
    return path.toLowerCase().match(/\.[^.\/]+$/)?.[0] ?? ''
  }
}

const expectedMediaType = (asset) => {
  const extension = extensionOf(asset.path)
  if (asset.kind === 'document') {
    return extension === '.pdf' ? DOCUMENT_MEDIA_TYPE : undefined
  }
  return IMAGE_MEDIA_TYPES.get(extension)
}

const isRemote = (path) => /^https:\/\//i.test(path)
const assetRef = (asset) => ({ assetId: asset.id })

const allPlaylists = (sources) => [
  ...sources.collectionPlaylists,
  ...sources.standalonePlaylists,
]

const validateIdsAndReferences = (sources) => {
  const diagnostics = []
  const seen = new Map()
  const register = (scope, id) => {
    if (!id || typeof id !== 'string') {
      diagnostics.push(diagnostic(scope, 'INVALID_ID', 'A stable non-empty ID is required.', { id }))
      return
    }
    if (seen.has(id)) {
      diagnostics.push(diagnostic(scope, 'DUPLICATE_ID', `Duplicate stable ID ${id}.`, { id }))
      return
    }
    seen.set(id, scope)
  }

  for (const collection of sources.collections) register('collection', collection.id)
  for (const playlist of allPlaylists(sources)) {
    register('playlist', playlist.id)
    for (const video of playlist.videos) register('video', video.id)
  }
  for (const bhajan of sources.bhajans) register('bhajan', bhajan.id)
  for (const book of sources.books) register('book', book.id)

  const collectionIds = new Set(sources.collections.map(({ id }) => id))
  const collectionPlaylistIds = new Set(sources.collectionPlaylists.map(({ id }) => id))
  const playlistOwners = new Map()
  for (const playlist of sources.collectionPlaylists) {
    if (!playlist.collectionId || !collectionIds.has(playlist.collectionId)) {
      diagnostics.push(diagnostic('playlist', 'INVALID_REFERENCE', `Playlist ${playlist.id} references an unknown collection.`, {
        id: playlist.id,
        field: 'collectionId',
      }))
    }
    if (playlistOwners.has(playlist.id)) {
      diagnostics.push(diagnostic('playlist', 'INVALID_REFERENCE', `Playlist ${playlist.id} is assigned more than once.`, {
        id: playlist.id,
        field: 'collectionId',
      }))
    }
    playlistOwners.set(playlist.id, playlist.collectionId)
  }

  for (const collection of sources.collections) {
    const localMembership = new Set()
    for (const playlistId of collection.playlistIds) {
      if (localMembership.has(playlistId) || !collectionPlaylistIds.has(playlistId) || playlistOwners.get(playlistId) !== collection.id) {
        diagnostics.push(diagnostic('collection', 'INVALID_REFERENCE', `Collection ${collection.id} has invalid playlist membership ${playlistId}.`, {
          id: collection.id,
          field: 'playlistIds',
        }))
      }
      localMembership.add(playlistId)
    }
  }

  for (const playlist of sources.collectionPlaylists) {
    const owner = sources.collections.find(({ id }) => id === playlist.collectionId)
    if (owner && owner.playlistIds.filter((id) => id === playlist.id).length !== 1) {
      diagnostics.push(diagnostic('playlist', 'INVALID_REFERENCE', `Playlist ${playlist.id} must occur exactly once in its owning collection.`, {
        id: playlist.id,
        field: 'collectionId',
      }))
    }
  }

  return diagnostics
}

const collectAssets = (sources) => {
  const assets = []
  for (const collection of sources.collections) assets.push(collection.thumbnail)
  for (const playlist of allPlaylists(sources)) {
    assets.push(playlist.thumbnail)
    for (const video of playlist.videos) assets.push(video.thumbnail)
  }
  for (const bhajan of sources.bhajans) assets.push(bhajan.document)
  for (const book of sources.books) assets.push(book.cover, book.document)
  return assets
}

const createAssetManifest = async (sources, readAsset) => {
  const diagnostics = []
  const manifest = []
  const byId = new Map()
  const bytesByPath = new Map()

  for (const asset of collectAssets(sources)) {
    const previous = byId.get(asset.id)
    if (previous) {
      if (previous.path !== asset.path || previous.kind !== asset.kind) {
        diagnostics.push(diagnostic('asset', 'DUPLICATE_ID', `Asset ID ${asset.id} resolves to conflicting references.`, { id: asset.id }))
      }
      continue
    }
    byId.set(asset.id, asset)

    const mediaType = expectedMediaType(asset)
    if (!mediaType) {
      diagnostics.push(diagnostic('asset', 'UNSUPPORTED_MEDIA_TYPE', `Asset ${asset.id} uses an unsupported ${asset.kind} type.`, {
        id: asset.id,
        field: 'path',
      }))
      continue
    }
    if (/^https?:\/\//i.test(asset.path) && !isRemote(asset.path)) {
      diagnostics.push(diagnostic('asset', 'INVALID_REFERENCE', `Remote asset ${asset.id} must use HTTPS.`, { id: asset.id, field: 'path' }))
      continue
    }

    try {
      let bytesPromise = bytesByPath.get(asset.path)
      if (!bytesPromise) {
        bytesPromise = Promise.resolve(readAsset(asset)).then((bytes) => Buffer.from(bytes))
        bytesByPath.set(asset.path, bytesPromise)
      }
      const bytes = await bytesPromise
      if (bytes.byteLength === 0) throw new Error('empty asset')
      if (asset.kind === 'document' && bytes.subarray(0, 5).toString('ascii') !== '%PDF-') {
        diagnostics.push(diagnostic('asset', 'INVALID_DOCUMENT', `Document asset ${asset.id} is not a valid PDF.`, { id: asset.id }))
        continue
      }
      manifest.push(Object.freeze({
        id: asset.id,
        path: asset.path,
        sha256: sha256(bytes),
        byteLength: bytes.byteLength,
        mediaType,
        availability: isRemote(asset.path) ? 'remote' : 'packaged',
      }))
    } catch {
      diagnostics.push(diagnostic('asset', 'MISSING_ASSET', `Asset ${asset.id} could not be read.`, { id: asset.id }))
    }
  }

  return { manifest, diagnostics }
}

const projectCatalog = (sources, assets, metadata) => {
  const playlistRecord = (playlist) => ({
    id: playlist.id,
    title: playlist.title,
    thumbnail: assetRef(playlist.thumbnail),
    ...(playlist.youtubePlaylistId ? { youtubePlaylistId: playlist.youtubePlaylistId } : {}),
    ...(playlist.collectionId ? { collectionId: playlist.collectionId } : {}),
    ...(playlist.videos.length > 0 ? {
      videos: playlist.videos.map((video) => ({
        id: video.id,
        title: video.title,
        thumbnail: assetRef(video.thumbnail),
      })),
    } : {}),
  })

  const content = {
    collections: sources.collections.map((collection) => ({
      id: collection.id,
      title: collection.title,
      thumbnail: assetRef(collection.thumbnail),
      playlistIds: [...collection.playlistIds],
    })),
    collectionPlaylists: sources.collectionPlaylists.map(playlistRecord),
    standalonePlaylists: sources.standalonePlaylists.map(playlistRecord),
    bhajans: sources.bhajans.map((bhajan) => ({
      id: bhajan.id,
      hindiTitle: bhajan.hindiTitle,
      englishTitle: bhajan.englishTitle,
      ...(bhajan.meaning ? { meaning: bhajan.meaning } : {}),
      document: assetRef(bhajan.document),
    })),
    books: sources.books.map((book) => ({
      id: book.id,
      title: book.title,
      ...(book.subtitle ? { subtitle: book.subtitle } : {}),
      ...(book.author ? { author: book.author } : {}),
      pageCount: book.pageCount,
      cover: assetRef(book.cover),
      document: assetRef(book.document),
    })),
    assets,
  }
  const contentHash = sha256(Buffer.from(stableJson(content)))
  return Object.freeze({
    schemaVersion: 1,
    catalogVersion: metadata.catalogVersion ?? `catalog:${contentHash}`,
    generatedAt: metadata.generatedAt,
    sourceRevision: metadata.sourceRevision,
    contentHash,
    ...content,
  })
}

/**
 * Generates one immutable catalog from an already-captured source snapshot.
 * The injected reader is called at most once per distinct asset path.
 */
export const generateCatalog = async ({ sources, sourceFiles, readAsset, metadata }) => {
  const diagnostics = validateIdsAndReferences(sources)
  const { manifest, diagnostics: assetDiagnostics } = await createAssetManifest(sources, readAsset)
  diagnostics.push(...assetDiagnostics)
  if (diagnostics.length > 0) throw new CatalogGenerationError(diagnostics)

  const catalog = projectCatalog(sources, manifest, metadata)
  const digests = sourceFiles.map((source) => Object.freeze({
    sourceId: source.sourceId,
    sha256: sha256(source.bytes),
    byteLength: source.bytes.byteLength,
  }))
  return Object.freeze({ catalog, sourceFiles: Object.freeze(digests) })
}
