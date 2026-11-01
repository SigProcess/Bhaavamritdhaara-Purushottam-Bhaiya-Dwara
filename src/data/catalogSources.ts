import bhajanEntries from './bhajanPdfs.js'
import books from './books.json'
import playlistVideos from './playlistVideos.json'
import playlistData from './playlists.json'

export type SourceAssetKind = 'thumbnail' | 'cover' | 'document'

export interface SourceAssetReference {
  readonly id: string
  readonly path: string
  readonly kind: SourceAssetKind
}

export interface SourceVideo {
  /** Stable record ID; sourceVideoId preserves the repository-provided YouTube ID. */
  readonly id: string
  readonly sourceVideoId: string
  readonly title: string
  readonly thumbnail: SourceAssetReference
}

export interface SourcePlaylist {
  readonly id: string
  readonly sourcePlaylistId: number
  readonly title: string
  readonly thumbnail: SourceAssetReference
  readonly youtubePlaylistId: string
  readonly collectionId?: string
  readonly videos: readonly SourceVideo[]
}

export interface SourceCollection {
  readonly id: string
  readonly title: string
  readonly thumbnail: SourceAssetReference
  /** Stable playlist IDs in repository display order. */
  readonly playlistIds: readonly string[]
}

export interface SourceBhajan {
  readonly id: string
  readonly hindiTitle: string
  readonly englishTitle: string
  readonly document: SourceAssetReference
}

export interface SourceBook {
  readonly id: string
  readonly title: string
  readonly subtitle?: string
  readonly author?: string
  readonly pageCount: number
  readonly cover: SourceAssetReference
  readonly document: SourceAssetReference
}

export interface RepositoryContentSources {
  readonly collections: readonly SourceCollection[]
  readonly collectionPlaylists: readonly SourcePlaylist[]
  readonly standalonePlaylists: readonly SourcePlaylist[]
  readonly bhajans: readonly SourceBhajan[]
  readonly books: readonly SourceBook[]
}

const playlistStableId = (sourcePlaylistId: number): string =>
  `playlist:${sourcePlaylistId}`

const assetReference = (
  kind: SourceAssetKind,
  ownerId: string,
  path: string,
): SourceAssetReference => ({
  id: `asset:${kind}:${ownerId}`,
  path,
  kind,
})

const youtubePlaylistId = (url: string): string => {
  const parsed = new URL(url)
  const value = parsed.searchParams.get('list')
  if (!value) {
    throw new Error(`Playlist URL has no list identifier: ${url}`)
  }
  return value
}

const hindiTitleFromFilename = (filename: string): string =>
  filename
    .replace(/\.pdf$/i, '')
    .replace(/^\d{3}_/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const sourceVideosFor = (playlistId: string): readonly SourceVideo[] => {
  const source = playlistVideos[playlistId as keyof typeof playlistVideos]
  if (!source) return []

  const occurrences = new Map<string, number>()
  return source.videos.map((video) => {
    const occurrence = (occurrences.get(video.id) ?? 0) + 1
    occurrences.set(video.id, occurrence)
    const duplicateSuffix = occurrence === 1 ? '' : `:duplicate-${occurrence}`
    const id = `video:${playlistId}:${video.id}${duplicateSuffix}`

    return {
      id,
      sourceVideoId: video.id,
      title: video.title,
      thumbnail: assetReference(
        'thumbnail',
        id,
        `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
      ),
    }
  })
}

type RawPlaylist = (typeof playlistData.collections)[number]['playlists'][number]

const sourcePlaylist = (
  playlist: RawPlaylist,
  collectionId?: string,
): SourcePlaylist => {
  const id = playlistStableId(playlist.id)
  const externalId = youtubePlaylistId(playlist.url)

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

export const collectionPlaylists: readonly SourcePlaylist[] =
  playlistData.collections.flatMap((collection) =>
    collection.playlists.map((playlist) => sourcePlaylist(playlist, collection.id)),
  )

export const standalonePlaylists: readonly SourcePlaylist[] =
  playlistData.playlists.map((playlist) => sourcePlaylist(playlist))

export const collections: readonly SourceCollection[] =
  playlistData.collections.map((collection) => ({
    id: collection.id,
    title: collection.title,
    thumbnail: assetReference(
      'thumbnail',
      `collection:${collection.id}`,
      collection.playlists[0]?.thumb ?? '',
    ),
    playlistIds: collection.playlists.map((playlist) =>
      playlistStableId(playlist.id),
    ),
  }))

export const bhajans: readonly SourceBhajan[] = bhajanEntries.map((bhajan) => {
  const id = `bhajan:${bhajan.file}`
  return {
    id,
    hindiTitle: hindiTitleFromFilename(bhajan.file),
    englishTitle: bhajan.en,
    document: assetReference('document', id, `/bhajan-pdfs/${bhajan.file}`),
  }
})

export const bookSources: readonly SourceBook[] = books.map((book) => {
  const id = `book:${book.id}`
  return {
    id,
    title: book.title,
    ...('subtitle' in book ? { subtitle: book.subtitle } : {}),
    ...('author' in book ? { author: book.author } : {}),
    pageCount: book.pages,
    cover: assetReference('cover', id, book.cover),
    document: assetReference('document', id, book.pdf),
  }
})

/**
 * Generator entry point. Arrays retain repository order and records retain every
 * authored value needed by the canonical catalog. Runtime state is not included.
 */
export const repositoryContentSources: RepositoryContentSources = {
  collections,
  collectionPlaylists,
  standalonePlaylists,
  bhajans,
  books: bookSources,
}

export default repositoryContentSources
