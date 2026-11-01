import { describe, expect, it } from 'vitest'
import type {
  AppState,
  BookId,
  ElementId,
  RequestId,
  RequestKind,
  RequestTargetId,
} from '../contracts'
import {
  canonicalCatalogFixture,
  failedRequestFixtures,
  mixedRequestRegistryFixture,
  requestId,
} from '../../test-support'
import {
  reduceRequestRegistry,
  type RequestIdentity,
} from './requestRegistry'

const focusTargetId = (value: string) => value as ElementId

function createAppState(
  overrides: Partial<AppState> = {},
): AppState {
  return {
    catalog: {
      active: canonicalCatalogFixture,
      source: 'packaged',
    },
    navigation: [
      {
        route: { kind: 'home' },
        scroll: { x: 0, y: 240 },
        focusTargetId: focusTargetId('home-playlists'),
      },
    ],
    bhajanFinder: { rawQuery: 'राम', showAll: true },
    player: {
      mode: 'recorded-videos',
      playlistId: canonicalCatalogFixture.collectionPlaylists[0].id,
      selectedVideoId:
        canonicalCatalogFixture.collectionPlaylists[0].videos![0].id,
      playbackState: 'paused',
      positionSeconds: 42,
    },
    requests: {},
    network: 'online',
    ...overrides,
  }
}

const failureCases: readonly (RequestIdentity & {
  readonly errorCode: string
})[] = [
  {
    requestId: requestId('catalog-failure'),
    kind: 'catalog-update',
    targetId: canonicalCatalogFixture.catalogVersion,
    errorCode: 'CATALOG_UPDATE_INVALID',
  },
  {
    requestId: failedRequestFixtures.collection.requestId,
    kind: 'collection',
    targetId: failedRequestFixtures.collection.targetId,
    errorCode: 'COLLECTION_UNAVAILABLE',
  },
  {
    requestId: failedRequestFixtures.playbackTimeout.requestId,
    kind: 'playback',
    targetId: failedRequestFixtures.playbackTimeout.targetId,
    errorCode: 'PLAYBACK_TIMEOUT',
  },
  {
    requestId: failedRequestFixtures.documentOpen.requestId,
    kind: 'document-open',
    targetId: failedRequestFixtures.documentOpen.targetId,
    errorCode: 'DOCUMENT_NOT_FOUND',
  },
  {
    requestId: failedRequestFixtures.documentExport.requestId,
    kind: 'document-export',
    targetId: failedRequestFixtures.documentExport.targetId,
    errorCode: 'EXPORT_FAILED',
  },
]

describe('reduceRequestRegistry', () => {
  it.each(failureCases)(
    'binds a $kind failure to its immutable request and target IDs',
    (failure) => {
      const initial = createAppState()
      const transition = reduceRequestRegistry(initial, {
        type: 'request-failed',
        ...failure,
      })

      expect(transition.commands).toEqual([])
      expect(transition.state.requests[failure.requestId]).toEqual({
        ...failure,
        status: 'retryable',
        retryPolicy: 'immediate',
      })
      expect(initial.requests[failure.requestId]).toBeUndefined()
    },
  )

  it('rejects attempts to rebind a request ID to another target', () => {
    const existing = failedRequestFixtures.documentOpen
    const initial = createAppState({
      requests: { [existing.requestId]: existing },
    })

    expect(() =>
      reduceRequestRegistry(initial, {
        type: 'request-failed',
        requestId: existing.requestId,
        kind: existing.kind,
        targetId: 'book-rom-rom' as BookId,
        errorCode: 'DOCUMENT_NOT_FOUND',
      }),
    ).toThrow(/cannot be rebound/)
  })

  it('retries only the selected request and emits its exact identity', () => {
    const initial = createAppState({
      requests: mixedRequestRegistryFixture,
    })
    const selected = failedRequestFixtures.playbackOffline
    const unrelated = initial.requests[failedRequestFixtures.documentOpen.requestId]

    const transition = reduceRequestRegistry(initial, {
      type: 'retry-requested',
      requestId: selected.requestId,
    })

    expect(transition.commands).toEqual([
      {
        type: 'retry-request',
        requestId: selected.requestId,
        kind: selected.kind,
        targetId: selected.targetId,
      },
    ])
    expect(transition.state.requests[selected.requestId]).toMatchObject({
      requestId: selected.requestId,
      targetId: selected.targetId,
      status: 'pending',
    })
    expect(
      transition.state.requests[failedRequestFixtures.documentOpen.requestId],
    ).toBe(unrelated)
  })

  it('does not retry unknown, pending, failed, or successful requests', () => {
    const initial = createAppState({ requests: mixedRequestRegistryFixture })
    const blockedIds = [
      requestId('unknown'),
      requestId('request-catalog-pending'),
      requestId('request-thumbnail-succeeded'),
    ]

    for (const blockedId of blockedIds) {
      const transition = reduceRequestRegistry(initial, {
        type: 'retry-requested',
        requestId: blockedId,
      })
      expect(transition).toEqual({ state: initial, commands: [] })
    }
  })

  it('re-enables the same network-bound failure after reconnection', () => {
    const failure = failureCases[2]
    const offline = createAppState({ network: 'offline' })
    const failed = reduceRequestRegistry(offline, {
      type: 'request-failed',
      ...failure,
      errorCode: 'PLAYBACK_OFFLINE',
      retryPolicy: 'when-online',
    }).state

    expect(failed.requests[failure.requestId]).toMatchObject({
      status: 'failed',
      targetId: failure.targetId,
      retryPolicy: 'when-online',
    })

    const reconnected = reduceRequestRegistry(failed, {
      type: 'network-changed',
      status: 'online',
    }).state

    expect(reconnected.requests[failure.requestId]).toMatchObject({
      status: 'retryable',
      targetId: failure.targetId,
      retryPolicy: 'when-online',
    })
  })

  it('preserves local application state when a retry fails repeatedly', () => {
    const failure = failureCases[4]
    const initial = createAppState()
    const firstFailure = reduceRequestRegistry(initial, {
      type: 'request-failed',
      ...failure,
    }).state
    const retried = reduceRequestRegistry(firstFailure, {
      type: 'retry-requested',
      requestId: failure.requestId,
    }).state
    const repeatedFailure = reduceRequestRegistry(retried, {
      type: 'request-failed',
      ...failure,
    }).state

    expect(repeatedFailure.requests[failure.requestId]).toMatchObject({
      status: 'retryable',
      targetId: failure.targetId,
      errorCode: failure.errorCode,
    })
    expect(repeatedFailure.catalog).toBe(initial.catalog)
    expect(repeatedFailure.navigation).toBe(initial.navigation)
    expect(repeatedFailure.bhajanFinder).toBe(initial.bhajanFinder)
    expect(repeatedFailure.player).toBe(initial.player)
  })

  it('marks only matching network-bound retries unavailable when offline', () => {
    const immediateId = requestId('immediate')
    const networkId = requestId('network')
    const targetId = canonicalCatalogFixture.catalogVersion as RequestTargetId
    const kind: RequestKind = 'catalog-update'
    const initial = createAppState({
      requests: {
        [immediateId]: {
          requestId: immediateId,
          kind,
          targetId,
          status: 'retryable',
          retryPolicy: 'immediate',
        },
        [networkId]: {
          requestId: networkId,
          kind,
          targetId,
          status: 'retryable',
          retryPolicy: 'when-online',
        },
      },
    })

    const transition = reduceRequestRegistry(initial, {
      type: 'network-changed',
      status: 'offline',
    })

    expect(transition.state.network).toBe('offline')
    expect(transition.state.requests[immediateId].status).toBe('retryable')
    expect(transition.state.requests[networkId].status).toBe('failed')
  })
})
