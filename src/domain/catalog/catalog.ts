import type {
  AssetRecord,
  BhajanRecord,
  BookRecord,
  Catalog,
  CollectionId,
  CollectionRecord,
  PlaylistId,
  PlaylistRecord,
  VideoRecord,
} from '../contracts'

export type CatalogValidationCode =
  | 'INVALID_ENVELOPE'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'INVALID_FIELD'
  | 'DUPLICATE_ID'
  | 'INVALID_REFERENCE'
  | 'INVALID_ASSET'

export interface CatalogValidationDiagnostic {
  readonly code: CatalogValidationCode
  readonly path: string
  readonly message: string
}

export class CatalogValidationError extends Error {
  readonly diagnostics: readonly CatalogValidationDiagnostic[]

  constructor(diagnostics: readonly CatalogValidationDiagnostic[]) {
    super(`Catalog validation failed with ${diagnostics.length} diagnostic(s).`)
    this.name = 'CatalogValidationError'
    this.diagnostics = Object.freeze(diagnostics.map((item) => Object.freeze({ ...item })))
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const deepFreeze = <Value>(value: Value): Value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

const immutableArray = <Value>(values: readonly Value[]): readonly Value[] =>
  Object.freeze([...values])

/** Validates untrusted catalog JSON, clones it, and returns a deeply immutable catalog. */
export function validateCatalog(input: unknown): Catalog {
  const diagnostics: CatalogValidationDiagnostic[] = []
  const report = (code: CatalogValidationCode, path: string, message: string) => {
    diagnostics.push({ code, path, message })
  }

  if (!isObject(input)) {
    throw new CatalogValidationError([{ code: 'INVALID_ENVELOPE', path: '$', message: 'Catalog must be an object.' }])
  }

  if (input.schemaVersion !== 1) {
    report('UNSUPPORTED_SCHEMA_VERSION', '$.schemaVersion', 'Only catalog schema version 1 is supported.')
  }

  const requiredString = (record: Record<string, unknown>, field: string, path: string) => {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      report('INVALID_FIELD', `${path}.${field}`, `${field} must be a non-empty string.`)
      return false
    }
    return true
  }
  const optionalString = (record: Record<string, unknown>, field: string, path: string) => {
    if (field in record && (typeof record[field] !== 'string' || record[field].length === 0)) {
      report('INVALID_FIELD', `${path}.${field}`, `${field} must be a non-empty string when present.`)
      return false
    }
    return true
  }
  const requiredArray = (record: Record<string, unknown>, field: string, path: string): unknown[] => {
    if (!Array.isArray(record[field])) {
      report('INVALID_FIELD', `${path}.${field}`, `${field} must be an array.`)
      return []
    }
    return record[field]
  }

  requiredString(input, 'catalogVersion', '$')
  requiredString(input, 'generatedAt', '$')
  requiredString(input, 'sourceRevision', '$')
  if (!requiredString(input, 'contentHash', '$') || !/^[a-f0-9]{64}$/.test(String(input.contentHash))) {
    if (typeof input.contentHash === 'string' && input.contentHash.length > 0) {
      report('INVALID_FIELD', '$.contentHash', 'contentHash must be a lowercase SHA-256 digest.')
    }
  }

  const collections = requiredArray(input, 'collections', '$')
  const collectionPlaylists = requiredArray(input, 'collectionPlaylists', '$')
  const standalonePlaylists = requiredArray(input, 'standalonePlaylists', '$')
  const bhajans = requiredArray(input, 'bhajans', '$')
  const books = requiredArray(input, 'books', '$')
  const assets = requiredArray(input, 'assets', '$')

  const allIds = new Map<string, string>()
  const registerId = (record: Record<string, unknown>, path: string) => {
    if (!requiredString(record, 'id', path)) return
    const id = record.id as string
    const priorPath = allIds.get(id)
    if (priorPath) report('DUPLICATE_ID', `${path}.id`, `ID ${id} is already used at ${priorPath}.`)
    else allIds.set(id, `${path}.id`)
  }
  const validateRecord = (value: unknown, path: string): value is Record<string, unknown> => {
    if (!isObject(value)) {
      report('INVALID_FIELD', path, 'Catalog record must be an object.')
      return false
    }
    registerId(value, path)
    return true
  }
  const assetRef = (value: unknown, path: string, expected: 'image' | 'document') => {
    if (!isObject(value) || typeof value.assetId !== 'string' || value.assetId.length === 0) {
      report('INVALID_REFERENCE', path, 'Asset reference must contain a non-empty assetId.')
      return
    }
    assetReferences.push({ id: value.assetId, path: `${path}.assetId`, expected })
  }

  const assetReferences: Array<{ id: string; path: string; expected: 'image' | 'document' }> = []
  const collectionMemberships = new Map<string, { collectionId: string; path: string }>()
  const collectionIds = new Set<string>()
  const collectionPlaylistIds = new Set<string>()

  collections.forEach((value, index) => {
    const path = `$.collections[${index}]`
    if (!validateRecord(value, path)) return
    requiredString(value, 'title', path)
    assetRef(value.thumbnail, `${path}.thumbnail`, 'image')
    if (typeof value.id === 'string') collectionIds.add(value.id)
    const playlistIds = requiredArray(value, 'playlistIds', path)
    const localIds = new Set<string>()
    playlistIds.forEach((playlistId, membershipIndex) => {
      const membershipPath = `${path}.playlistIds[${membershipIndex}]`
      if (typeof playlistId !== 'string' || playlistId.length === 0) {
        report('INVALID_REFERENCE', membershipPath, 'Playlist membership must be a non-empty ID.')
      } else if (localIds.has(playlistId)) {
        report('INVALID_REFERENCE', membershipPath, 'A playlist may occur only once in a collection.')
      } else {
        localIds.add(playlistId)
        collectionMemberships.set(playlistId, { collectionId: String(value.id), path: membershipPath })
      }
    })
  })

  const validatePlaylist = (value: unknown, path: string, kind: 'collection' | 'standalone') => {
    if (!validateRecord(value, path)) return
    requiredString(value, 'title', path)
    optionalString(value, 'youtubePlaylistId', path)
    assetRef(value.thumbnail, `${path}.thumbnail`, 'image')
    if (kind === 'collection') {
      optionalString(value, 'collectionId', path)
      if (typeof value.id === 'string') collectionPlaylistIds.add(value.id)
    } else if ('collectionId' in value) {
      report('INVALID_REFERENCE', `${path}.collectionId`, 'A standalone playlist cannot have a collection assignment.')
    }
    if ('videos' in value && !Array.isArray(value.videos)) {
      report('INVALID_FIELD', `${path}.videos`, 'videos must be an array when present.')
      return
    }
    const videos = Array.isArray(value.videos) ? value.videos : []
    videos.forEach((video, videoIndex) => {
      const videoPath = `${path}.videos[${videoIndex}]`
      if (!validateRecord(video, videoPath)) return
      requiredString(video, 'sourceVideoId', videoPath)
      requiredString(video, 'title', videoPath)
      assetRef(video.thumbnail, `${videoPath}.thumbnail`, 'image')
    })
  }

  collectionPlaylists.forEach((value, index) => validatePlaylist(value, `$.collectionPlaylists[${index}]`, 'collection'))
  standalonePlaylists.forEach((value, index) => validatePlaylist(value, `$.standalonePlaylists[${index}]`, 'standalone'))

  bhajans.forEach((value, index) => {
    const path = `$.bhajans[${index}]`
    if (!validateRecord(value, path)) return
    requiredString(value, 'hindiTitle', path)
    requiredString(value, 'englishTitle', path)
    optionalString(value, 'meaning', path)
    assetRef(value.document, `${path}.document`, 'document')
  })

  books.forEach((value, index) => {
    const path = `$.books[${index}]`
    if (!validateRecord(value, path)) return
    requiredString(value, 'title', path)
    optionalString(value, 'subtitle', path)
    optionalString(value, 'author', path)
    if (!Number.isInteger(value.pageCount) || Number(value.pageCount) <= 0) {
      report('INVALID_FIELD', `${path}.pageCount`, 'pageCount must be a positive integer.')
    }
    assetRef(value.cover, `${path}.cover`, 'image')
    assetRef(value.document, `${path}.document`, 'document')
  })

  const assetsById = new Map<string, Record<string, unknown>>()
  assets.forEach((value, index) => {
    const path = `$.assets[${index}]`
    if (!validateRecord(value, path)) return
    const id = typeof value.id === 'string' ? value.id : undefined
    requiredString(value, 'path', path)
    if (!requiredString(value, 'sha256', path) || !/^[a-f0-9]{64}$/.test(String(value.sha256))) {
      if (typeof value.sha256 === 'string' && value.sha256.length > 0) {
        report('INVALID_ASSET', `${path}.sha256`, 'Asset hash must be a lowercase SHA-256 digest.')
      }
    }
    if (!Number.isInteger(value.byteLength) || Number(value.byteLength) <= 0) {
      report('INVALID_ASSET', `${path}.byteLength`, 'Asset byteLength must be a positive integer.')
    }
    requiredString(value, 'mediaType', path)
    if (value.availability !== 'packaged' && value.availability !== 'remote') {
      report('INVALID_ASSET', `${path}.availability`, 'Asset availability must be packaged or remote.')
    }
    if (value.availability === 'remote' && (typeof value.path !== 'string' || !/^https:\/\//i.test(value.path))) {
      report('INVALID_ASSET', `${path}.path`, 'Remote assets must use HTTPS.')
    }
    if (id) assetsById.set(id, value)
  })

  for (const [playlistId, membership] of collectionMemberships) {
    if (!collectionPlaylistIds.has(playlistId)) {
      report('INVALID_REFERENCE', membership.path, `Collection references unknown playlist ${playlistId}.`)
    }
  }
  collectionPlaylists.forEach((value, index) => {
    if (!isObject(value) || typeof value.id !== 'string') return
    const path = `$.collectionPlaylists[${index}]`
    if (typeof value.collectionId !== 'string' || !collectionIds.has(value.collectionId)) {
      report('INVALID_REFERENCE', `${path}.collectionId`, 'Collection playlist must reference an existing collection.')
      return
    }
    const membership = collectionMemberships.get(value.id)
    if (!membership || membership.collectionId !== value.collectionId) {
      report('INVALID_REFERENCE', `${path}.collectionId`, 'Collection playlist must occur once in its owning collection membership.')
    }
  })

  for (const reference of assetReferences) {
    const asset = assetsById.get(reference.id)
    if (!asset) {
      report('INVALID_REFERENCE', reference.path, `Asset ${reference.id} does not exist.`)
      continue
    }
    const mediaType = typeof asset.mediaType === 'string' ? asset.mediaType : ''
    const validType = reference.expected === 'document'
      ? mediaType === 'application/pdf'
      : mediaType.startsWith('image/')
    if (!validType) report('INVALID_ASSET', reference.path, `Asset ${reference.id} is not a valid ${reference.expected} asset.`)
  }

  if (diagnostics.length > 0) throw new CatalogValidationError(diagnostics)
  return deepFreeze(structuredClone(input) as unknown as Catalog)
}

export const selectCollections = (catalog: Catalog): readonly CollectionRecord[] =>
  immutableArray(catalog.collections)

export const selectCollectionPlaylists = (
  catalog: Catalog,
  collectionId: CollectionId,
): readonly PlaylistRecord[] => {
  const collection = catalog.collections.find(({ id }) => id === collectionId)
  if (!collection) return Object.freeze([])
  const playlists = new Map(catalog.collectionPlaylists.map((playlist) => [playlist.id, playlist]))
  return immutableArray(collection.playlistIds.map((id) => playlists.get(id)).filter((item): item is PlaylistRecord => Boolean(item)))
}

export const selectStandalonePlaylists = (catalog: Catalog): readonly PlaylistRecord[] =>
  immutableArray(catalog.standalonePlaylists)

export const selectPlaylistVideos = (catalog: Catalog, playlistId: PlaylistId): readonly VideoRecord[] => {
  const playlist = [...catalog.collectionPlaylists, ...catalog.standalonePlaylists]
    .find(({ id }) => id === playlistId)
  return immutableArray(playlist?.videos ?? [])
}

export const selectDistinctBhajans = (catalog: Catalog): readonly BhajanRecord[] => {
  const seenDocuments = new Set<string>()
  return immutableArray(catalog.bhajans.filter((bhajan) => {
    if (seenDocuments.has(bhajan.document.assetId)) return false
    seenDocuments.add(bhajan.document.assetId)
    return true
  }))
}

export const selectBooks = (catalog: Catalog): readonly BookRecord[] =>
  immutableArray(catalog.books)
