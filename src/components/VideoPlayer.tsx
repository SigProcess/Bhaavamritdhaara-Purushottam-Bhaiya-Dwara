import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type {
  AppState,
  AssetRef,
  Catalog,
  ExternalMediaService,
  NetworkService,
  NetworkStatus,
  PlaybackRequest,
  PlaybackRequestId,
  PlayerHandle,
  PlayerState,
  PlaylistRecord,
  RequestState,
  VideoId,
} from '../domain/contracts'
import {
  initializePlayer,
  playerReducer,
  type PlayerAction,
} from '../domain/player/playerReducer'
import {
  reduceRequestRegistry,
  type RequestRegistryAction,
} from '../domain/requests/requestRegistry'
import { BrowserNetworkService } from '../platform/browserNetworkService'
import { YouTubeIframeExternalMediaService } from '../platform/youtubeIframeExternalMediaService'
import './VideoPlayer.css'

const PLAYING_DEADLINE_MS = 30_000
const PLAYBACK_TIMEOUT = 'PLAYBACK_TIMEOUT'
const PLAYBACK_OFFLINE = 'PLAYBACK_OFFLINE'
const PLAYBACK_SERVICE_ERROR = 'PLAYBACK_SERVICE_ERROR'
let requestSequence = 0

const nextPlaybackRequestId = (): PlaybackRequestId =>
  `playback-${Date.now()}-${++requestSequence}` as PlaybackRequestId

function assetPath(catalog: Catalog, reference: AssetRef): string | undefined {
  const asset = catalog.assets.find(({ id }) => id === reference.assetId)
  if (!asset) return undefined
  if (asset.availability === 'remote' || asset.path.startsWith('/')) return asset.path
  return `/${asset.path}`
}

function reducePlayer(state: PlayerState, action: PlayerAction): PlayerState {
  return playerReducer(state, action) ?? state
}

function createRegistryState(
  catalog: Catalog,
  playlist: PlaylistRecord,
  network: NetworkStatus = 'unknown',
): AppState {
  return {
    catalog: { active: catalog, source: 'packaged' },
    navigation: [{ route: { kind: 'home' }, scroll: { x: 0, y: 0 } }],
    bhajanFinder: { rawQuery: '', showAll: false },
    player: initializePlayer(playlist),
    requests: {},
    network,
  }
}

export interface VideoPlayerProps {
  readonly catalog: Catalog
  readonly playlist: PlaylistRecord
  readonly onClose: () => void
  readonly mediaService?: ExternalMediaService
  readonly networkService?: NetworkService
}

export default function VideoPlayer({
  catalog,
  playlist,
  onClose,
  mediaService,
  networkService,
}: VideoPlayerProps) {
  const service = useMemo(
    () => mediaService ?? new YouTubeIframeExternalMediaService(catalog),
    [catalog, mediaService],
  )
  const network = useMemo(
    () => networkService ?? new BrowserNetworkService(),
    [networkService],
  )
  const [state, dispatch] = useReducer(reducePlayer, playlist, initializePlayer)
  const [registryState, setRegistryState] = useState<AppState>(() =>
    createRegistryState(catalog, playlist),
  )
  const registryRef = useRef(registryState)
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false)
  const [awaitingPlayTap, setAwaitingPlayTap] = useState(false)
  const mountRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<PlayerHandle | undefined>(undefined)
  const activeRequestRef = useRef<PlaybackRequest | undefined>(undefined)
  const preparedRequestIdsRef = useRef(new Set<PlaybackRequestId>())
  const unsubscribeRef = useRef<(() => void) | undefined>(undefined)
  const deadlineRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const operationRef = useRef(0)

  const applyRegistryAction = useCallback((action: RequestRegistryAction) => {
    const transition = reduceRequestRegistry(registryRef.current, action)
    registryRef.current = transition.state
    setRegistryState(transition.state)
    return transition.commands
  }, [])

  const clearDeadline = useCallback(() => {
    if (deadlineRef.current !== undefined) clearTimeout(deadlineRef.current)
    deadlineRef.current = undefined
  }, [])

  const disposeMedia = useCallback(() => {
    operationRef.current += 1
    clearDeadline()
    unsubscribeRef.current?.()
    unsubscribeRef.current = undefined
    handleRef.current?.dispose()
    handleRef.current = undefined
    setFullscreenAvailable(false)
    setAwaitingPlayTap(false)
  }, [clearDeadline])

  useEffect(() => {
    disposeMedia()
    activeRequestRef.current = undefined
    preparedRequestIdsRef.current.clear()
    const nextRegistry = createRegistryState(catalog, playlist, registryRef.current.network)
    registryRef.current = nextRegistry
    setRegistryState(nextRegistry)
    dispatch({ type: 'initialize', playlist })
  }, [catalog, disposeMedia, playlist])

  useEffect(() => disposeMedia, [disposeMedia])

  useEffect(() => {
    let active = true
    const updateNetwork = (status: NetworkStatus) => {
      if (active) applyRegistryAction({ type: 'network-changed', status })
    }
    const unsubscribe = network.subscribe(updateNetwork)
    void network.currentStatus().then(updateNetwork, () => updateNetwork('unknown'))
    return () => {
      active = false
      unsubscribe()
    }
  }, [applyRegistryAction, network])

  const savePosition = useCallback((handle: PlayerHandle) => {
    dispatch({
      type: 'save-position',
      playlistId: handle.playlistId,
      ...(handle.selectedVideoId === undefined
        ? {}
        : { videoId: handle.selectedVideoId }),
      positionSeconds: handle.getCurrentTime(),
    })
  }, [])

  const failRequest = useCallback((request: PlaybackRequest, errorCode: string) => {
    applyRegistryAction({
      type: 'request-failed',
      requestId: request.requestId,
      kind: 'playback',
      targetId: request.videoId ?? request.playlistId,
      errorCode,
      retryPolicy: errorCode === PLAYBACK_OFFLINE ? 'when-online' : 'immediate',
    })
    dispatch({
      type: 'set-playback-state',
      playlistId: request.playlistId,
      ...(request.videoId === undefined ? {} : { videoId: request.videoId }),
      playbackState: 'failed',
    })
  }, [applyRegistryAction])

  /**
   * A mounted player that has not started is not a failure: it is a player
   * waiting for a tap on its own play button, which is the only thing WebKit
   * accepts for audible media. Keep the iframe on screen and say so, instead of
   * destroying the one control that can still start playback.
   */
  const awaitPlayTap = useCallback((request: PlaybackRequest) => {
    setAwaitingPlayTap(true)
    dispatch({
      type: 'set-playback-state',
      playlistId: request.playlistId,
      ...(request.videoId === undefined ? {} : { videoId: request.videoId }),
      playbackState: 'paused',
    })
  }, [])

  const attachHandle = useCallback((handle: PlayerHandle, operation: number) => {
    if (operation !== operationRef.current) {
      handle.dispose()
      return false
    }

    handleRef.current = handle
    setFullscreenAvailable(handle.supportsFullscreen())
    unsubscribeRef.current = handle.subscribeState((mediaState) => {
      if (operation !== operationRef.current) return
      if (mediaState === 'failed') {
        clearDeadline()
        disposeMedia()
        const request = activeRequestRef.current
        if (request) failRequest(request, PLAYBACK_SERVICE_ERROR)
        return
      }
      if (mediaState === 'playing') {
        clearDeadline()
        setAwaitingPlayTap(false)
        applyRegistryAction({ type: 'request-succeeded', requestId: handle.requestId })
      }
      if (mediaState === 'paused' || mediaState === 'ended') savePosition(handle)
      dispatch({
        type: 'set-playback-state',
        playlistId: handle.playlistId,
        ...(handle.selectedVideoId === undefined
          ? {}
          : { videoId: handle.selectedVideoId }),
        playbackState: mediaState === 'playing' ? 'playing' : 'paused',
      })
    })
    return true
  }, [applyRegistryAction, clearDeadline, disposeMedia, failRequest, savePosition])

  const startDeadline = useCallback((request: PlaybackRequest) => {
    clearDeadline()
    const operation = operationRef.current
    deadlineRef.current = setTimeout(() => {
      if (operation !== operationRef.current) return
      // A player that reached `onReady` is still usable, so the deadline
      // degrades to "press play" and leaves the iframe mounted. Only a request
      // that never produced a player at all is a failure.
      if (handleRef.current) {
        awaitPlayTap(request)
        return
      }
      disposeMedia()
      failRequest(request, PLAYBACK_TIMEOUT)
    }, PLAYING_DEADLINE_MS)
  }, [awaitPlayTap, clearDeadline, disposeMedia, failRequest])

  const executeRequest = useCallback(async (
    request: PlaybackRequest,
    retry: boolean,
  ) => {
    const target = mountRef.current
    if (!target) return

    disposeMedia()
    const operation = operationRef.current
    activeRequestRef.current = request
    applyRegistryAction({
      type: 'request-started',
      requestId: request.requestId,
      kind: 'playback',
      targetId: request.videoId ?? request.playlistId,
    })

    let networkStatus: NetworkStatus
    try {
      networkStatus = await network.currentStatus()
    } catch {
      networkStatus = 'unknown'
    }
    if (operation !== operationRef.current) return
    applyRegistryAction({ type: 'network-changed', status: networkStatus })
    if (networkStatus === 'offline') {
      failRequest(request, PLAYBACK_OFFLINE)
      return
    }

    dispatch({
      type: 'set-playback-state',
      playlistId: request.playlistId,
      ...(request.videoId === undefined ? {} : { videoId: request.videoId }),
      playbackState: 'loading',
    })
    if (request.videoId !== undefined) startDeadline(request)

    try {
      let handle: PlayerHandle
      if (retry && preparedRequestIdsRef.current.has(request.requestId)) {
        handle = await service.retry(request.requestId)
      } else {
        preparedRequestIdsRef.current.add(request.requestId)
        handle = await service.prepare(request, target)
      }
      if (attachHandle(handle, operation)) {
        if (request.videoId === undefined) {
          applyRegistryAction({ type: 'request-succeeded', requestId: request.requestId })
        } else if (handle.startsAutomatically) {
          handle.play()
        } else {
          // The embed was created paused because this platform refuses to start
          // audible media on its own. Nothing is pending, so retire the
          // deadline and point at the play button instead of counting down.
          clearDeadline()
          awaitPlayTap(request)
        }
      }
    } catch {
      if (operation === operationRef.current) {
        clearDeadline()
        failRequest(request, PLAYBACK_SERVICE_ERROR)
      }
    }
  }, [applyRegistryAction, attachHandle, awaitPlayTap, clearDeadline, disposeMedia, failRequest, network, service, startDeadline])

  const beginPlayback = useCallback((videoId?: VideoId) => {
    const request: PlaybackRequest = {
      requestId: nextPlaybackRequestId(),
      playlistId: playlist.id,
      ...(videoId === undefined ? {} : { videoId }),
    }
    void executeRequest(request, false)
  }, [executeRequest, playlist.id])

  useEffect(() => {
    if (state.mode !== 'playlist-embed' || activeRequestRef.current) return
    beginPlayback()
  }, [beginPlayback, state.mode])

  const retryPlayback = useCallback(() => {
    const request = activeRequestRef.current
    if (!request) return
    const commands = applyRegistryAction({
      type: 'retry-requested',
      requestId: request.requestId,
    })
    if (commands.some((command) =>
      command.kind === 'playback' && command.requestId === request.requestId)) {
      void executeRequest(request, true)
    }
  }, [applyRegistryAction, executeRequest])

  const openExternally = useCallback(() => {
    const request = activeRequestRef.current
    if (request) void service.openExternally(request)
  }, [service])

  const selectVideo = useCallback((videoId: VideoId) => {
    if (state.mode !== 'recorded-videos') return
    // The video list page-scrolls, so a tap far down the list leaves the player
    // off-screen. `behavior` is omitted so the scrolling box's CSS decides:
    // smooth normally, instant under `prefers-reduced-motion: reduce`. The
    // optional call covers jsdom and older WebViews without `scrollIntoView`.
    //
    // This call alone is not enough on iOS: WebKit abandons an in-flight smooth
    // scroll while a touch gesture or its momentum is still settling, and
    // mounting the player changes document height mid-animation. The layout
    // effect below re-asserts the position after React commits, which is past
    // both hazards. Keep this one so pointer platforms still start moving on
    // the tap itself.
    surfaceRef.current?.scrollIntoView?.({ block: 'start' })
    if (videoId !== state.selectedVideoId) {
      dispatch({ type: 'select-video', playlistId: playlist.id, videoId })
      beginPlayback(videoId)
      return
    }
    if (state.playbackState !== 'playing' && state.playbackState !== 'loading') {
      beginPlayback(videoId)
    }
  }, [beginPlayback, playlist.id, state])

  // Re-assert the player position after React has committed. The scroll inside
  // `selectVideo` happens while the tap is still settling, which is exactly the
  // window WebKit uses to discard programmatic smooth scrolls, and the player
  // mounting right afterwards shifts layout again. Running here clears both
  // hazards. Keyed on the selection, so it never fights a scroll the reader
  // performed themselves.
  const selectedVideoId = state.mode === 'recorded-videos' ? state.selectedVideoId : undefined
  const lastScrolledVideoRef = useRef<VideoId | undefined>(undefined)
  useLayoutEffect(() => {
    if (selectedVideoId === undefined) return
    if (lastScrolledVideoRef.current === undefined) {
      // First commit for this playlist. AppShell has already placed the route
      // at the top, so claiming the scroll here would undo that.
      lastScrolledVideoRef.current = selectedVideoId
      return
    }
    if (lastScrolledVideoRef.current === selectedVideoId) return
    lastScrolledVideoRef.current = selectedVideoId
    surfaceRef.current?.scrollIntoView?.({ block: 'start' })
  }, [selectedVideoId])

  const enterFullscreen = useCallback(async () => {
    const handle = handleRef.current
    if (!handle) return
    savePosition(handle)
    await handle.enterFullscreen()
  }, [savePosition])

  useEffect(() => {
    const preservePositionOnExit = () => {
      if (document.fullscreenElement !== null || !handleRef.current) return
      savePosition(handleRef.current)
    }
    document.addEventListener('fullscreenchange', preservePositionOnExit)
    return () => document.removeEventListener('fullscreenchange', preservePositionOnExit)
  }, [savePosition])

  const close = useCallback(() => {
    if (handleRef.current) savePosition(handleRef.current)
    disposeMedia()
    onClose()
  }, [disposeMedia, onClose, savePosition])

  const videos = playlist.videos ?? []
  const selectedVideo = state.mode === 'recorded-videos'
    ? videos.find(({ id }) => id === state.selectedVideoId)
    : undefined
  const activeRequest = activeRequestRef.current
  const requestState: RequestState | undefined = activeRequest
    ? registryState.requests[activeRequest.requestId]
    : undefined
  const contentTitle = selectedVideo?.title ?? playlist.title
  const errorCode = requestState?.errorCode
  const retryVisible = requestState?.status === 'failed' || requestState?.status === 'retryable'
  const retryEnabled = requestState?.status === 'retryable'

  return (
    <div className="video-player">
      <button type="button" className="catalog-back-button" onClick={close}>
        Back
      </button>
      <h1 id="playlist-screen-title" className="section-heading" tabIndex={-1}>{playlist.title}</h1>

      {state.mode === 'unavailable' ? (
        <p className="catalog-state catalog-error" role="alert">
          {playlist.title} is unavailable.
        </p>
      ) : (
        <>
          <div className="video-player-surface" ref={surfaceRef}>
            <div className="video-player-media" ref={mountRef} />
            {state.mode === 'recorded-videos' && !handleRef.current && selectedVideo && (
              <img
                src={assetPath(catalog, selectedVideo.thumbnail)}
                alt={selectedVideo.title}
              />
            )}
          </div>

          <div className="video-player-controls">
            {state.mode === 'recorded-videos' && (
              <button
                type="button"
                onClick={() => beginPlayback(state.selectedVideoId)}
                disabled={state.playbackState === 'loading'}
              >
                {state.playbackState === 'playing' ? 'Restart selected video' : 'Play selected video'}
              </button>
            )}
            {fullscreenAvailable && (
              <button type="button" onClick={() => void enterFullscreen()}>
                Enter full screen
              </button>
            )}
            {retryVisible && (
              <button type="button" onClick={retryPlayback} disabled={!retryEnabled}>
                Retry {contentTitle}
              </button>
            )}
            {activeRequest !== undefined
              && (retryVisible || awaitingPlayTap || state.playbackState === 'loading') && (
              <button type="button" onClick={openExternally}>
                Open {contentTitle} in YouTube
              </button>
            )}
          </div>

          <p className="video-player-status" role="status" aria-live="polite" aria-atomic="true">
            {state.playbackState === 'loading' && `Starting ${contentTitle}…`}
            {state.playbackState === 'playing' && `Playing ${contentTitle}.`}
            {awaitingPlayTap && state.playbackState === 'paused' && `Tap play in the player to start ${contentTitle}.`}
            {state.playbackState === 'failed' && errorCode === PLAYBACK_TIMEOUT && `${contentTitle} did not begin playing in time.`}
            {state.playbackState === 'failed' && errorCode === PLAYBACK_OFFLINE && `${contentTitle} requires a network connection.`}
            {state.playbackState === 'failed' && errorCode === PLAYBACK_SERVICE_ERROR && `${contentTitle} is unavailable in the embedded player.`}
          </p>

          {state.mode === 'recorded-videos' && (
            <div className="video-player-list-section">
              <p>{videos.length} {videos.length === 1 ? 'video' : 'videos'}</p>
              <div className="video-player-list" role="listbox" aria-label={`${playlist.title} videos`}>
                {videos.map((video, index) => {
                  const selected = video.id === state.selectedVideoId
                  return (
                    <button
                      key={video.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`video-player-option${selected ? ' video-player-option-selected' : ''}`}
                      onClick={() => selectVideo(video.id)}
                    >
                      <span className="video-player-number" aria-hidden="true">{index + 1}</span>
                      <img src={assetPath(catalog, video.thumbnail)} alt={video.title} loading="lazy" />
                      <span>{video.title}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
