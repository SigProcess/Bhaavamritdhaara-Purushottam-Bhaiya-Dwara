import { createHash } from 'node:crypto'

import { stableJson } from './catalog-generator.mjs'

const RECORD_FIELDS = Object.freeze({
  collection: ['title', 'thumbnail'],
  playlist: ['title', 'thumbnail', 'youtubePlaylistId', 'collectionId'],
  video: ['title', 'thumbnail'],
  bhajan: ['hindiTitle', 'englishTitle', 'meaning', 'document'],
  book: ['title', 'subtitle', 'author', 'pageCount', 'cover', 'document'],
  asset: ['path', 'byteLength', 'mediaType', 'availability'],
})

const CONTENT_FIELDS = Object.freeze([
  'collections',
  'collectionPlaylists',
  'standalonePlaylists',
  'bhajans',
  'books',
  'assets',
])

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const equal = (left, right) => stableJson(left) === stableJson(right)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const deepFreeze = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const child of Object.values(value)) deepFreeze(child)
  return value
}

const immutableCopy = (value) => deepFreeze(structuredClone(value))

const diff = (scope, reason, details = {}) => Object.freeze({ scope, reason, ...details })

export class CatalogValidationError extends Error {
  constructor(diffs) {
    super(`Catalog validation failed with ${diffs.length} difference(s)`)
    this.name = 'CatalogValidationError'
    this.diffs = Object.freeze(diffs.map((item) => Object.freeze({ ...item })))
  }
}

/**
 * Materializes the sole immutable snapshot used throughout one validation run.
 */
export const createValidationSnapshot = ({ catalog, sourceFiles, startedAt = catalog?.generatedAt, snapshotId = undefined }) => {
  const copy = immutableCopy({
    snapshotId: snapshotId ?? `snapshot:${catalog?.contentHash ?? 'unverified'}`,
    startedAt,
    sourceRevision: catalog?.sourceRevision,
    catalog,
    sourceFiles,
  })
  return copy
}

const addUnreadable = (diffs, scope, field, id) => {
  diffs.push(diff(scope, 'unreadable', { ...(id ? { id } : {}), field }))
}

const readArray = (container, field, scope, diffs) => {
  if (!isObject(container) || !Array.isArray(container[field])) {
    addUnreadable(diffs, scope, field)
    return []
  }
  return container[field]
}

const indexRecords = (records, scope, field, diffs) => {
  const indexed = new Map()
  for (const record of records) {
    if (!isObject(record) || typeof record.id !== 'string' || record.id.length === 0) {
      addUnreadable(diffs, scope, field)
      continue
    }
    if (indexed.has(record.id)) {
      addUnreadable(diffs, scope, field, record.id)
      continue
    }
    indexed.set(record.id, record)
  }
  return indexed
}

const compareSequence = (expected, actual, scope, field, diffs, id) => {
  if (!Array.isArray(expected) || !Array.isArray(actual)) {
    addUnreadable(diffs, scope, field, id)
    return
  }
  const expectedIds = expected.map((item) => typeof item === 'string' ? item : item?.id)
  const actualIds = actual.map((item) => typeof item === 'string' ? item : item?.id)
  const expectedSet = new Set(expectedIds)
  const actualSet = new Set(actualIds)
  const expectedCommon = expectedIds.filter((value) => actualSet.has(value))
  const actualCommon = actualIds.filter((value) => expectedSet.has(value))
  if (!equal(expectedCommon, actualCommon)) {
    diffs.push(diff(scope, 'order', { ...(id ? { id } : {}), field, expected: expectedIds, actual: actualIds }))
  }
}

const compareRecordSet = ({ expected, actual, scope, field, fields, diffs }) => {
  const expectedById = indexRecords(expected, scope, field, diffs)
  const actualById = indexRecords(actual, scope, field, diffs)

  for (const [id, expectedRecord] of expectedById) {
    const actualRecord = actualById.get(id)
    if (!actualRecord) {
      diffs.push(diff(scope, 'missing', { id }))
      continue
    }
    for (const recordField of fields) {
      if (!equal(expectedRecord[recordField], actualRecord[recordField])) {
        const reason = scope === 'asset' && recordField === 'sha256' ? 'hash-mismatch' : 'metadata'
        diffs.push(diff(scope, reason, {
          id,
          field: recordField,
          expected: expectedRecord[recordField],
          actual: actualRecord[recordField],
        }))
      }
    }
  }

  for (const id of actualById.keys()) {
    if (!expectedById.has(id)) diffs.push(diff(scope, 'additional', { id }))
  }

  compareSequence(expected, actual, scope, field, diffs)
  return { expectedById, actualById }
}

const allPlaylists = (catalog, diffs) => [
  ...readArray(catalog, 'collectionPlaylists', 'playlist', diffs),
  ...readArray(catalog, 'standalonePlaylists', 'playlist', diffs),
]

const playlistAssignments = (catalog, diffs) => {
  const assignments = new Map()
  for (const playlist of readArray(catalog, 'collectionPlaylists', 'playlist', diffs)) {
    if (isObject(playlist) && typeof playlist.id === 'string') {
      assignments.set(playlist.id, { list: 'collectionPlaylists', collectionId: playlist.collectionId })
    }
  }
  for (const playlist of readArray(catalog, 'standalonePlaylists', 'playlist', diffs)) {
    if (isObject(playlist) && typeof playlist.id === 'string') {
      assignments.set(playlist.id, { list: 'standalonePlaylists', collectionId: playlist.collectionId })
    }
  }
  return assignments
}

const compareMembership = (expectedCatalog, actualCatalog, expectedPlaylists, actualPlaylists, diffs) => {
  const expectedCollections = indexRecords(readArray(expectedCatalog, 'collections', 'collection', diffs), 'collection', 'collections', diffs)
  const actualCollections = indexRecords(readArray(actualCatalog, 'collections', 'collection', diffs), 'collection', 'collections', diffs)
  for (const [id, expectedCollection] of expectedCollections) {
    const actualCollection = actualCollections.get(id)
    if (!actualCollection) continue
    if (!Array.isArray(expectedCollection.playlistIds) || !Array.isArray(actualCollection.playlistIds)) {
      addUnreadable(diffs, 'collection', 'playlistIds', id)
      continue
    }
    const expectedMembership = [...new Set(expectedCollection.playlistIds)].sort()
    const actualMembership = [...new Set(actualCollection.playlistIds)].sort()
    if (!equal(expectedMembership, actualMembership)) {
      diffs.push(diff('collection', 'membership', {
        id,
        field: 'playlistIds',
        expected: expectedCollection.playlistIds,
        actual: actualCollection.playlistIds,
      }))
    }
    compareSequence(expectedCollection.playlistIds, actualCollection.playlistIds, 'collection', 'playlistIds', diffs, id)
  }

  const expectedAssignments = playlistAssignments(expectedCatalog, diffs)
  const actualAssignments = playlistAssignments(actualCatalog, diffs)
  for (const [id, assignment] of expectedAssignments) {
    if (actualAssignments.has(id) && !equal(assignment, actualAssignments.get(id))) {
      diffs.push(diff('playlist', 'membership', {
        id,
        field: 'assignment',
        expected: assignment,
        actual: actualAssignments.get(id),
      }))
    }
  }

  const expectedVideoOwners = new Map()
  const actualVideoOwners = new Map()
  for (const [playlistId, playlist] of expectedPlaylists) {
    const videos = playlist.videos ?? []
    if (!Array.isArray(videos)) addUnreadable(diffs, 'video', 'videos', playlistId)
    else for (const video of videos) if (isObject(video) && typeof video.id === 'string') expectedVideoOwners.set(video.id, playlistId)
  }
  for (const [playlistId, playlist] of actualPlaylists) {
    const videos = playlist.videos ?? []
    if (!Array.isArray(videos)) addUnreadable(diffs, 'video', 'videos', playlistId)
    else for (const video of videos) if (isObject(video) && typeof video.id === 'string') actualVideoOwners.set(video.id, playlistId)
  }
  for (const [id, owner] of expectedVideoOwners) {
    if (actualVideoOwners.has(id) && owner !== actualVideoOwners.get(id)) {
      diffs.push(diff('video', 'membership', {
        id,
        field: 'playlistId',
        expected: owner,
        actual: actualVideoOwners.get(id),
      }))
    }
  }
}

const compareVideos = (expectedPlaylists, actualPlaylists, diffs) => {
  const expectedVideos = []
  const actualVideos = []
  for (const playlist of expectedPlaylists.values()) if (Array.isArray(playlist.videos)) expectedVideos.push(...playlist.videos)
  for (const playlist of actualPlaylists.values()) if (Array.isArray(playlist.videos)) actualVideos.push(...playlist.videos)
  compareRecordSet({ expected: expectedVideos, actual: actualVideos, scope: 'video', field: 'videos', fields: RECORD_FIELDS.video, diffs })

  for (const [playlistId, expectedPlaylist] of expectedPlaylists) {
    const actualPlaylist = actualPlaylists.get(playlistId)
    if (!actualPlaylist) continue
    compareSequence(expectedPlaylist.videos ?? [], actualPlaylist.videos ?? [], 'video', 'videos', diffs, playlistId)
  }
}

const contentProjection = (catalog) => Object.fromEntries(CONTENT_FIELDS.map((field) => [field, catalog[field]]))

/**
 * Performs an exact, non-throwing comparison. Malformed or incomplete inputs are
 * represented as unreadable diffs so callers can always fail closed.
 */
export const compareCatalogToSnapshot = (snapshot, candidate) => {
  const diffs = []
  if (!isObject(snapshot) || !isObject(snapshot.catalog)) {
    addUnreadable(diffs, 'catalog', 'snapshot')
    return Object.freeze({ matches: false, diffs: Object.freeze(diffs) })
  }
  if (!Array.isArray(snapshot.sourceFiles) || snapshot.sourceFiles.length === 0) {
    addUnreadable(diffs, 'catalog', 'sourceFiles')
  } else {
    const sourceIds = new Set()
    for (const source of snapshot.sourceFiles) {
      const valid = isObject(source)
        && typeof source.sourceId === 'string'
        && source.sourceId.length > 0
        && typeof source.sha256 === 'string'
        && /^[a-f0-9]{64}$/.test(source.sha256)
        && Number.isInteger(source.byteLength)
        && source.byteLength >= 0
        && !sourceIds.has(source.sourceId)
      if (!valid) addUnreadable(diffs, 'catalog', 'sourceFiles', source?.sourceId)
      if (isObject(source) && typeof source.sourceId === 'string') sourceIds.add(source.sourceId)
    }
  }
  if (!isObject(candidate)) {
    addUnreadable(diffs, 'catalog', 'candidate')
    return Object.freeze({ matches: false, diffs: Object.freeze(diffs) })
  }

  const expected = snapshot.catalog
  for (const field of ['schemaVersion', 'catalogVersion', 'generatedAt', 'sourceRevision']) {
    if (!equal(expected[field], candidate[field])) {
      diffs.push(diff('catalog', 'metadata', { field, expected: expected[field], actual: candidate[field] }))
    }
  }
  if (expected.contentHash !== candidate.contentHash) {
    diffs.push(diff('catalog', 'hash-mismatch', {
      field: 'contentHash',
      expected: expected.contentHash,
      actual: candidate.contentHash,
    }))
  }
  const calculatedHash = sha256(Buffer.from(stableJson(contentProjection(candidate))))
  if (candidate.contentHash !== calculatedHash) {
    diffs.push(diff('catalog', 'hash-mismatch', {
      field: 'calculatedContentHash',
      expected: candidate.contentHash,
      actual: calculatedHash,
    }))
  }

  const expectedCollections = readArray(expected, 'collections', 'collection', diffs)
  const actualCollections = readArray(candidate, 'collections', 'collection', diffs)
  compareRecordSet({ expected: expectedCollections, actual: actualCollections, scope: 'collection', field: 'collections', fields: RECORD_FIELDS.collection, diffs })

  const expectedPlaylistRecords = allPlaylists(expected, diffs)
  const actualPlaylistRecords = allPlaylists(candidate, diffs)
  const playlists = compareRecordSet({ expected: expectedPlaylistRecords, actual: actualPlaylistRecords, scope: 'playlist', field: 'playlists', fields: RECORD_FIELDS.playlist, diffs })
  compareSequence(readArray(expected, 'collectionPlaylists', 'playlist', diffs), readArray(candidate, 'collectionPlaylists', 'playlist', diffs), 'playlist', 'collectionPlaylists', diffs)
  compareSequence(readArray(expected, 'standalonePlaylists', 'playlist', diffs), readArray(candidate, 'standalonePlaylists', 'playlist', diffs), 'playlist', 'standalonePlaylists', diffs)
  compareMembership(expected, candidate, playlists.expectedById, playlists.actualById, diffs)
  compareVideos(playlists.expectedById, playlists.actualById, diffs)

  for (const [field, scope] of [['bhajans', 'bhajan'], ['books', 'book'], ['assets', 'asset']]) {
    const fields = scope === 'asset' ? [...RECORD_FIELDS.asset, 'sha256'] : RECORD_FIELDS[scope]
    compareRecordSet({
      expected: readArray(expected, field, scope, diffs),
      actual: readArray(candidate, field, scope, diffs),
      scope,
      field,
      fields,
      diffs,
    })
  }

  const frozenDiffs = Object.freeze(diffs.map((item) => Object.freeze(item)))
  return Object.freeze({ matches: frozenDiffs.length === 0, diffs: frozenDiffs })
}

/** Throws a release-blocking error for every mismatch or incomplete comparison. */
export const validateCatalogSnapshot = (snapshot, candidate) => {
  const result = compareCatalogToSnapshot(snapshot, candidate)
  if (!result.matches) throw new CatalogValidationError(result.diffs)
  return result
}

/** Verifies bytes against the candidate manifest and fails closed on unreadable assets. */
export const verifyCatalogAssetHashes = async (catalog, readAsset) => {
  const diffs = []
  const assets = readArray(catalog, 'assets', 'asset', diffs)
  for (const asset of assets) {
    if (!isObject(asset) || typeof asset.id !== 'string') continue
    try {
      const bytes = Buffer.from(await readAsset(asset))
      const actualHash = sha256(bytes)
      if (actualHash !== asset.sha256) {
        diffs.push(diff('asset', 'hash-mismatch', {
          id: asset.id,
          field: 'sha256',
          expected: asset.sha256,
          actual: actualHash,
        }))
      }
      if (bytes.byteLength !== asset.byteLength) {
        diffs.push(diff('asset', 'metadata', {
          id: asset.id,
          field: 'byteLength',
          expected: asset.byteLength,
          actual: bytes.byteLength,
        }))
      }
    } catch {
      addUnreadable(diffs, 'asset', 'bytes', asset.id)
    }
  }
  return Object.freeze({ matches: diffs.length === 0, diffs: Object.freeze(diffs) })
}

export const validateReleaseCatalog = async ({ snapshot, candidate, readAsset }) => {
  const comparison = compareCatalogToSnapshot(snapshot, candidate)
  const assetComparison = readAsset
    ? await verifyCatalogAssetHashes(candidate, readAsset)
    : Object.freeze({ matches: true, diffs: Object.freeze([]) })
  const diffs = Object.freeze([...comparison.diffs, ...assetComparison.diffs])
  if (diffs.length > 0) throw new CatalogValidationError(diffs)
  return Object.freeze({ matches: true, diffs })
}
