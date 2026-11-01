import {
  registerPlugin,
  type PluginListenerHandle,
} from '@capacitor/core'
import type {
  AppMetadataService,
  AppPlatform,
  DocumentDismissedEvent,
  DocumentKind,
  DocumentRequest,
  DocumentService,
  DocumentSession,
  DocumentSessionId,
  LifecycleService,
  LifecycleState,
  NetworkService,
  NetworkStatus,
  RequestId,
  Unsubscribe,
} from '../../domain/contracts'

interface DocumentPlugin {
  open(request: DocumentRequest): Promise<unknown>
  close(options: { readonly sessionId: DocumentSessionId }): Promise<unknown>
  addListener(
    eventName: 'documentDismissed',
    listener: (event: unknown) => void,
  ): Promise<PluginListenerHandle>
}

interface SharePlugin {
  exportDocument(options: {
    readonly sessionId: DocumentSessionId
  }): Promise<unknown>
}

interface LifecycleNetworkPlugin {
  getNetworkStatus(): Promise<unknown>
  getLifecycleState(): Promise<unknown>
  getPlatform(): Promise<unknown>
  getVersion(): Promise<unknown>
  addListener(
    eventName: 'networkStatusChanged' | 'appStateChanged',
    listener: (event: unknown) => void,
  ): Promise<PluginListenerHandle>
}

const NativeDocument = registerPlugin<DocumentPlugin>('Document')
const NativeShare = registerPlugin<SharePlugin>('BhaavamritShare')
const NativeLifecycleNetwork =
  registerPlugin<LifecycleNetworkPlugin>('LifecycleNetwork')

export type PlatformServiceErrorCode =
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_INVALID'
  | 'DOCUMENT_SESSION_NOT_FOUND'
  | 'EXPORT_FAILED'
  | 'BRIDGE_UNAVAILABLE'
  | 'APP_METADATA_INVALID'

export class PlatformServiceError extends Error {
  constructor(
    readonly code: PlatformServiceErrorCode,
    readonly nativeCode: string,
    options: {
      readonly requestId?: RequestId
      readonly sessionId?: DocumentSessionId
      readonly retryable?: boolean
      readonly cause?: unknown
    } = {},
  ) {
    super(code, { cause: options.cause })
    this.name = 'PlatformServiceError'
    this.requestId = options.requestId
    this.sessionId = options.sessionId
    this.retryable = options.retryable ?? false
  }

  readonly requestId?: RequestId
  readonly sessionId?: DocumentSessionId
  readonly retryable: boolean
}

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null

const stringField = (value: unknown, field: string): string | undefined =>
  isRecord(value) && typeof value[field] === 'string'
    ? value[field]
    : undefined

const bridgeCode = (error: unknown): string =>
  stringField(error, 'code') ?? 'BRIDGE_UNAVAILABLE'

const bridgeData = (error: unknown): UnknownRecord | undefined => {
  if (!isRecord(error)) return undefined
  return isRecord(error.data) ? error.data : undefined
}

const mapDocumentCode = (nativeCode: string): PlatformServiceErrorCode => {
  if (nativeCode === 'DOCUMENT_NOT_FOUND') return 'DOCUMENT_NOT_FOUND'
  if (nativeCode === 'DOCUMENT_SESSION_NOT_FOUND') {
    return 'DOCUMENT_SESSION_NOT_FOUND'
  }
  if (
    nativeCode.startsWith('DOCUMENT_') &&
    nativeCode !== 'DOCUMENT_PRESENTATION_FAILED'
  ) {
    return 'DOCUMENT_INVALID'
  }
  return 'BRIDGE_UNAVAILABLE'
}

const asDocumentError = (
  error: unknown,
  identity: { readonly requestId?: RequestId; readonly sessionId?: DocumentSessionId },
): PlatformServiceError => {
  if (error instanceof PlatformServiceError) return error
  const nativeCode = bridgeCode(error)
  return new PlatformServiceError(mapDocumentCode(nativeCode), nativeCode, {
    ...identity,
    retryable: nativeCode !== 'DOCUMENT_REQUEST_INVALID',
    cause: error,
  })
}

const asExportError = (
  error: unknown,
  sessionId: DocumentSessionId,
): PlatformServiceError => {
  if (error instanceof PlatformServiceError) return error
  const data = bridgeData(error)
  const nativeCode = bridgeCode(error)
  return new PlatformServiceError('EXPORT_FAILED', nativeCode, {
    sessionId,
    retryable: data?.retryable === true,
    cause: error,
  })
}

const isDocumentKind = (value: string | undefined): value is DocumentKind =>
  value === 'bhajan' || value === 'book'

const invalidBridgeResult = (
  nativeCode: string,
  identity: { readonly requestId?: RequestId; readonly sessionId?: DocumentSessionId } = {},
): PlatformServiceError =>
  new PlatformServiceError('BRIDGE_UNAVAILABLE', nativeCode, identity)

function parseSession(value: unknown, request: DocumentRequest): DocumentSession {
  const requestId = stringField(value, 'requestId')
  const sessionId = stringField(value, 'sessionId')
  const documentId = stringField(value, 'documentId')
  const kind = stringField(value, 'kind')
  if (
    requestId !== request.requestId ||
    !sessionId ||
    documentId !== request.documentId ||
    kind !== request.kind ||
    !isDocumentKind(kind)
  ) {
    throw invalidBridgeResult('BRIDGE_RESULT_INVALID', {
      requestId: request.requestId,
    })
  }
  return {
    sessionId: sessionId as DocumentSessionId,
    documentId: request.documentId,
    kind,
  }
}

function parseDismissed(value: unknown): DocumentDismissedEvent | undefined {
  const sessionId = stringField(value, 'sessionId')
  const documentId = stringField(value, 'documentId')
  const kind = stringField(value, 'kind')
  if (!sessionId || !documentId || !isDocumentKind(kind)) return undefined
  return {
    sessionId: sessionId as DocumentSessionId,
    documentId: documentId as DocumentDismissedEvent['documentId'],
    kind,
  }
}

function subscribeNative(
  subscribe: () => Promise<PluginListenerHandle>,
): Unsubscribe {
  let removed = false
  let handle: PluginListenerHandle | undefined
  void subscribe()
    .then((registered) => {
      handle = registered
      if (removed) void registered.remove()
    })
    .catch(() => undefined)
  return () => {
    removed = true
    if (handle) void handle.remove()
  }
}

export class CapacitorDocumentService implements DocumentService {
  constructor(
    private readonly documentPlugin: DocumentPlugin = NativeDocument,
    private readonly sharePlugin: SharePlugin = NativeShare,
  ) {}

  async open(request: DocumentRequest): Promise<DocumentSession> {
    try {
      return parseSession(await this.documentPlugin.open(request), request)
    } catch (error) {
      throw asDocumentError(error, { requestId: request.requestId })
    }
  }

  async export(
    sessionId: DocumentSessionId,
  ): Promise<'completed' | 'cancelled'> {
    try {
      const result = await this.sharePlugin.exportDocument({ sessionId })
      const echoedSessionId = stringField(result, 'sessionId')
      const status = stringField(result, 'status')
      if (
        echoedSessionId !== sessionId ||
        (status !== 'completed' && status !== 'cancelled')
      ) {
        throw invalidBridgeResult('BRIDGE_RESULT_INVALID', { sessionId })
      }
      return status
    } catch (error) {
      throw asExportError(error, sessionId)
    }
  }

  async close(sessionId: DocumentSessionId): Promise<void> {
    try {
      const result = await this.documentPlugin.close({ sessionId })
      if (stringField(result, 'sessionId') !== sessionId) {
        throw invalidBridgeResult('BRIDGE_RESULT_INVALID', { sessionId })
      }
    } catch (error) {
      throw asDocumentError(error, { sessionId })
    }
  }

  subscribeDismissed(
    listener: (event: DocumentDismissedEvent) => void,
  ): Unsubscribe {
    return subscribeNative(() =>
      this.documentPlugin.addListener('documentDismissed', (value) => {
        const event = parseDismissed(value)
        if (event) listener(event)
      }),
    )
  }
}

const parseNetworkStatus = (value: unknown): NetworkStatus => {
  const status = stringField(value, 'status')
  if (status === 'online' || status === 'offline' || status === 'unknown') {
    return status
  }
  throw invalidBridgeResult('NETWORK_RESULT_INVALID')
}

const parseLifecycleState = (value: unknown): LifecycleState => {
  const state = stringField(value, 'state')
  if (state === 'foreground' || state === 'active') return 'active'
  if (state === 'background') return 'background'
  throw invalidBridgeResult('LIFECYCLE_RESULT_INVALID')
}

export class CapacitorNetworkService implements NetworkService {
  constructor(private readonly plugin: LifecycleNetworkPlugin = NativeLifecycleNetwork) {}

  async currentStatus(): Promise<NetworkStatus> {
    try {
      return parseNetworkStatus(await this.plugin.getNetworkStatus())
    } catch (error) {
      if (error instanceof PlatformServiceError) throw error
      throw invalidBridgeResult(bridgeCode(error))
    }
  }

  subscribe(listener: (status: NetworkStatus) => void): Unsubscribe {
    return subscribeNative(() =>
      this.plugin.addListener('networkStatusChanged', (value) => {
        try {
          listener(parseNetworkStatus(value))
        } catch {
          // Ignore malformed asynchronous events and retain the last valid state.
        }
      }),
    )
  }
}

export class CapacitorLifecycleService implements LifecycleService {
  constructor(private readonly plugin: LifecycleNetworkPlugin = NativeLifecycleNetwork) {}

  async currentState(): Promise<LifecycleState> {
    try {
      return parseLifecycleState(await this.plugin.getLifecycleState())
    } catch (error) {
      if (error instanceof PlatformServiceError) throw error
      throw invalidBridgeResult(bridgeCode(error))
    }
  }

  subscribe(listener: (state: LifecycleState) => void): Unsubscribe {
    return subscribeNative(() =>
      this.plugin.addListener('appStateChanged', (value) => {
        try {
          listener(parseLifecycleState(value))
        } catch {
          // Ignore malformed asynchronous events and retain the last valid state.
        }
      }),
    )
  }
}

export class CapacitorAppMetadataService implements AppMetadataService {
  constructor(private readonly plugin: LifecycleNetworkPlugin = NativeLifecycleNetwork) {}

  async getVersion(): Promise<string> {
    try {
      const result = await this.plugin.getVersion()
      const version = stringField(result, 'version')?.trim()
      if (!version || version.length > 64) {
        throw new PlatformServiceError(
          'APP_METADATA_INVALID',
          'APP_METADATA_INVALID',
        )
      }
      return version
    } catch (error) {
      if (error instanceof PlatformServiceError) throw error
      throw new PlatformServiceError(
        'APP_METADATA_INVALID',
        bridgeCode(error),
        { cause: error },
      )
    }
  }

  getPlatform(): AppPlatform {
    return 'ios'
  }
}
