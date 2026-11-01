import { describe, expect, it, vi } from 'vitest'
import type { DocumentId, RequestId } from '../domain/contracts'
import { createBrowserDocumentService } from './browserDocumentService'

const request = {
  requestId: 'request-1' as RequestId,
  documentId: 'book:one' as DocumentId,
  kind: 'book' as const,
}

describe('createBrowserDocumentService', () => {
  it('opens and downloads only registered same-origin documents', async () => {
    const opened = { opener: {} }
    const link = {
      href: '',
      download: 'unset',
      rel: '',
      click: vi.fn(),
      remove: vi.fn(),
    }
    const environment = {
      locationHref: 'https://example.test/app/',
      open: vi.fn(() => opened as unknown as WindowProxy),
      createDownload: vi.fn(() => link as unknown as HTMLAnchorElement),
    }
    const service = createBrowserDocumentService(
      [{ documentId: request.documentId, path: '/books/one.pdf' }],
      environment,
    )

    const session = await service.open(request)
    expect(environment.open).toHaveBeenCalledWith(
      'https://example.test/books/one.pdf',
      '_blank',
    )
    expect(opened.opener).toBeNull()

    await expect(service.export(session.sessionId)).resolves.toBe('completed')
    expect(link.href).toBe('https://example.test/books/one.pdf')
    expect(link.click).toHaveBeenCalledOnce()
  })

  it('rejects cross-origin catalog paths before opening a window', async () => {
    const environment = {
      locationHref: 'https://example.test/',
      open: vi.fn(() => ({ opener: null }) as unknown as WindowProxy),
      createDownload: vi.fn(),
    }
    const service = createBrowserDocumentService(
      [{ documentId: request.documentId, path: 'https://other.test/one.pdf' }],
      environment,
    )

    await expect(service.open(request)).rejects.toMatchObject({
      code: 'DOCUMENT_INVALID',
    })
    expect(environment.open).not.toHaveBeenCalled()
  })

  it('fails safely when browser APIs are unavailable', async () => {
    const service = createBrowserDocumentService([
      { documentId: request.documentId, path: '/books/one.pdf' },
    ], undefined)
    await expect(service.open(request)).rejects.toMatchObject({
      code: 'BRIDGE_UNAVAILABLE',
    })
  })
})
