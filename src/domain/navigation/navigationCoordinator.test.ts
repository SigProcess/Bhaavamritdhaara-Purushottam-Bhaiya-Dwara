import { describe, expect, it } from 'vitest'
import type {
  CollectionId,
  DocumentSessionId,
  ElementId,
  BhajanId,
  PlaylistId,
} from '../contracts'
import {
  activeNavigationEntry,
  createTerminatedLaunchNavigationState,
  navigationReducer,
} from './navigationCoordinator'

const collectionId = 'collection-pravachans' as CollectionId
const playlistId = 'playlist-gita' as PlaylistId
const focusTargetId = 'collection-pravachans-card' as ElementId

describe('navigation coordinator', () => {
  it('starts every terminated launch at Home with no transient presentation', () => {
    const previous = navigationReducer(
      createTerminatedLaunchNavigationState(),
      {
        type: 'push',
        route: { kind: 'privacy' },
        originScroll: { x: 0, y: 420 },
        originFocusTargetId: focusTargetId,
      },
    )
    const withDocument = navigationReducer(previous, {
      type: 'present-document',
      presentation: {
        documentId: 'bhajan-aanandghan' as BhajanId,
        sessionId: 'document-session-1' as DocumentSessionId,
      },
    })

    const relaunched = navigationReducer(withDocument, {
      type: 'terminated-launch',
    })

    expect(relaunched).toEqual({
      stack: [{ route: { kind: 'home' }, scroll: { x: 0, y: 0 } }],
    })
  })

  it('pushes collection, playlist, and privacy routes in order', () => {
    let state = createTerminatedLaunchNavigationState()
    state = navigationReducer(state, {
      type: 'push',
      route: { kind: 'collection', collectionId },
      originScroll: { x: 0, y: 120 },
      originFocusTargetId: focusTargetId,
    })
    state = navigationReducer(state, {
      type: 'push',
      route: { kind: 'playlist', playlistId, collectionId },
      originScroll: { x: 0, y: 240 },
    })
    state = navigationReducer(state, {
      type: 'push',
      route: { kind: 'privacy' },
      originScroll: { x: 0, y: 360 },
    })

    expect(state.stack.map(({ route }) => route.kind)).toEqual([
      'home',
      'collection',
      'playlist',
      'privacy',
    ])
    expect(activeNavigationEntry(state).route).toEqual({ kind: 'privacy' })
  })

  it('pops exactly one route and exposes predecessor restoration data', () => {
    const collectionState = navigationReducer(
      createTerminatedLaunchNavigationState(),
      {
        type: 'push',
        route: { kind: 'collection', collectionId },
        originScroll: { x: 0, y: 80 },
      },
    )
    const playerState = navigationReducer(collectionState, {
      type: 'push',
      route: { kind: 'playlist', playlistId, collectionId },
      originScroll: { x: 5, y: 640 },
      originFocusTargetId: focusTargetId,
    })

    const restored = navigationReducer(playerState, { type: 'pop' })

    expect(activeNavigationEntry(restored)).toEqual({
      route: { kind: 'collection', collectionId },
      scroll: { x: 5, y: 640 },
      focusTargetId,
    })
    expect(restored.stack).toHaveLength(2)
  })

  it('updates the active scroll and focus snapshot without changing its route', () => {
    const state = navigationReducer(
      createTerminatedLaunchNavigationState(),
      {
        type: 'snapshot-active',
        scroll: { x: 3, y: 99 },
        focusTargetId,
      },
    )

    expect(activeNavigationEntry(state)).toEqual({
      route: { kind: 'home' },
      scroll: { x: 3, y: 99 },
      focusTargetId,
    })
  })

  it('keeps a native document as a child presentation of the active route', () => {
    const routeState = navigationReducer(
      createTerminatedLaunchNavigationState(),
      {
        type: 'push',
        route: { kind: 'collection', collectionId },
        originScroll: { x: 0, y: 210 },
      },
    )
    const presentation = {
      documentId: 'bhajan-aanandghan' as BhajanId,
      sessionId: 'document-session-1' as DocumentSessionId,
    }

    const presented = navigationReducer(routeState, {
      type: 'present-document',
      presentation,
    })
    const dismissed = navigationReducer(presented, {
      type: 'dismiss-document',
    })

    expect(presented.stack).toBe(routeState.stack)
    expect(presented.documentPresentation).toEqual(presentation)
    expect(dismissed).toEqual(routeState)
  })

  it('does not pop past the cold-launch Home route', () => {
    const state = createTerminatedLaunchNavigationState()
    expect(navigationReducer(state, { type: 'pop' })).toBe(state)
  })
})
