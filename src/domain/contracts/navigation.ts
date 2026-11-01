import type { CollectionId, PlaylistId, VideoId } from './catalog'

export type ElementId = string & { readonly __elementIdKind: 'focus-target' }

export type AppRoute =
  | { readonly kind: 'home'; readonly anchor?: string }
  | { readonly kind: 'collection'; readonly collectionId: CollectionId }
  | {
      readonly kind: 'playlist'
      readonly playlistId: PlaylistId
      readonly collectionId?: CollectionId
      readonly selectedVideoId?: VideoId
    }
  | { readonly kind: 'privacy' }

export interface ScrollSnapshot {
  readonly x: number
  readonly y: number
}

export interface NavigationEntry {
  readonly route: AppRoute
  readonly scroll: ScrollSnapshot
  readonly focusTargetId?: ElementId
}

/** The first entry is the cold-launch Home route; the last is active. */
export type NavigationStack = readonly [NavigationEntry, ...NavigationEntry[]]
