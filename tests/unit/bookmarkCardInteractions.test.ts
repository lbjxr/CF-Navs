import { describe, expect, it } from 'vitest'
import {
  BOOKMARK_CONTEXT_MENU_OPEN_EVENT,
  canOpenBookmarkContextMenu,
  createBookmarkContextMenuOpenEvent,
  isExternalContextMenuOpenEvent,
  shouldBlockCardNavigation,
  shouldOpenBookmarkModal,
} from '../../src/lib/bookmarkCardInteractions'

describe('bookmark card interaction helpers', () => {
  it('blocks ordinary card navigation while sorting', () => {
    expect(shouldBlockCardNavigation(true)).toBe(true)
    expect(shouldBlockCardNavigation(false)).toBe(false)
  })

  it('does not open the context menu while sorting without a move handler', () => {
    expect(canOpenBookmarkContextMenu({
      sortMode: true,
      canEdit: true,
      hasEditHandler: true,
    })).toBe(false)
  })

  it('opens the move menu while sorting when a move handler exists', () => {
    expect(canOpenBookmarkContextMenu({
      sortMode: true,
      canEdit: false,
      hasEditHandler: false,
      hasMoveHandler: true,
    })).toBe(true)
  })

  it('does not open the context menu outside editable cards', () => {
    expect(canOpenBookmarkContextMenu({
      sortMode: false,
      canEdit: false,
      hasEditHandler: true,
    })).toBe(false)

    expect(canOpenBookmarkContextMenu({
      sortMode: false,
      canEdit: true,
      hasEditHandler: false,
    })).toBe(false)
  })

  it('opens the context menu only for editable cards with an edit handler', () => {
    expect(canOpenBookmarkContextMenu({
      sortMode: false,
      canEdit: true,
      hasEditHandler: true,
    })).toBe(true)
  })

  it('opens the modal only for modal open method outside sort mode', () => {
    expect(shouldOpenBookmarkModal({ sortMode: false, openMethod: 3 })).toBe(true)
    expect(shouldOpenBookmarkModal({ sortMode: true, openMethod: 3 })).toBe(false)
  })

  it('does not open the modal for new-tab or same-tab open methods', () => {
    expect(shouldOpenBookmarkModal({ sortMode: false, openMethod: 1 })).toBe(false)
    expect(shouldOpenBookmarkModal({ sortMode: false, openMethod: 2 })).toBe(false)
  })

  it('creates the shared context menu event with the source instance id', () => {
    const event = createBookmarkContextMenuOpenEvent('source-card')

    expect(event.type).toBe(BOOKMARK_CONTEXT_MENU_OPEN_EVENT)
    expect(event.detail).toBe('source-card')
  })

  it('does not treat the same instance context menu event as external', () => {
    const event = createBookmarkContextMenuOpenEvent('same-card')

    expect(isExternalContextMenuOpenEvent(event, 'same-card')).toBe(false)
  })

  it('treats another instance context menu event as external', () => {
    const event = createBookmarkContextMenuOpenEvent('other-card')

    expect(isExternalContextMenuOpenEvent(event, 'current-card')).toBe(true)
  })
})
