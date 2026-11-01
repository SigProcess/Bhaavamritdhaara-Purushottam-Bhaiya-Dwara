import type {
  AppState,
  NetworkStatus,
  RequestId,
  RequestKind,
  RequestState,
  RequestTargetId,
} from '../contracts'

export type RetryPolicy = 'immediate' | 'when-online'

export interface RequestIdentity {
  readonly requestId: RequestId
  readonly kind: RequestKind
  readonly targetId: RequestTargetId
}

export interface RetryRequestCommand extends RequestIdentity {
  readonly type: 'retry-request'
}

export type RequestRegistryCommand = RetryRequestCommand

export type RequestRegistryAction =
  | ({ readonly type: 'request-started' } & RequestIdentity)
  | ({
      readonly type: 'request-failed'
      readonly errorCode: string
      readonly retryPolicy?: RetryPolicy
    } & RequestIdentity)
  | { readonly type: 'request-succeeded'; readonly requestId: RequestId }
  | { readonly type: 'retry-requested'; readonly requestId: RequestId }
  | { readonly type: 'network-changed'; readonly status: NetworkStatus }

export interface RequestRegistryTransition {
  readonly state: AppState
  readonly commands: readonly RequestRegistryCommand[]
}

function hasSameIdentity(
  request: RequestState,
  identity: RequestIdentity,
): boolean {
  return (
    request.requestId === identity.requestId &&
    request.kind === identity.kind &&
    request.targetId === identity.targetId
  )
}

function assertRequestIdentity(
  current: RequestState | undefined,
  identity: RequestIdentity,
): void {
  if (current && !hasSameIdentity(current, identity)) {
    throw new Error(
      `Request ${identity.requestId} cannot be rebound to another kind or target`,
    )
  }
}

function replaceRequest(
  state: AppState,
  request: RequestState,
): AppState {
  return {
    ...state,
    requests: {
      ...state.requests,
      [request.requestId]: request,
    },
  }
}

function retryStatus(
  network: NetworkStatus,
  retryPolicy: RetryPolicy,
): RequestState['status'] {
  return retryPolicy === 'when-online' && network !== 'online'
    ? 'failed'
    : 'retryable'
}

function reduceNetworkState(
  state: AppState,
  status: NetworkStatus,
): AppState {
  if (state.network === status) return state

  let changedRequest = false
  const requests = Object.fromEntries(
    Object.entries(state.requests).map(([requestId, request]) => {
      if (request.retryPolicy !== 'when-online') return [requestId, request]

      if (status === 'online' && request.status === 'failed') {
        changedRequest = true
        return [requestId, { ...request, status: 'retryable' as const }]
      }

      if (status !== 'online' && request.status === 'retryable') {
        changedRequest = true
        return [requestId, { ...request, status: 'failed' as const }]
      }

      return [requestId, request]
    }),
  ) as Record<RequestId, RequestState>

  return {
    ...state,
    network: status,
    requests: changedRequest ? requests : state.requests,
  }
}

/**
 * Reduces request lifecycle and connectivity without changing local catalog,
 * navigation, search, player, or document-presentation state.
 */
export function reduceRequestRegistry(
  state: AppState,
  action: RequestRegistryAction,
): RequestRegistryTransition {
  switch (action.type) {
    case 'request-started': {
      const current = state.requests[action.requestId]
      assertRequestIdentity(current, action)

      return {
        state: replaceRequest(state, {
          requestId: action.requestId,
          kind: action.kind,
          targetId: action.targetId,
          status: 'pending',
        }),
        commands: [],
      }
    }

    case 'request-failed': {
      const current = state.requests[action.requestId]
      assertRequestIdentity(current, action)
      const retryPolicy = action.retryPolicy ?? 'immediate'

      return {
        state: replaceRequest(state, {
          requestId: action.requestId,
          kind: action.kind,
          targetId: action.targetId,
          status: retryStatus(state.network, retryPolicy),
          errorCode: action.errorCode,
          retryPolicy,
        }),
        commands: [],
      }
    }

    case 'request-succeeded': {
      const current = state.requests[action.requestId]
      if (!current) return { state, commands: [] }

      return {
        state: replaceRequest(state, {
          requestId: current.requestId,
          kind: current.kind,
          targetId: current.targetId,
          status: 'succeeded',
        }),
        commands: [],
      }
    }

    case 'retry-requested': {
      const current = state.requests[action.requestId]
      if (!current || current.status !== 'retryable') {
        return { state, commands: [] }
      }

      return {
        state: replaceRequest(state, {
          ...current,
          status: 'pending',
          errorCode: undefined,
        }),
        commands: [
          {
            type: 'retry-request',
            requestId: current.requestId,
            kind: current.kind,
            targetId: current.targetId,
          },
        ],
      }
    }

    case 'network-changed':
      return {
        state: reduceNetworkState(state, action.status),
        commands: [],
      }
  }
}
