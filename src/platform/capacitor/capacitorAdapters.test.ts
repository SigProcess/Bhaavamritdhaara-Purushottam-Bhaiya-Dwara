import { describe, expect, it, vi } from 'vitest'
import type {
  DocumentId,
  DocumentSessionId,
  RequestId,
} from '../../domain/contracts'
import {
  CapacitorAppMetadataService,
  CapacitorDocumentService,
  CapacitorLifecycleService,
  CapacitorNetworkService,
  PlatformServiceError,
} from './capacitorAdapters'

const request = {
  requestId: 'request-1' as RequestId,
  documentId: 'book:one' as DocumentId,
  kind: 'book' as const,
}
const sessionId = 'session-1' as DocumentSessionId

const listenerHandle = () => ({ remove: vi.fn(async () => undefined) })

describe('CapacitorDocumentService', () => {
  it('validates echoed request identity and maps a typed session', async () => {
    const documentPlugin = {
      open: vi.fn(async () => ({ ...request, sessionId })),
      close: vi.fn(async () => ({ sessionId })),
      addListener: vi.fn(async () => listenerHandle()),
    }
    const sharePlugin = {
      exportDocument: vi.fn(async () => ({ status: 'cancelled', sessionId })),
    }
    const service = new CapacitorDocumentService(documentPlugin, sharePlugin)

    await expect(service.open(request)).resolves.toEqual({
      sessionId,
      documentId: request.documentId,
      kind: 'book',
    })
    await expect(service.export(sessionId)).resolves.toBe('cancelled')
    expect(documentPlugin.open).toHaveBeenCalledWith(request)
  })

  it('attaches the originating request ID to mapped native failures', async () => {
    const nativeFailure = Object.assign(new Error('native detail'), {
      code: 'DOCUMENT_NOT_FOUND',
    })
    const service = new CapacitorDocumentService(
      {
        open: vi.fn(async () => Promise.reject(nativeFailure)),
        close: vi.fn(),
        addListener: vi.fn(async () => listenerHandle()),
      },
      { exportDocument: vi.fn() },
    )

    const error = await service.open(request).catch((caught) => caught)
    expect(error).toBeInstanceOf(PlatformServiceError)
    expect(error).toMatchObject({
      code: 'DOCUMENT_NOT_FOUND',
      nativeCode: 'DOCUMENT_NOT_FOUND',
      requestId: request.requestId,
    })
  })

  it('maps share failure identity and retryability without treating cancellation as failure', async () => {
    const service = new CapacitorDocumentService(
      {
        open: vi.fn(),
        close: vi.fn(),
        addListener: vi.fn(async () => listenerHandle()),
      },
      {
        exportDocument: vi.fn(async () =>
          Promise.reject(
            Object.assign(new Error('native detail'), {
              code: 'EXPORT_ACTIVITY_FAILED',
              data: { retryable: true, sessionId },
            }),
          ),
        ),
      },
    )

    const error = await service.export(sessionId).catch((caught) => caught)
    expect(error).toMatchObject({
      code: 'EXPORT_FAILED',
      nativeCode: 'EXPORT_ACTIVITY_FAILED',
      sessionId,
      retryable: true,
    })
  })

  it('forwards only valid dismissal events and removes the native listener', async () => {
    let nativeListener: ((event: unknown) => void) | undefined
    const handle = listenerHandle()
    const service = new CapacitorDocumentService(
      {
        open: vi.fn(),
        close: vi.fn(),
        addListener: vi.fn(async (_name, listener) => {
          nativeListener = listener
          return handle
        }),
      },
      { exportDocument: vi.fn() },
    )
    const listener = vi.fn()
    const unsubscribe = service.subscribeDismissed(listener)
    await Promise.resolve()

    nativeListener?.({ nope: true })
    nativeListener?.({
      sessionId,
      documentId: request.documentId,
      kind: 'book',
    })
    expect(listener).toHaveBeenCalledOnce()

    unsubscribe()
    expect(handle.remove).toHaveBeenCalledOnce()
  })
})

describe('LifecycleNetwork adapters', () => {
  const plugin = {
    getNetworkStatus: vi.fn(async () => ({ status: 'online' })),
    getLifecycleState: vi.fn(async () => ({ state: 'foreground' })),
    getPlatform: vi.fn(async () => ({ platform: 'ios' })),
    getVersion: vi.fn(async () => ({ version: '1.2.3' })),
    addListener: vi.fn(async () => listenerHandle()),
  }

  it('maps native lifecycle, network, platform, and version values', async () => {
    await expect(new CapacitorNetworkService(plugin).currentStatus()).resolves.toBe(
      'online',
    )
    await expect(new CapacitorLifecycleService(plugin).currentState()).resolves.toBe(
      'active',
    )
    const metadata = new CapacitorAppMetadataService(plugin)
    await expect(metadata.getVersion()).resolves.toBe('1.2.3')
    expect(metadata.getPlatform()).toBe('ios')
  })

  it('rejects unknown synchronous state values instead of casting them', async () => {
    const invalidPlugin = {
      ...plugin,
      getNetworkStatus: vi.fn(async () => ({ status: 'maybe' })),
      getLifecycleState: vi.fn(async () => ({ state: 'suspended' })),
    }
    await expect(
      new CapacitorNetworkService(invalidPlugin).currentStatus(),
    ).rejects.toMatchObject({ code: 'BRIDGE_UNAVAILABLE' })
    await expect(
      new CapacitorLifecycleService(invalidPlugin).currentState(),
    ).rejects.toMatchObject({ code: 'BRIDGE_UNAVAILABLE' })
  })
})
