import { describe, expect, it, vi } from 'vitest'
import type {
  DocumentId,
  DocumentSessionId,
  ElementId,
  RequestId,
} from '../domain/contracts'
import { FakeDocumentService } from '../test-support/fakes/platformServices'
import {
  DocumentPresentationCoordinator,
  type PresentationEnvironment,
} from './documentPresentationCoordinator'

const documentId = 'bhajan:आरती.pdf' as DocumentId
const focusTargetId = 'open-bhajan' as ElementId
const requestIds = ['open-request', 'export-request'].map(
  (value) => value as RequestId,
)

describe('DocumentPresentationCoordinator', () => {
  it('preserves the route snapshot and restores it only after matching dismissal', async () => {
    const documents = new FakeDocumentService()
    const events = vi.fn()
    const environment: PresentationEnvironment = {
      capture: vi.fn(() => ({
        scroll: { x: 12, y: 480 },
        focusTargetId,
      })),
      restore: vi.fn(),
    }
    const coordinator = new DocumentPresentationCoordinator(
      documents,
      events,
      environment,
      () => requestIds[0],
    )

    const session = await coordinator.open({
      documentId,
      kind: 'bhajan',
      canonicalName: 'आरती',
      focusTargetId,
    })
    documents.dismiss('stale-session' as DocumentSessionId)
    expect(environment.restore).not.toHaveBeenCalled()

    documents.dismiss(session.sessionId)
    expect(environment.restore).toHaveBeenCalledWith({
      scroll: { x: 12, y: 480 },
      focusTargetId,
    })
    expect(coordinator.activeSession).toBeUndefined()
    expect(events).toHaveBeenNthCalledWith(1, {
      type: 'request-started',
      requestId: requestIds[0],
      kind: 'document-open',
      targetId: documentId,
      canonicalName: 'आरती',
    })
    expect(events).toHaveBeenNthCalledWith(2, {
      type: 'request-succeeded',
      requestId: requestIds[0],
      kind: 'document-open',
      targetId: documentId,
      canonicalName: 'आरती',
    })
  })

  it('treats cancelled share as success and retains the same document session', async () => {
    const documents = new FakeDocumentService()
    const events = vi.fn()
    let sequence = 0
    const coordinator = new DocumentPresentationCoordinator(
      documents,
      events,
      { capture: () => ({ scroll: { x: 0, y: 20 } }), restore: vi.fn() },
      () => requestIds[sequence++],
    )
    const session = await coordinator.open({
      documentId,
      kind: 'bhajan',
      canonicalName: 'आरती',
    })
    documents.cancelNextExport(session.sessionId)

    await expect(
      coordinator.export({
        sessionId: session.sessionId,
        canonicalName: 'आरती',
      }),
    ).resolves.toBe('cancelled')
    expect(coordinator.activeSession).toEqual(session)
    expect(documents.closeCalls).toEqual([])
    expect(events).toHaveBeenLastCalledWith({
      type: 'request-succeeded',
      requestId: requestIds[1],
      kind: 'document-export',
      targetId: session.sessionId,
      canonicalName: 'आरती',
    })
  })

  it('retains an explicit request ID for a retry of the same canonical target', async () => {
    const documents = new FakeDocumentService()
    const events = vi.fn()
    documents.failNextOpen(documentId, 'DOCUMENT_NOT_FOUND')
    const coordinator = new DocumentPresentationCoordinator(
      documents,
      events,
      { capture: () => ({ scroll: { x: 0, y: 0 } }), restore: vi.fn() },
      () => requestIds[0],
    )
    const options = {
      documentId,
      kind: 'bhajan' as const,
      canonicalName: 'आरती',
      requestId: requestIds[0],
    }

    await expect(coordinator.open(options)).rejects.toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
    })
    await expect(coordinator.open(options)).resolves.toMatchObject({ documentId })
    expect(documents.openCalls.map((call) => call.requestId)).toEqual([
      requestIds[0],
      requestIds[0],
    ])
    expect(events).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'request-failed',
        requestId: requestIds[0],
        targetId: documentId,
        canonicalName: 'आरती',
      }),
    )
  })
})
