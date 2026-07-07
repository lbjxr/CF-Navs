import type { IconifyCandidate } from '../../shared/types'
import { iconifyIcon, iconifyNameFromUrl, iconifyProxyIcon, normalizeIconifyName } from './icons'
import { getIconifySearchQuery } from './bookmarkFormIcons'

export const ICONIFY_SEARCH_DEBOUNCE_MS = 280
export const INVALID_ICONIFY_ICON_ERROR = '请输入有效的 Iconify 图标名或 icon-sets 链接，例如 mdi:home 或 https://icon-sets.iconify.design/mdi/home/'

export type BookmarkIconifySelectionState = {
  iconifyName: string
  iconifyUseConfirmed: boolean
  confirmedIconifyName: string
}

export type BookmarkIconifySearchState = {
  candidates: IconifyCandidate[]
  loading: boolean
  error: string
  requestId: number
  lastQuery: string
}

export type BookmarkIconifyViewState = {
  normalizedIconifyName: string
  iconifySourceUrl: string
  iconifyPreviewUrl: string
  iconifySelected: boolean
}

export type BookmarkIconifyInputState = Omit<BookmarkIconifyViewState, 'iconifySelected'>

export type BookmarkIconifySearchTask = {
  query: string
  requestId: number
  delayMs: number
}

export type BookmarkIconifySearchScheduleResult = {
  state: BookmarkIconifySearchState
  changed: boolean
  task: BookmarkIconifySearchTask | null
}

export type SelectBookmarkIconifyIconResult =
  | {
      ok: true
      icon: string
      iconSource: 'iconify'
      iconifyName: string
      iconifyUseConfirmed: true
      confirmedIconifyName: string
    }
  | {
      ok: false
      error: string
    }

export function createBookmarkIconifySearchState(): BookmarkIconifySearchState {
  return {
    candidates: [],
    loading: false,
    error: '',
    requestId: 0,
    lastQuery: '',
  }
}

export function initializeBookmarkIconifySelection(input: {
  mode: 'create' | 'edit'
  iconSource: string | null | undefined
  icon: string
}): BookmarkIconifySelectionState {
  const iconifyName = input.iconSource === 'iconify' ? iconifyNameFromUrl(input.icon) ?? '' : ''
  const iconifyUseConfirmed = input.mode === 'edit' && input.iconSource === 'iconify' && Boolean(iconifyName)

  return {
    iconifyName,
    iconifyUseConfirmed,
    confirmedIconifyName: iconifyUseConfirmed ? iconifyName : '',
  }
}

export function deriveBookmarkIconifyView(input: BookmarkIconifySelectionState): BookmarkIconifyViewState {
  const iconifyInput = deriveBookmarkIconifyInput(input.iconifyName)

  return {
    ...iconifyInput,
    iconifySelected: isBookmarkIconifySelected({
      iconifyUseConfirmed: input.iconifyUseConfirmed,
      normalizedIconifyName: iconifyInput.normalizedIconifyName,
      confirmedIconifyName: input.confirmedIconifyName,
    }),
  }
}

export function deriveBookmarkIconifyInput(iconifyName: string): BookmarkIconifyInputState {
  return {
    normalizedIconifyName: normalizeIconifyName(iconifyName),
    iconifySourceUrl: iconifyIcon(iconifyName),
    iconifyPreviewUrl: iconifyProxyIcon(iconifyName),
  }
}

export function isBookmarkIconifySelected(input: {
  iconifyUseConfirmed: boolean
  normalizedIconifyName: string
  confirmedIconifyName: string
}): boolean {
  return (
    input.iconifyUseConfirmed &&
    Boolean(input.normalizedIconifyName) &&
    input.confirmedIconifyName === input.normalizedIconifyName
  )
}

export function shouldResetBookmarkIconifyConfirmation(input: {
  iconifyUseConfirmed: boolean
  normalizedIconifyName: string
  confirmedIconifyName: string
}): boolean {
  return input.iconifyUseConfirmed && input.normalizedIconifyName !== input.confirmedIconifyName
}

export function scheduleBookmarkIconifyCandidateSearch(
  state: BookmarkIconifySearchState,
  input: { enabled: boolean; value: string },
): BookmarkIconifySearchScheduleResult {
  const query = input.enabled ? getIconifySearchQuery(input.value) : ''
  if (query === state.lastQuery) {
    return {
      state,
      changed: false,
      task: null,
    }
  }

  const nextRequestId = state.requestId + 1
  if (!query) {
    return {
      state: {
        candidates: [],
        loading: false,
        error: '',
        requestId: nextRequestId,
        lastQuery: query,
      },
      changed: true,
      task: null,
    }
  }

  return {
    state: {
      ...state,
      loading: true,
      error: '',
      requestId: nextRequestId,
      lastQuery: query,
    },
    changed: true,
    task: {
      query,
      requestId: nextRequestId,
      delayMs: ICONIFY_SEARCH_DEBOUNCE_MS,
    },
  }
}

export function resolveBookmarkIconifySearchSuccess(
  state: BookmarkIconifySearchState,
  input: { requestId: number; candidates: IconifyCandidate[] },
): BookmarkIconifySearchState {
  if (input.requestId !== state.requestId) return state

  return {
    ...state,
    candidates: input.candidates,
    loading: false,
    error: '',
  }
}

export function resolveBookmarkIconifySearchError(
  state: BookmarkIconifySearchState,
  input: { requestId: number; error: string },
): BookmarkIconifySearchState {
  if (input.requestId !== state.requestId) return state

  return {
    ...state,
    candidates: [],
    loading: false,
    error: input.error,
  }
}

export function selectBookmarkIconifyIcon(value: string): SelectBookmarkIconifyIconResult {
  const normalizedIconifyName = normalizeIconifyName(value)
  const icon = iconifyIcon(value)
  if (!icon || !normalizedIconifyName) {
    return {
      ok: false,
      error: INVALID_ICONIFY_ICON_ERROR,
    }
  }

  return {
    ok: true,
    icon,
    iconSource: 'iconify',
    iconifyName: normalizedIconifyName,
    iconifyUseConfirmed: true,
    confirmedIconifyName: normalizedIconifyName,
  }
}

export function selectBookmarkIconifySearchCandidate(candidate: IconifyCandidate): {
  icon: string
  iconSource: 'iconify'
  iconifyName: string
  iconifyUseConfirmed: true
  confirmedIconifyName: string
} {
  return {
    icon: candidate.url,
    iconSource: 'iconify',
    iconifyName: candidate.name,
    iconifyUseConfirmed: true,
    confirmedIconifyName: candidate.name,
  }
}
