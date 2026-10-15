import type { AppView } from './appNavigation'

/**
 * Spotlight（全局搜索）唤起/关闭的纯决策逻辑。
 * 从 App.svelte 下沉：键盘意图分类、输入态排除、打开前置条件，
 * 让 App.svelte 只剩"懒加载组件 + 改本地状态"的编排。
 */

export interface SpotlightModalState {
  loginModalOpen: boolean
  categoryModalOpen: boolean
  bookmarkModalOpen: boolean
  confirmDialogOpen: boolean
  bookmarkViewOpen: boolean
}

/** 任一阻塞型模态/视图打开时，Spotlight 不得与其并发出现（D-e 模态互斥）。 */
export function anyBlockingModalOpen(state: SpotlightModalState): boolean {
  return (
    state.loginModalOpen ||
    state.categoryModalOpen ||
    state.bookmarkModalOpen ||
    state.confirmDialogOpen ||
    state.bookmarkViewOpen
  )
}

export interface SpotlightOpenGate {
  spotlightOpen: boolean
  blocked: boolean
  currentView: AppView
  canSeeHome: boolean
}

/** Spotlight 打开的前置条件：未打开、无阻塞模态、位于可见的首页。 */
export function canOpenSpotlight(gate: SpotlightOpenGate): boolean {
  return !gate.spotlightOpen && !gate.blocked && gate.currentView === 'home' && gate.canSeeHome
}

export type SpotlightKeyIntent = 'toggle' | 'open' | 'close'

/**
 * 全局快捷键意图分类（纯函数，不读 DOM）。
 * Ctrl+K / Cmd+K 切换，「/」 仅在关闭时打开，Esc 仅在打开时关闭。
 */
export function classifySpotlightKey(input: {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  spotlightOpen: boolean
}): SpotlightKeyIntent | null {
  const { key, ctrlKey, metaKey, spotlightOpen } = input
  if ((ctrlKey || metaKey) && key.toLowerCase() === 'k') return 'toggle'
  if (key === '/' && !spotlightOpen) return 'open'
  if (key === 'Escape' && spotlightOpen) return 'close'
  return null
}

/**
 * 是否处于输入态或 IME 中：此时全局快捷键一律让路。
 * 排除 INPUT / TEXTAREA / contentEditable，以及 isComposing 与 Process 键。
 */
export function isShortcutSuppressedByTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  const typing = Boolean(
    target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable),
  )
  return event.isComposing || event.key === 'Process' || typing
}
