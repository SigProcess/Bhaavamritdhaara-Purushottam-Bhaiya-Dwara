import type {
  AppMetadataService,
  AppPlatform,
  DocumentId,
  DocumentDismissedEvent,
  DocumentRequest,
  DocumentService,
  DocumentSession,
  DocumentSessionId,
  ExternalMediaOpenRequest,
  ExternalMediaPlayerState,
  ExternalMediaService,
  NetworkService,
  NetworkStatus,
  PlaybackRequest,
  PlaybackRequestId,
  PlayerHandle,
} from '../../domain/contracts'

export class FakeServiceError extends Error {
  constructor(readonly code: string) {
    super(code)
    this.name = 'FakeServiceError'
  }
}

export class FakeDocumentService implements DocumentService {
  readonly openCalls: DocumentRequest[] = []
  readonly exportCalls: DocumentSessionId[] = []
  readonly closeCalls: DocumentSessionId[] = []
  private readonly sessions = new Map<DocumentSessionId, DocumentSession>()
  private readonly nextOpenFailures = new Map<DocumentId, string>()
  private readonly nextExportFailures = new Map<DocumentSessionId, string>()
  private readonly nextExportResults = new Map<
    DocumentSessionId,
    'completed' | 'cancelled'
  >()
  private readonly dismissedListeners = new Set<
    (event: DocumentDismissedEvent) => void
  >()
  private sessionSequence = 0

  failNextOpen(documentId: DocumentId, errorCode: string): void {
    this.nextOpenFailures.set(documentId, errorCode)
  }

  failNextExport(sessionId: DocumentSessionId, errorCode: string): void {
    this.nextExportFailures.set(sessionId, errorCode)
  }

  cancelNextExport(sessionId: DocumentSessionId): void {
    this.nextExportResults.set(sessionId, 'cancelled')
  }

  async open(request: DocumentRequest): Promise<DocumentSession> {
    this.openCalls.push(structuredClone(request))
    const errorCode = this.nextOpenFailures.get(request.documentId)
    if (errorCode) {
      this.nextOpenFailures.delete(request.documentId)
      throw new FakeServiceError(errorCode)
    }

    const session: DocumentSession = {
      sessionId: `fixture-session-${++this.sessionSequence}` as DocumentSessionId,
      documentId: request.documentId,
      kind: request.kind,
    }
    this.sessions.set(session.sessionId, session)
    return session
  }

  async export(
    sessionId: DocumentSessionId,
  ): Promise<'completed' | 'cancelled'> {
    this.exportCalls.push(sessionId)
    if (!this.sessions.has(sessionId)) {
      throw new FakeServiceError('DOCUMENT_SESSION_NOT_FOUND')
    }

    const errorCode = this.nextExportFailures.get(sessionId)
    if (errorCode) {
      this.nextExportFailures.delete(sessionId)
      throw new FakeServiceError(errorCode)
    }

    const result = this.nextExportResults.get(sessionId) ?? 'completed'
    this.nextExportResults.delete(sessionId)
    return result
  }

  async close(sessionId: DocumentSessionId): Promise<void> {
    this.closeCalls.push(sessionId)
    const session = this.sessions.get(sessionId)
    if (!session || !this.sessions.delete(sessionId)) {
      throw new FakeServiceError('DOCUMENT_SESSION_NOT_FOUND')
    }
    this.emitDismissed(session)
  }

  subscribeDismissed(
    listener: (event: DocumentDismissedEvent) => void,
  ): () => void {
    this.dismissedListeners.add(listener)
    return () => this.dismissedListeners.delete(listener)
  }

  dismiss(sessionId: DocumentSessionId): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.sessions.delete(sessionId)
    this.emitDismissed(session)
  }

  private emitDismissed(session: DocumentSession): void {
    for (const listener of this.dismissedListeners) listener(session)
  }
}

export class FakeNetworkService implements NetworkService {
  private readonly listeners = new Set<(status: NetworkStatus) => void>()

  constructor(private status: NetworkStatus = 'online') {}

  async currentStatus(): Promise<NetworkStatus> {
    return this.status
  }

  subscribe(listener: (status: NetworkStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setStatus(status: NetworkStatus): void {
    if (status === this.status) return
    this.status = status
    for (const listener of this.listeners) listener(status)
  }
}

export class FakeAppMetadataService implements AppMetadataService {
  constructor(
    private readonly version = '1.0.0-test',
    private readonly platform: AppPlatform = 'ios',
  ) {}

  async getVersion(): Promise<string> {
    return this.version
  }

  getPlatform(): AppPlatform {
    return this.platform
  }
}

export class FakePlayerHandle implements PlayerHandle {
  readonly playCalls: undefined[] = []
  readonly seekCalls: number[] = []
  readonly fullscreenCalls: undefined[] = []
  readonly disposeCalls: undefined[] = []
  private readonly listeners = new Set<(state: ExternalMediaPlayerState) => void>()

  constructor(
    readonly requestId: PlaybackRequestId,
    readonly playlistId: PlaybackRequest['playlistId'],
    readonly selectedVideoId?: PlaybackRequest['videoId'],
    readonly startsAutomatically: boolean = true,
    private positionSeconds = 0,
    private fullscreenAvailable = true,
  ) {}

  play(): void {
    this.playCalls.push(undefined)
  }

  getCurrentTime(): number {
    return this.positionSeconds
  }

  seekTo(positionSeconds: number): void {
    this.positionSeconds = positionSeconds
    this.seekCalls.push(positionSeconds)
  }

  subscribeState(listener: (state: ExternalMediaPlayerState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  supportsFullscreen(): boolean {
    return this.fullscreenAvailable
  }

  setFullscreenAvailable(available: boolean): void {
    this.fullscreenAvailable = available
  }

  async enterFullscreen(): Promise<void> {
    this.fullscreenCalls.push(undefined)
  }

  dispose(): void {
    this.disposeCalls.push(undefined)
    this.listeners.clear()
  }

  emit(state: ExternalMediaPlayerState): void {
    for (const listener of this.listeners) listener(state)
  }
}

export class FakeExternalMediaService implements ExternalMediaService {
  readonly prepareCalls: PlaybackRequest[] = []
  readonly prepareTargets: HTMLElement[] = []
  readonly retryCalls: PlaybackRequestId[] = []
  readonly externalOpenCalls: ExternalMediaOpenRequest[] = []
  readonly handles: FakePlayerHandle[] = []
  private readonly requests = new Map<PlaybackRequestId, PlaybackRequest>()
  private readonly nextFailures = new Map<PlaybackRequestId, string>()
  private nextFailure: string | undefined
  private stalled = false

  constructor(private readonly startsAutomatically = true) {}

  failNextRequest(errorCode: string): void {
    this.nextFailure = errorCode
  }

  failNext(requestId: PlaybackRequestId, errorCode: string): void {
    this.nextFailures.set(requestId, errorCode)
  }

  /** Reproduces a player that never reports readiness, so no handle appears. */
  stallNextRequest(): void {
    this.stalled = true
  }

  async prepare(request: PlaybackRequest, target: HTMLElement): Promise<PlayerHandle> {
    this.prepareCalls.push(structuredClone(request))
    this.prepareTargets.push(target)
    this.requests.set(request.requestId, request)
    return this.resolve(request)
  }

  async retry(requestId: PlaybackRequestId): Promise<PlayerHandle> {
    this.retryCalls.push(requestId)
    const request = this.requests.get(requestId)
    if (!request) throw new FakeServiceError('PLAYBACK_REQUEST_NOT_FOUND')
    return this.resolve(request)
  }

  async openExternally(request: ExternalMediaOpenRequest): Promise<void> {
    this.externalOpenCalls.push(structuredClone(request))
  }

  private async resolve(request: PlaybackRequest): Promise<PlayerHandle> {
    const errorCode = this.nextFailures.get(request.requestId) ?? this.nextFailure
    if (errorCode) {
      this.nextFailures.delete(request.requestId)
      this.nextFailure = undefined
      throw new FakeServiceError(errorCode)
    }
    if (this.stalled) {
      this.stalled = false
      return new Promise<PlayerHandle>(() => {})
    }
    const handle = new FakePlayerHandle(
      request.requestId,
      request.playlistId,
      request.videoId,
      this.startsAutomatically,
    )
    this.handles.push(handle)
    return handle
  }
}
