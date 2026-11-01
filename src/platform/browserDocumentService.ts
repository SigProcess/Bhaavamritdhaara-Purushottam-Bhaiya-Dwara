import type {
  DocumentId,
  DocumentRequest,
  DocumentService,
  DocumentSession,
  DocumentSessionId,
} from '../domain/contracts'

export class DocumentServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'DocumentServiceError'
  }
}

export interface BrowserDocumentRecord {
  readonly documentId: DocumentId
  readonly path: string
}

interface BrowserDocumentEnvironment {
  readonly locationHref?: string
  open(url: string, target: string): WindowProxy | null
  createDownload(): HTMLAnchorElement
}

const defaultEnvironment = (): BrowserDocumentEnvironment | undefined => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return undefined
  return {
    locationHref: window.location.href,
    open: (url, target) => window.open(url, target),
    createDownload: () => {
      const link = document.createElement('a')
      document.body.appendChild(link)
      return link
    },
  }
}

interface ResolvedBrowserDocument extends BrowserDocumentRecord {
  readonly url: string
}

/**
 * Same-origin web fallback for the ID-only document boundary. The component
 * never passes a file path to open or export; only this adapter resolves IDs.
 */
export function createBrowserDocumentService(
  records: readonly BrowserDocumentRecord[],
  environment: BrowserDocumentEnvironment | undefined = defaultEnvironment(),
): DocumentService {
  const paths = new Map(records.map(({ documentId, path }) => [documentId, path]))
  const sessions = new Map<DocumentSessionId, ResolvedBrowserDocument>()
  let sessionSequence = 0

  const resolve = (documentId: DocumentId): ResolvedBrowserDocument => {
    const path = paths.get(documentId)
    if (!path) {
      throw new DocumentServiceError(
        'DOCUMENT_NOT_FOUND',
        `No document is registered for catalog ID ${documentId}.`,
      )
    }
    if (!environment?.locationHref) {
      throw new DocumentServiceError(
        'BRIDGE_UNAVAILABLE',
        'Browser document presentation is unavailable in this environment.',
      )
    }

    let documentUrl: URL
    let pageUrl: URL
    try {
      pageUrl = new URL(environment.locationHref)
      documentUrl = new URL(path, pageUrl)
    } catch {
      throw new DocumentServiceError(
        'DOCUMENT_INVALID',
        'The catalog document URL is invalid.',
      )
    }
    if (
      documentUrl.origin !== pageUrl.origin ||
      (documentUrl.protocol !== 'https:' && documentUrl.protocol !== 'http:')
    ) {
      throw new DocumentServiceError(
        'DOCUMENT_INVALID',
        'Browser documents must use a same-origin HTTP URL.',
      )
    }
    return { documentId, path, url: documentUrl.href }
  }

  return {
    async open(request: DocumentRequest): Promise<DocumentSession> {
      const record = resolve(request.documentId)
      const opened = environment?.open(record.url, '_blank')
      if (!opened) {
        throw new DocumentServiceError(
          'DOCUMENT_PRESENTATION_FAILED',
          'The document could not be opened.',
        )
      }
      opened.opener = null

      const sessionId = `web-document-${++sessionSequence}` as DocumentSessionId
      sessions.set(sessionId, record)
      return {
        sessionId,
        documentId: request.documentId,
        kind: request.kind,
      }
    },

    async export(sessionId: DocumentSessionId): Promise<'completed'> {
      const record = sessions.get(sessionId)
      if (!record) {
        throw new DocumentServiceError(
          'EXPORT_SESSION_NOT_ACTIVE',
          'The selected document is no longer active.',
        )
      }
      if (!environment) {
        throw new DocumentServiceError(
          'BRIDGE_UNAVAILABLE',
          'Browser download is unavailable in this environment.',
        )
      }

      const link = environment.createDownload()
      link.href = record.url
      link.download = ''
      link.rel = 'noreferrer'
      link.click()
      link.remove()
      return 'completed'
    },

    async close(sessionId: DocumentSessionId): Promise<void> {
      if (!sessions.delete(sessionId)) {
        throw new DocumentServiceError(
          'DOCUMENT_SESSION_NOT_FOUND',
          'The selected document session was not found.',
        )
      }
    },

    subscribeDismissed(): () => void {
      // Browser tabs do not expose a reliable cross-window dismissal event.
      return () => undefined
    },
  }
}
