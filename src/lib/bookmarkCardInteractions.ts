export const BOOKMARK_CONTEXT_MENU_OPEN_EVENT = 'cf-navs-bookmark-context-menu-open'

export type BookmarkContextMenuInput = {
  sortMode: boolean
  canEdit: boolean
  hasEditHandler: boolean
  hasMoveHandler?: boolean
}

export type BookmarkModalInput = {
  sortMode: boolean
  openMethod: number | null | undefined
}

export function shouldBlockCardNavigation(sortMode: boolean): boolean {
  return sortMode
}

export function canOpenBookmarkContextMenu(input: BookmarkContextMenuInput): boolean {
  if (input.sortMode) return Boolean(input.hasMoveHandler)
  return input.canEdit && input.hasEditHandler
}

export function shouldOpenBookmarkModal(input: BookmarkModalInput): boolean {
  return !input.sortMode && input.openMethod === 3
}

export function createBookmarkContextMenuOpenEvent(instanceId: string): CustomEvent<string> {
  return new CustomEvent<string>(BOOKMARK_CONTEXT_MENU_OPEN_EVENT, {
    detail: instanceId,
  })
}

export function isExternalContextMenuOpenEvent(event: Event, instanceId: string): boolean {
  return (event as CustomEvent<string>).detail !== instanceId
}
