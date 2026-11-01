import type {
  AssetId,
  BhajanId,
  BookId,
  CollectionId,
  PlaybackRequest,
  PlaybackRequestId,
  RequestId,
  RequestState,
  VideoId,
} from '../../domain/contracts'
import {
  canonicalCatalogFixture,
} from './catalogs'

export const requestId = (value: string) => value as RequestId
export const playbackRequestId = (value: string) => value as PlaybackRequestId
const assetId = (value: string) => value as AssetId
const bhajanId = (value: string) => value as BhajanId
const bookId = (value: string) => value as BookId
const collectionId = (value: string) => value as CollectionId
const videoId = (value: string) => value as VideoId

export const failedRequestFixtures = {
  collection: {
    requestId: requestId('request-collection-failed'),
    kind: 'collection',
    targetId: collectionId('collection-pravachans'),
    status: 'retryable',
    errorCode: 'COLLECTION_UNAVAILABLE',
  },
  playbackOffline: {
    requestId: requestId('request-playback-offline'),
    kind: 'playback',
    targetId: videoId('video-hindi'),
    status: 'retryable',
    errorCode: 'PLAYBACK_OFFLINE',
  },
  playbackTimeout: {
    requestId: requestId('request-playback-timeout'),
    kind: 'playback',
    targetId: videoId('video-english'),
    status: 'retryable',
    errorCode: 'PLAYBACK_TIMEOUT',
  },
  documentOpen: {
    requestId: requestId('request-document-open-failed'),
    kind: 'document-open',
    targetId: bhajanId('bhajan-aanandghan-prabhu'),
    status: 'retryable',
    errorCode: 'DOCUMENT_NOT_FOUND',
  },
  documentExport: {
    requestId: requestId('request-document-export-failed'),
    kind: 'document-export',
    targetId: bookId('book-rom-rom'),
    status: 'retryable',
    errorCode: 'EXPORT_FAILED',
  },
} as const satisfies Record<string, RequestState>

export const mixedRequestRegistryFixture: Readonly<Record<RequestId, RequestState>> = {
  [requestId('request-catalog-pending')]: {
    requestId: requestId('request-catalog-pending'),
    kind: 'catalog-update',
    targetId: canonicalCatalogFixture.catalogVersion,
    status: 'pending',
  },
  [failedRequestFixtures.playbackOffline.requestId]:
    failedRequestFixtures.playbackOffline,
  [failedRequestFixtures.documentOpen.requestId]:
    failedRequestFixtures.documentOpen,
  [requestId('request-thumbnail-succeeded')]: {
    requestId: requestId('request-thumbnail-succeeded'),
    kind: 'thumbnail',
    targetId: assetId('asset-video-thumb'),
    status: 'succeeded',
  },
}

export const offlinePlaybackRequestFixture: PlaybackRequest = {
  requestId: playbackRequestId('request-playback-offline'),
  playlistId: canonicalCatalogFixture.standalonePlaylists[0].id,
  videoId: canonicalCatalogFixture.standalonePlaylists[0].videos?.[0].id,
}
