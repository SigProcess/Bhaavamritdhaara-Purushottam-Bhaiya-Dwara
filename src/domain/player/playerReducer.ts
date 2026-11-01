import type {
  AppState,
  ElementId,
  PlayerState,
  PlaylistId,
  PlaylistRecord,
  ScrollSnapshot,
  VideoId,
} from '../contracts'
import { navigationReducer } from '../navigation/navigationCoordinator'

export type PlaylistAvailability = PlayerState['mode']

export type PlayerAction =
  | { readonly type: 'initialize'; readonly playlist: PlaylistRecord }
  | {
      readonly type: 'select-video'
      readonly playlistId: PlaylistId
      readonly videoId: VideoId
    }
  | {
      readonly type: 'set-playback-state'
      readonly playlistId: PlaylistId
      readonly videoId?: VideoId
      readonly playbackState: 'loading' | 'playing' | 'paused' | 'failed'
    }
  | {
      readonly type: 'save-position'
      readonly playlistId: PlaylistId
      readonly videoId?: VideoId
      readonly positionSeconds: number
    }

export interface OpenPlaylistAction {
  readonly playlist: PlaylistRecord
  readonly originScroll: ScrollSnapshot
  readonly originFocusTargetId?: ElementId
}

function hasValidPlaylistIdentifier(identifier: string | undefined): boolean {
  return identifier !== undefined && /^[A-Za-z0-9_-]+$/u.test(identifier)
}

/** Resolves the deterministic playback mode without loading or starting media. */
export function resolvePlaylistAvailability(
  playlist: PlaylistRecord,
): PlaylistAvailability {
  if (playlist.videos !== undefined && playlist.videos.length > 0) {
    return 'recorded-videos'
  }

  if (hasValidPlaylistIdentifier(playlist.youtubePlaylistId)) {
    return 'playlist-embed'
  }

  return 'unavailable'
}

/**
 * Creates the player state for a playlist. Recorded metadata takes precedence,
 * and its first canonical video is selected while playback remains idle.
 */
export function initializePlayer(playlist: PlaylistRecord): PlayerState {
  switch (resolvePlaylistAvailability(playlist)) {
    case 'recorded-videos':
      return {
        mode: 'recorded-videos',
        playlistId: playlist.id,
        selectedVideoId: playlist.videos![0].id,
        playbackState: 'idle',
      }

    case 'playlist-embed':
      return {
        mode: 'playlist-embed',
        playlistId: playlist.id,
        playbackState: 'idle',
      }

    case 'unavailable':
      return {
        mode: 'unavailable',
        playlistId: playlist.id,
        playlistTitle: playlist.title,
        playbackState: 'failed',
      }
  }
}

/** Pure reducer for deterministic initialization and singular video selection. */
export function playerReducer(
  state: PlayerState | undefined,
  action: PlayerAction,
): PlayerState | undefined {
  if (action.type === 'initialize') {
    return initializePlayer(action.playlist)
  }

  if (action.type === 'select-video') {
    if (
      state === undefined ||
      state.mode !== 'recorded-videos' ||
      state.playlistId !== action.playlistId ||
      state.selectedVideoId === action.videoId
    ) {
      return state
    }

    return {
      mode: 'recorded-videos',
      playlistId: state.playlistId,
      selectedVideoId: action.videoId,
      playbackState: 'idle',
    }
  }

  if (
    state === undefined ||
    state.mode === 'unavailable' ||
    state.playlistId !== action.playlistId ||
    (state.mode === 'recorded-videos'
      ? action.videoId !== state.selectedVideoId
      : action.videoId !== undefined)
  ) {
    return state
  }

  if (action.type === 'set-playback-state') {
    return { ...state, playbackState: action.playbackState }
  }

  return {
    ...state,
    positionSeconds: Math.max(0, action.positionSeconds),
  }
}

/**
 * Opens an available playlist and initializes its player. An unavailable
 * playlist is named in player state while the exact origin stack is retained.
 */
export function reducePlaylistOpen(
  state: AppState,
  action: OpenPlaylistAction,
): AppState {
  const player = initializePlayer(action.playlist)

  if (player.mode === 'unavailable') {
    return { ...state, player }
  }

  const navigation = navigationReducer(
    {
      stack: state.navigation,
      ...(state.documentPresentation === undefined
        ? {}
        : { documentPresentation: state.documentPresentation }),
    },
    {
      type: 'push',
      route: {
        kind: 'playlist',
        playlistId: action.playlist.id,
        ...(action.playlist.collectionId === undefined
          ? {}
          : { collectionId: action.playlist.collectionId }),
        ...(player.mode === 'recorded-videos'
          ? { selectedVideoId: player.selectedVideoId }
          : {}),
      },
      originScroll: action.originScroll,
      ...(action.originFocusTargetId === undefined
        ? {}
        : { originFocusTargetId: action.originFocusTargetId }),
    },
  )

  return {
    ...state,
    navigation: navigation.stack,
    player,
  }
}
