import type {
  AppRoute,
  DocumentPresentationState,
  ElementId,
  NavigationEntry,
  NavigationStack,
  ScrollSnapshot,
} from '../contracts'

const HOME_SCROLL: ScrollSnapshot = Object.freeze({ x: 0, y: 0 })

export interface NavigationState {
  readonly stack: NavigationStack
  /** Native documents are presented over the active route, never pushed onto the stack. */
  readonly documentPresentation?: DocumentPresentationState
}

export type NavigationAction =
  | {
      readonly type: 'push'
      readonly route: AppRoute
      readonly originScroll: ScrollSnapshot
      readonly originFocusTargetId?: ElementId
    }
  | { readonly type: 'pop' }
  | {
      readonly type: 'snapshot-active'
      readonly scroll: ScrollSnapshot
      readonly focusTargetId?: ElementId
    }
  | {
      readonly type: 'present-document'
      readonly presentation: DocumentPresentationState
    }
  | { readonly type: 'dismiss-document' }
  | { readonly type: 'terminated-launch' }

function homeEntry(): NavigationEntry {
  return {
    route: { kind: 'home' },
    scroll: HOME_SCROLL,
  }
}

/**
 * Creates the navigation state for a cold/terminated launch. Transient routes,
 * scroll positions, focus targets, and native presentations are intentionally
 * discarded so Home is always the first interactive route.
 */
export function createTerminatedLaunchNavigationState(): NavigationState {
  return { stack: [homeEntry()] }
}

function replaceActiveEntry(
  stack: NavigationStack,
  entry: NavigationEntry,
): NavigationStack {
  return [...stack.slice(0, -1), entry] as unknown as NavigationStack
}

/** Pure reducer for route history and child native-document presentations. */
export function navigationReducer(
  state: NavigationState,
  action: NavigationAction,
): NavigationState {
  switch (action.type) {
    case 'push': {
      const active = state.stack[state.stack.length - 1]
      const predecessor: NavigationEntry = {
        route: active.route,
        scroll: action.originScroll,
        ...(action.originFocusTargetId === undefined
          ? {}
          : { focusTargetId: action.originFocusTargetId }),
      }
      const target: NavigationEntry = {
        route: action.route,
        scroll: HOME_SCROLL,
      }

      return {
        ...state,
        stack: [
          ...replaceActiveEntry(state.stack, predecessor),
          target,
        ] as unknown as NavigationStack,
      }
    }

    case 'pop':
      if (state.stack.length === 1) return state
      return {
        ...state,
        stack: state.stack.slice(0, -1) as unknown as NavigationStack,
      }

    case 'snapshot-active': {
      const active = state.stack[state.stack.length - 1]
      const updated: NavigationEntry = {
        route: active.route,
        scroll: action.scroll,
        ...(action.focusTargetId === undefined
          ? {}
          : { focusTargetId: action.focusTargetId }),
      }
      return {
        ...state,
        stack: replaceActiveEntry(state.stack, updated),
      }
    }

    case 'present-document':
      return { ...state, documentPresentation: action.presentation }

    case 'dismiss-document': {
      if (state.documentPresentation === undefined) return state
      const { documentPresentation: _dismissed, ...rest } = state
      return rest
    }

    case 'terminated-launch':
      return createTerminatedLaunchNavigationState()
  }
}

export function activeNavigationEntry(
  state: NavigationState,
): NavigationEntry {
  return state.stack[state.stack.length - 1]
}
