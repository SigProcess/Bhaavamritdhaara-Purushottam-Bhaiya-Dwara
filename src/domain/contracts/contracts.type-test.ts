import type {
  AssetId,
  AssetRef,
  BhajanId,
  CollectionId,
  CollectionRecord,
  DocumentRequest,
  PlaybackRequest,
  PlaybackRequestId,
  PlaylistId,
  RequestId,
} from './index'

declare const assetId: AssetId
declare const bhajanId: BhajanId
declare const collectionId: CollectionId
declare const playlistId: PlaylistId
declare const requestId: RequestId
declare const playbackRequestId: PlaybackRequestId

const assetReference: AssetRef = { assetId }
const documentRequest: DocumentRequest = {
  requestId,
  documentId: bhajanId,
  kind: 'bhajan',
}
const playbackRequest: PlaybackRequest = {
  requestId: playbackRequestId,
  playlistId,
}

const unsafeDocumentRequest: DocumentRequest = {
  requestId,
  documentId: bhajanId,
  kind: 'bhajan',
  // @ts-expect-error Native bridge requests must not accept arbitrary file paths.
  path: '/private/arbitrary.pdf',
}

const unsafePlaybackRequest: PlaybackRequest = {
  requestId: playbackRequestId,
  playlistId,
  // @ts-expect-error Media bridge requests must not accept arbitrary URLs.
  url: 'https://example.invalid/watch',
}

declare const collection: CollectionRecord
// @ts-expect-error Canonical membership arrays are immutable and retain source order.
collection.playlistIds.push(playlistId)

void assetReference
void collectionId
void documentRequest
void playbackRequest
void unsafeDocumentRequest
void unsafePlaybackRequest
