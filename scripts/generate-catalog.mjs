#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { CatalogGenerationError, generateCatalog, stableJson } from './lib/catalog-generator.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_PATHS = Object.freeze([
  'src/data/playlists.json',
  'src/data/playlistVideos.json',
  'src/data/bhajanPdfs.js',
  'src/data/books.json',
])

const shaLikeRevision = (sourceFiles) => {
  const hash = createHash('sha256')
  for (const { sourceId, bytes } of sourceFiles) {
    hash.update(sourceId)
    hash.update('\0')
    hash.update(bytes)
    hash.update('\0')
  }
  return `sources:${hash.digest('hex')}`
}

const assetReference = (kind, ownerId, path) => ({
  id: `asset:${kind}:${ownerId}`,
  path,
  kind,
})

const playlistStableId = (id) => `playlist:${id}`

const youtubePlaylistId = (url, playlistId) => {
  try {
    const value = new URL(url).searchParams.get('list')
    if (value) return value
  } catch {}
  throw new CatalogGenerationError([{
    scope: 'playlist',
    code: 'INVALID_REFERENCE',
    id: playlistId,
    field: 'youtubePlaylistId',
    message: `Playlist ${playlistId} has no valid YouTube playlist identifier.`,
  }])
}

const hindiTitleFromFilename = (filename) => filename
  .replace(/\.pdf$/i, '')
  .replace(/^\d{3}_/, '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const parseSourceFiles = async (sourceFiles) => {
  const byId = new Map(sourceFiles.map((source) => [source.sourceId, source.bytes]))
  const parseJson = (sourceId) => JSON.parse(byId.get(sourceId).toString('utf8'))
  const playlists = parseJson(SOURCE_PATHS[0])
  const playlistVideos = parseJson(SOURCE_PATHS[1])
  const books = parseJson(SOURCE_PATHS[3])
  const bhajanModuleUrl = `data:text/javascript;base64,${byId.get(SOURCE_PATHS[2]).toString('base64')}`
  const bhajans = (await import(bhajanModuleUrl)).default

  const sourceVideosFor = (playlistId) => {
    const occurrences = new Map()
    return (playlistVideos[playlistId]?.videos ?? []).map((video) => {
      const occurrence = (occurrences.get(video.id) ?? 0) + 1
      occurrences.set(video.id, occurrence)
      const duplicateSuffix = occurrence === 1 ? '' : `:duplicate-${occurrence}`
      const id = `video:${playlistId}:${video.id}${duplicateSuffix}`
      return {
        id,
        sourceVideoId: video.id,
        title: video.title,
        thumbnail: assetReference('thumbnail', id, `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`),
      }
    })
  }

  const sourcePlaylist = (playlist, collectionId) => {
    const id = playlistStableId(playlist.id)
    const externalId = youtubePlaylistId(playlist.url, id)
    return {
      id,
      sourcePlaylistId: playlist.id,
      title: playlist.title,
      thumbnail: assetReference('thumbnail', id, playlist.thumb),
      youtubePlaylistId: externalId,
      ...(collectionId ? { collectionId } : {}),
      videos: sourceVideosFor(externalId),
    }
  }

  const collectionPlaylists = playlists.collections.flatMap((collection) =>
    collection.playlists.map((playlist) => sourcePlaylist(playlist, collection.id)))

  return {
    collections: playlists.collections.map((collection) => ({
      id: collection.id,
      title: collection.title,
      thumbnail: assetReference('thumbnail', `collection:${collection.id}`, collection.playlists[0]?.thumb ?? ''),
      playlistIds: collection.playlists.map((playlist) => playlistStableId(playlist.id)),
    })),
    collectionPlaylists,
    standalonePlaylists: playlists.playlists.map((playlist) => sourcePlaylist(playlist)),
    bhajans: bhajans.map((bhajan) => {
      const id = `bhajan:${bhajan.file}`
      return {
        id,
        hindiTitle: hindiTitleFromFilename(bhajan.file),
        englishTitle: bhajan.en,
        document: assetReference('document', id, `/bhajan-pdfs/${bhajan.file}`),
      }
    }),
    books: books.map((book) => {
      const id = `book:${book.id}`
      return {
        id,
        title: book.title,
        ...(book.subtitle ? { subtitle: book.subtitle } : {}),
        ...(book.author ? { author: book.author } : {}),
        pageCount: book.pages,
        cover: assetReference('cover', id, book.cover),
        document: assetReference('document', id, book.pdf),
      }
    }),
  }
}

export const captureRepositorySources = async (root = ROOT, read = readFile) => {
  const sourceFiles = []
  for (const sourceId of SOURCE_PATHS) {
    try {
      sourceFiles.push(Object.freeze({ sourceId, bytes: Buffer.from(await read(join(root, sourceId))) }))
    } catch {
      throw new CatalogGenerationError([{
        scope: 'source',
        code: 'UNREADABLE_SOURCE',
        id: sourceId,
        message: `Catalog source ${sourceId} could not be read.`,
      }])
    }
  }
  let sources
  try {
    sources = await parseSourceFiles(sourceFiles)
  } catch (error) {
    if (error instanceof CatalogGenerationError) throw error
    throw new CatalogGenerationError([{
      scope: 'source',
      code: 'UNREADABLE_SOURCE',
      message: 'Catalog source data could not be parsed.',
    }])
  }
  return Object.freeze({
    sourceFiles: Object.freeze(sourceFiles),
    sources: Object.freeze(sources),
  })
}

export const repositoryAssetReader = (root = ROOT) => async (asset) => {
  // Remote thumbnails are source references, not packaged release bytes. Hash the
  // immutable HTTPS reference so release validation never depends on live services.
  if (/^https:\/\//i.test(asset.path)) return Buffer.from(asset.path, 'utf8')

  const publicRoot = resolve(root, 'public')
  const relativeAssetPath = asset.path.replace(/^\/+/, '')
  const resolvedPath = resolve(publicRoot, relativeAssetPath)
  const escaped = relative(publicRoot, resolvedPath)
  if (escaped.startsWith('..') || isAbsolute(escaped)) throw new Error('asset path traversal')
  return readFile(resolvedPath)
}

export const generatedAt = () => {
  const epoch = process.env.SOURCE_DATE_EPOCH
  if (!epoch) return new Date().toISOString()
  const numeric = Number(epoch)
  const date = new Date(Number.isFinite(numeric) ? numeric * 1000 : epoch)
  if (Number.isNaN(date.valueOf())) throw new Error('SOURCE_DATE_EPOCH is invalid')
  return date.toISOString()
}

/** Captures each asset at most once and only serves immutable copies afterward. */
export const createAssetSnapshotReader = (readAsset) => {
  const captured = new Map()
  const capture = async (asset) => {
    let pending = captured.get(asset.path)
    if (!pending) {
      pending = Promise.resolve(readAsset(asset)).then((bytes) => Buffer.from(bytes))
      captured.set(asset.path, pending)
    }
    return Buffer.from(await pending)
  }
  const readCaptured = async (asset) => {
    const pending = captured.get(asset.path)
    if (!pending) throw new Error('asset was not part of the immutable snapshot')
    return Buffer.from(await pending)
  }
  return Object.freeze({ capture, readCaptured })
}

export const generateCatalogFromSnapshot = async ({ snapshot, readAsset, metadata = {} }) => {
  const sourceRevision = metadata.sourceRevision ?? process.env.SOURCE_REVISION ?? shaLikeRevision(snapshot.sourceFiles)
  return generateCatalog({
    ...snapshot,
    readAsset,
    metadata: {
      generatedAt: metadata.generatedAt ?? generatedAt(),
      sourceRevision,
      ...(metadata.catalogVersion ? { catalogVersion: metadata.catalogVersion } : {}),
    },
  })
}

export const generateRepositoryCatalog = async ({ root = ROOT, read = readFile, readAsset = repositoryAssetReader(root), metadata = {} } = {}) => {
  const snapshot = await captureRepositorySources(root, read)
  return generateCatalogFromSnapshot({ snapshot, readAsset, metadata })
}

export const writeCatalogArtifacts = async ({ output, catalog, sourceFiles }) => {
  const snapshot = {
    snapshotId: `snapshot:${catalog.contentHash}`,
    startedAt: catalog.generatedAt,
    sourceRevision: catalog.sourceRevision,
    catalog,
    sourceFiles,
  }
  await mkdir(dirname(output), { recursive: true })
  const nonce = `${process.pid}-${Date.now()}`
  const catalogTemporary = `${output}.${nonce}.tmp`
  const snapshotOutput = `${output}.snapshot.json`
  const snapshotTemporary = `${snapshotOutput}.${nonce}.tmp`
  await writeFile(catalogTemporary, `${stableJson(catalog)}\n`)
  await writeFile(snapshotTemporary, `${stableJson(snapshot)}\n`)
  const { rename } = await import('node:fs/promises')
  await rename(catalogTemporary, output)
  await rename(snapshotTemporary, snapshotOutput)
  return Object.freeze(snapshot)
}

const run = async () => {
  const outputIndex = process.argv.indexOf('--output')
  const output = resolve(ROOT, outputIndex >= 0 ? process.argv[outputIndex + 1] : 'public/catalog.json')
  const result = await generateRepositoryCatalog()
  await writeCatalogArtifacts({ output, ...result })
  console.log(`Generated ${relative(ROOT, output)} (${result.catalog.contentHash})`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run().catch((error) => {
    if (error instanceof CatalogGenerationError) {
      for (const item of error.diagnostics) console.error(`[${item.scope}:${item.code}] ${item.message}`)
    } else {
      console.error(error instanceof Error ? error.message : String(error))
    }
    process.exitCode = 1
  })
}
