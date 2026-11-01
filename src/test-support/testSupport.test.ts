import { describe, expect, it, vi } from 'vitest'
import type { BhajanId, DocumentSessionId } from '../domain/contracts'
import {
  canonicalCatalogFixture,
  createCatalogFixture,
  duplicateBhajanCatalogFixture,
  emptyCatalogFixture,
  FakeAppMetadataService,
  FakeDocumentService,
  FakeExternalMediaService,
  FakeNetworkService,
  FakeServiceError,
  FakeTimer,
  failedRequestFixtures,
  offlinePlaybackRequestFixture,
} from '.'

describe('catalog and request fixtures', () => {
  it('covers bilingual, duplicate, empty, unavailable, offline, and failed cases', () => {
    expect(canonicalCatalogFixture.bhajans[0].hindiTitle).toBe('आनन्दघन प्रभु')
    expect(canonicalCatalogFixture.bhajans[1].englishTitle).toBe(
      'Tu Mera Main Tera',
    )
    expect(duplicateBhajanCatalogFixture.bhajans[0].id).toBe(
      duplicateBhajanCatalogFixture.bhajans[2].id,
    )
    expect(emptyCatalogFixture.bhajans).toEqual([])
    expect(
      canonicalCatalogFixture.standalonePlaylists.find(
        (playlist) => playlist.id === 'playlist-unavailable',
      )?.youtubePlaylistId,
    ).toBeUndefined()
    expect(failedRequestFixtures.playbackOffline.errorCode).toBe(
      'PLAYBACK_OFFLINE',
    )
  })

  it('returns isolated catalog copies', () => {
    const first = createCatalogFixture()
    const second = createCatalogFixture()
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.bhajans).not.toBe(second.bhajans)
  })
})

describe('FakeTimer', () => {
  it('runs due callbacks deterministically and skips cancelled timers', () => {
    const timer = new FakeTimer()
    const calls: string[] = []
    const cancelled = timer.setTimeout(() => calls.push('cancelled'), 10)
    timer.setTimeout(() => calls.push('second'), 5)
    timer.setTimeout(() => calls.push('first'), 5)
    timer.clearTimeout(cancelled)

    timer.advanceBy(5)

    expect(calls).toEqual(['second', 'first'])
    expect(timer.now()).toBe(5)
    expect(timer.pendingCount()).toBe(0)
  })
})

describe('platform service fakes', () => {
  it('emits changed network states and supports unsubscribe', async () => {
    const network = new FakeNetworkService('offline')
    const listener = vi.fn()
    const unsubscribe = network.subscribe(listener)

    network.setStatus('online')
    unsubscribe()
    network.setStatus('offline')

    expect(await network.currentStatus()).toBe('offline')
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith('online')
  })

  it('models one-shot document failures and export cancellation', async () => {
    const documents = new FakeDocumentService()
    const documentId = 'bhajan-aanandghan-prabhu' as BhajanId
    const request = {
      requestId: failedRequestFixtures.documentOpen.requestId,
      documentId,
      kind: 'bhajan' as const,
    }
    documents.failNextOpen(documentId, 'DOCUMENT_NOT_FOUND')

    await expect(documents.open(request)).rejects.toEqual(
      new FakeServiceError('DOCUMENT_NOT_FOUND'),
    )
    const session = await documents.open(request)
    documents.cancelNextExport(session.sessionId)

    await expect(documents.export(session.sessionId)).resolves.toBe('cancelled')
    await documents.close(session.sessionId)
    await expect(
      documents.export(session.sessionId as DocumentSessionId),
    ).rejects.toMatchObject({ code: 'DOCUMENT_SESSION_NOT_FOUND' })
  })

  it('retries the exact stored media request after a one-shot failure', async () => {
    const media = new FakeExternalMediaService()
    media.failNext(
      offlinePlaybackRequestFixture.requestId,
      'PLAYBACK_OFFLINE',
    )

    await expect(media.prepare(offlinePlaybackRequestFixture, {} as HTMLElement)).rejects.toMatchObject(
      { code: 'PLAYBACK_OFFLINE' },
    )
    await expect(
      media.retry(offlinePlaybackRequestFixture.requestId),
    ).resolves.toMatchObject({
      requestId: offlinePlaybackRequestFixture.requestId,
      playlistId: offlinePlaybackRequestFixture.playlistId,
      selectedVideoId: offlinePlaybackRequestFixture.videoId,
    })
    expect(media.retryCalls).toEqual([offlinePlaybackRequestFixture.requestId])
  })

  it('returns deterministic metadata', async () => {
    const metadata = new FakeAppMetadataService('2.0.0-test', 'web')
    expect(await metadata.getVersion()).toBe('2.0.0-test')
    expect(metadata.getPlatform()).toBe('web')
  })
})
