import type {
  DocumentId,
  DocumentKind,
  DocumentService,
  DocumentSession,
  DocumentSessionId,
  ElementId,
  RequestId,
  RequestKind,
  RequestTargetId,
  ScrollSnapshot,
  Unsubscribe,
} from '../domain/contracts'
import { PlatformServiceError } from './capacitor/capacitorAdapters'

export interface DocumentRequestEvent {
  readonly type: 'request-started' | 'request-succeeded' | 'request-failed'
  readonly requestId: RequestId
  readonly kind: Extract<RequestKind, 'document-open' | 'document-export'>
  readonly targetId: RequestTargetId
  readonly canonicalName: string
  readonly errorCode?: string
  readonly retryable?: boolean
}

export interface PresentationSnapshot {
  readonly scroll: ScrollSnapshot
  readonly focusTargetId?: ElementId
}

export interface PresentationEnvironment {
  capture(focusTargetId?: ElementId): PresentationSnapshot
  restore(snapshot: PresentationSnapshot): void
}

export interface OpenDocumentOptions {
  readonly documentId: DocumentId
  readonly kind: DocumentKind
  readonly canonicalName: string
  readonly focusTargetId?: ElementId
  /** Retain this identity when retrying the same failed open request. */
  readonly requestId?: RequestId
}

export interface ExportDocumentOptions {
  readonly sessionId: DocumentSessionId
  readonly canonicalName: string
  /** Retain this identity when retrying the same failed export request. */
  readonly requestId?: RequestId
}

const browserEnvironment: PresentationEnvironment = {
  capture(focusTargetId) {
    return {
      scroll: { x: window.scrollX, y: window.scrollY },
      ...(focusTargetId === undefined ? {} : { focusTargetId }),
    }
  },
  restore(snapshot) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(snapshot.scroll.x, snapshot.scroll.y)
        if (snapshot.focusTargetId) {
          document.getElementById(snapshot.focusTargetId)?.focus({
            preventScroll: true,
          })
        }
      })
    })
  },
}

const defaultRequestId = (): RequestId => {
  const generated = globalThis.crypto?.randomUUID?.()
  if (!generated) {
    throw new Error('A secure request ID generator is unavailable')
  }
  return generated as RequestId
}

const errorDetails = (
  error: unknown,
): { readonly code: string; readonly retryable: boolean } => {
  if (error instanceof PlatformServiceError) {
    return { code: error.code, retryable: error.retryable }
  }
  if (error instanceof Error && 'code' in error) {
    const code = (error as Error & { readonly code?: unknown }).code
    if (typeof code === 'string') return { code, retryable: true }
  }
  return { code: 'BRIDGE_UNAVAILABLE', retryable: true }
}

interface ActivePresentation {
  readonly session: DocumentSession
  readonly snapshot: PresentationSnapshot
  readonly canonicalName: string
}

/**
 * Keeps native PDFs as child presentations over the current React route. Native
 * share cancellation never closes or reopens the session, preserving PDF page
 * and zoom state. A matching dismissal restores the captured scroll and focus.
 */
export class DocumentPresentationCoordinator {
  private active?: ActivePresentation
  private readonly unsubscribeDismissed: Unsubscribe

  constructor(
    private readonly documents: DocumentService,
    private readonly onRequestEvent: (event: DocumentRequestEvent) => void,
    private readonly environment: PresentationEnvironment = browserEnvironment,
    private readonly createRequestId: () => RequestId = defaultRequestId,
  ) {
    this.unsubscribeDismissed = documents.subscribeDismissed((event) => {
      if (
        !this.active ||
        event.sessionId !== this.active.session.sessionId ||
        event.documentId !== this.active.session.documentId ||
        event.kind !== this.active.session.kind
      ) {
        return
      }
      const { snapshot } = this.active
      this.active = undefined
      this.environment.restore(snapshot)
    })
  }

  get activeSession(): DocumentSession | undefined {
    return this.active?.session
  }

  async open(options: OpenDocumentOptions): Promise<DocumentSession> {
    const requestId = options.requestId ?? this.createRequestId()
    const snapshot = this.environment.capture(options.focusTargetId)
    const identity = {
      requestId,
      kind: 'document-open' as const,
      targetId: options.documentId,
      canonicalName: options.canonicalName,
    }
    this.onRequestEvent({ type: 'request-started', ...identity })

    try {
      const session = await this.documents.open({
        requestId,
        documentId: options.documentId,
        kind: options.kind,
      })
      this.active = { session, snapshot, canonicalName: options.canonicalName }
      this.onRequestEvent({ type: 'request-succeeded', ...identity })
      return session
    } catch (error) {
      const details = errorDetails(error)
      this.onRequestEvent({
        type: 'request-failed',
        ...identity,
        errorCode: details.code,
        retryable: details.retryable,
      })
      throw error
    }
  }

  async export(
    options: ExportDocumentOptions,
  ): Promise<'completed' | 'cancelled'> {
    const requestId = options.requestId ?? this.createRequestId()
    const identity = {
      requestId,
      kind: 'document-export' as const,
      targetId: options.sessionId,
      canonicalName: options.canonicalName,
    }
    this.onRequestEvent({ type: 'request-started', ...identity })

    try {
      const result = await this.documents.export(options.sessionId)
      this.onRequestEvent({ type: 'request-succeeded', ...identity })
      return result
    } catch (error) {
      const details = errorDetails(error)
      this.onRequestEvent({
        type: 'request-failed',
        ...identity,
        errorCode: details.code,
        retryable: details.retryable,
      })
      throw error
    }
  }

  async openAndExport(
    options: OpenDocumentOptions,
  ): Promise<'completed' | 'cancelled'> {
    const session = await this.open(options)
    return this.export({
      sessionId: session.sessionId,
      canonicalName: options.canonicalName,
    })
  }

  dispose(): void {
    this.unsubscribeDismissed()
  }
}
