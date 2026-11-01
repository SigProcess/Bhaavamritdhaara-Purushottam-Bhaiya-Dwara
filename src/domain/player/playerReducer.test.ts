import { describe, expect, it } from 'vitest'
import type {
  AppState,
  ElementId,
  PlaylistId,
  PlaylistRecord,
  VideoId,
} from '../contracts'
import { canonicalCatalogFixture } from '../../test-support'
import {
  initializePlayer,
  playerReducer,
  reducePlaylistOpen,
  resolvePlaylistAvailability,
} from './playerReducer'

const recordedPlaylist = canonicalCatalogFixture.collectionPlaylists[0]
const [embedPlaylist, unavailablePlaylist] =
  canonicalCatalogFixture.standalonePlaylists

function createAppState(): AppState {
  return {
    catalog: { active: canonicalCatalogFixture, source: 'packaged' },
    navigation: [
      {
        route: {
          kind: 'collection',
          collectionId: canonicalCatalogFixture.collections[0].id,
        },
        scroll: { x: 4, y: 360 },
        focusTargetId: 'playlist-card' as ElementId,
      },
    ],
    bhajanFinder: { rawQuery: '', showAll: false },
    requests: {},
    network: 'online',
  }
}

describe('playlist availability and player initialization', () => {
  it('prefers recorded videos and selects the first canonical video without playback', () => {
    expect(resolvePlaylistAvailability(recordedPlaylist)).toBe(
      'recorded-videos',
    )
    expect(initializePlayer(recordedPlaylist)).toEqual({
      mode: 'recorded-videos',
      playlistId: recordedPlaylist.id,
      selectedVideoId: recordedPlaylist.videos![0].id,
      playbackState: 'idle',
    })
  })

  it('falls back to the playlist embed when recorded videos are absent or empty', () => {
    const withEmptyVideos: PlaylistRecord = {
      ...embedPlaylist,
      videos: [],
    }

    expect(initializePlayer(embedPlaylist)).toEqual({
      mode: 'playlist-embed',
      playlistId: embedPlaylist.id,
      playbackState: 'idle',
    })
    expect(resolvePlaylistAvailability(withEmptyVideos)).toBe(
      'playlist-embed',
    )
  })

  it('creates a named unavailable state when neither playback source is valid', () => {
    const invalidIdentifier: PlaylistRecord = {
      ...unavailablePlaylist,
      youtubePlaylistId: 'not a playlist id',
    }

    expect(initializePlayer(invalidIdentifier)).toEqual({
      mode: 'unavailable',
      playlistId: unavailablePlaylist.id,
      playlistTitle: unavailablePlaylist.title,
      playbackState: 'failed',
    })
  })

  it('replaces the selected video with one singular selection in idle state', () => {
    const initial = {
      ...initializePlayer(recordedPlaylist),
      mode: 'recorded-videos' as const,
      selectedVideoId: recordedPlaylist.videos![0].id,
      playbackState: 'playing' as const,
      positionSeconds: 42,
    }
    const chosenVideoId = recordedPlaylist.videos![1].id

    const selected = playerReducer(initial, {
      type: 'select-video',
      playlistId: recordedPlaylist.id,
      videoId: chosenVideoId,
    })

    expect(selected).toEqual({
      mode: 'recorded-videos',
      playlistId: recordedPlaylist.id,
      selectedVideoId: chosenVideoId,
      playbackState: 'idle',
    })
    expect(Object.keys(selected!).filter((key) => key === 'selectedVideoId')).toHaveLength(1)
  })

  it('ignores stale selection actions for another playlist', () => {
    const initial = initializePlayer(recordedPlaylist)

    expect(
      playerReducer(initial, {
        type: 'select-video',
        playlistId: 'playlist-other' as PlaylistId,
        videoId: 'video-other' as VideoId,
      }),
    ).toBe(initial)
  })

  it('tracks playback and position only for the selected media identity', () => {
    const initial = initializePlayer(recordedPlaylist)
    const selectedVideoId = recordedPlaylist.videos![0].id
    const loading = playerReducer(initial, {
      type: 'set-playback-state',
      playlistId: recordedPlaylist.id,
      videoId: selectedVideoId,
      playbackState: 'loading',
    })
    const playing = playerReducer(loading, {
      type: 'set-playback-state',
      playlistId: recordedPlaylist.id,
      videoId: selectedVideoId,
      playbackState: 'playing',
    })
    const positioned = playerReducer(playing, {
      type: 'save-position',
      playlistId: recordedPlaylist.id,
      videoId: selectedVideoId,
      positionSeconds: 37,
    })

    expect(positioned).toMatchObject({ playbackState: 'playing', positionSeconds: 37 })
    expect(playerReducer(positioned, {
      type: 'set-playback-state',
      playlistId: recordedPlaylist.id,
      videoId: 'video-stale' as VideoId,
      playbackState: 'failed',
    })).toBe(positioned)
  })

  it('retains the exact originating route and scroll when resolution fails', () => {
    const initial = createAppState()
    const navigation = initial.navigation

    const next = reducePlaylistOpen(initial, {
      playlist: unavailablePlaylist,
      originScroll: { x: 9, y: 720 },
      originFocusTargetId: 'unavailable-card' as ElementId,
    })

    expect(next.navigation).toBe(navigation)
    expect(next.navigation).toEqual(initial.navigation)
    expect(next.player).toEqual({
      mode: 'unavailable',
      playlistId: unavailablePlaylist.id,
      playlistTitle: unavailablePlaylist.title,
      playbackState: 'failed',
    })
  })

  it('pushes an available playlist while snapshotting its collection origin', () => {
    const initial = createAppState()
    const originScroll = { x: 0, y: 640 }
    const focusTargetId = 'recorded-card' as ElementId

    const next = reducePlaylistOpen(initial, {
      playlist: recordedPlaylist,
      originScroll,
      originFocusTargetId: focusTargetId,
    })

    expect(next.navigation).toEqual([
      {
        route: initial.navigation[0].route,
        scroll: originScroll,
        focusTargetId,
      },
      {
        route: {
          kind: 'playlist',
          playlistId: recordedPlaylist.id,
          collectionId: recordedPlaylist.collectionId,
          selectedVideoId: recordedPlaylist.videos![0].id,
        },
        scroll: { x: 0, y: 0 },
      },
    ])
    expect(next.player?.playbackState).toBe('idle')
  })
})
