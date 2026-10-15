// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import {
  anyBlockingModalOpen,
  canOpenSpotlight,
  classifySpotlightKey,
  isShortcutSuppressedByTyping,
  type SpotlightModalState,
} from '../../../src/lib/appSpotlight'

const idleModals: SpotlightModalState = {
  loginModalOpen: false,
  categoryModalOpen: false,
  bookmarkModalOpen: false,
  confirmDialogOpen: false,
  bookmarkViewOpen: false,
}

describe('anyBlockingModalOpen', () => {
  it('无模态时返回 false', () => {
    expect(anyBlockingModalOpen(idleModals)).toBe(false)
  })

  it.each([
    ['loginModalOpen'],
    ['categoryModalOpen'],
    ['bookmarkModalOpen'],
    ['confirmDialogOpen'],
    ['bookmarkViewOpen'],
  ] as const)('任一阻塞位为 true 则返回 true (%s)', (key) => {
    expect(anyBlockingModalOpen({ ...idleModals, [key]: true })).toBe(true)
  })
})

describe('canOpenSpotlight', () => {
  const openGate = { spotlightOpen: false, blocked: false, currentView: 'home' as const, canSeeHome: true }

  it('首页可见且无阻塞时可打开', () => {
    expect(canOpenSpotlight(openGate)).toBe(true)
  })

  it('已打开 / 被阻塞 / 非首页 / 首页不可见时不可打开', () => {
    expect(canOpenSpotlight({ ...openGate, spotlightOpen: true })).toBe(false)
    expect(canOpenSpotlight({ ...openGate, blocked: true })).toBe(false)
    expect(canOpenSpotlight({ ...openGate, currentView: 'admin' })).toBe(false)
    expect(canOpenSpotlight({ ...openGate, canSeeHome: false })).toBe(false)
  })
})

describe('classifySpotlightKey', () => {
  const base = { ctrlKey: false, metaKey: false, spotlightOpen: false }

  it('Ctrl+K / Cmd+K 切换（大小写不敏感）', () => {
    expect(classifySpotlightKey({ ...base, key: 'k', ctrlKey: true })).toBe('toggle')
    expect(classifySpotlightKey({ ...base, key: 'K', metaKey: true })).toBe('toggle')
  })

  it('「/」仅在关闭时打开', () => {
    expect(classifySpotlightKey({ ...base, key: '/' })).toBe('open')
    expect(classifySpotlightKey({ ...base, key: '/', spotlightOpen: true })).toBeNull()
  })

  it('Esc 仅在打开时关闭', () => {
    expect(classifySpotlightKey({ ...base, key: 'Escape', spotlightOpen: true })).toBe('close')
    expect(classifySpotlightKey({ ...base, key: 'Escape' })).toBeNull()
  })

  it('无关按键返回 null', () => {
    expect(classifySpotlightKey({ ...base, key: 'a' })).toBeNull()
    expect(classifySpotlightKey({ ...base, key: 'k' })).toBeNull()
  })
})

describe('isShortcutSuppressedByTyping', () => {
  function keyEvent(target: HTMLElement | null, extra: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return { target, isComposing: false, key: 'k', ...extra } as KeyboardEvent
  }

  it('输入态目标一律让路', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    // jsdom 不实现 isContentEditable，用形状一致的假对象直接覆盖该分支
    const editable = { tagName: 'DIV', isContentEditable: true } as HTMLElement
    const button = document.createElement('button')

    expect(isShortcutSuppressedByTyping(keyEvent(input))).toBe(true)
    expect(isShortcutSuppressedByTyping(keyEvent(textarea))).toBe(true)
    expect(isShortcutSuppressedByTyping(keyEvent(editable))).toBe(true)
    expect(isShortcutSuppressedByTyping(keyEvent(button))).toBe(false)
    expect(isShortcutSuppressedByTyping(keyEvent(null))).toBe(false)
  })

  it('IME 组合中一律让路', () => {
    const button = document.createElement('button')
    expect(isShortcutSuppressedByTyping(keyEvent(button, { isComposing: true }))).toBe(true)
    expect(isShortcutSuppressedByTyping(keyEvent(button, { key: 'Process' }))).toBe(true)
  })
})
