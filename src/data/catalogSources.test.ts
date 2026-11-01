import { describe, expect, it } from 'vitest'

import bhajanEntries from './bhajanPdfs.js'
import books from './books.json'
import playlistVideos from './playlistVideos.json'
import playlistData from './playlists.json'
import {
  bhajans,
  bookSources,
  collectionPlaylists,
  collections,
  standalonePlaylists,
} from './catalogSources'

const listId = (url: string): string => new URL(url).searchParams.get('list') ?? ''

describe('repository content sources', () => {
  it('preserves collection order, values, and playlist membership', () => {
    expect(collections.map(({ id, title }) => ({ id, title }))).toEqual(
      playlistData.collections.map(({ id, title }) => ({ id, title })),
    )

    expect(collections.map((collection) => collection.playlistIds)).toEqual(
      playlistData.collections.map((collection) =>
        collection.playlists.map((playlist) => `playlist:${playlist.id}`),
      ),
    )
  })

  it('preserves playlist order and repository-provided values', () => {
    const rawCollectionPlaylists = playlistData.collections.flatMap((collection) =>
      collection.playlists.map((playlist) => ({ ...playlist, collectionId: collection.id })),
    )

    expect(collectionPlaylists.map((playlist) => ({
      id: playlist.sourcePlaylistId,
      title: playlist.title,
      thumb: playlist.thumbnail.path,
      youtubePlaylistId: playlist.youtubePlaylistId,
      collectionId: playlist.collectionId,
    }))).toEqual(rawCollectionPlaylists.map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      thumb: playlist.thumb,
      youtubePlaylistId: listId(playlist.url),
      collectionId: playlist.collectionId,
    })))

    expect(standalonePlaylists.map((playlist) => ({
      id: playlist.sourcePlaylistId,
      title: playlist.title,
      thumb: playlist.thumbnail.path,
      youtubePlaylistId: playlist.youtubePlaylistId,
    }))).toEqual(playlistData.playlists.map((playlist) => ({
      id: playlist.id,
      title: playlist.title,
      thumb: playlist.thumb,
      youtubePlaylistId: listId(playlist.url),
    })))
  })

  it('preserves every recorded video occurrence and its source order', () => {
    for (const playlist of [...collectionPlaylists, ...standalonePlaylists]) {
      const raw = playlistVideos[
        playlist.youtubePlaylistId as keyof typeof playlistVideos
      ]?.videos ?? []

      expect(playlist.videos.map((video) => ({
        id: video.sourceVideoId,
        title: video.title,
      }))).toEqual(raw)
      expect(new Set(playlist.videos.map((video) => video.id)).size).toBe(
        playlist.videos.length,
      )
    }
  })

  it('preserves bhajan order, filenames, English titles, and derived Hindi titles', () => {
    expect(bhajans.map((bhajan) => ({
      file: bhajan.document.path.replace('/bhajan-pdfs/', ''),
      en: bhajan.englishTitle,
    }))).toEqual(bhajanEntries)

    expect(bhajans[0]?.hindiTitle).toBe('आनन्दघन प्रभु')
    expect(bhajans.at(-1)?.hindiTitle).toBe('गज़ल मेरी पलकों पे इन भावों को')
  })

  it('preserves extracted book order and exact authored metadata', () => {
    expect(bookSources.map((book) => ({
      id: book.id.replace('book:', ''),
      title: book.title,
      ...(book.subtitle ? { subtitle: book.subtitle } : {}),
      ...(book.author ? { author: book.author } : {}),
      pages: book.pageCount,
      cover: book.cover.path,
      pdf: book.document.path,
    }))).toEqual(books)
  })
})
