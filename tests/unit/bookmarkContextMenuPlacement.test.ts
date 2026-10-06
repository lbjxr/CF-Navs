// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte'
import BookmarkContextMenu from '../../src/components/BookmarkContextMenu.svelte'

// Issue #30：菜单默认从卡片下沿向下展开。页面末尾那一排卡片下方没有空间时，菜单会越过
// 视口底边，「编辑」按钮落在视口外被裁掉，真实点击无法命中。修复后必须按真实几何翻转，
// 上下都不够时夹紧高度并允许内部滚动。
//
// jsdom 不做布局，所以这里显式 stub 父级卡片与菜单自身的几何，只验证「决策逻辑 + 落地样式」；
// 真实浏览器中的像素结果由 L2 单独验证。

const VIEWPORT_HEIGHT = 800
const MENU_HEIGHT = 45
const CARD_HEIGHT = 60

/** 让菜单元素报告指定的自然高度（scrollHeight 是只读 getter，需要单独定义）。 */
function stubMenuGeometry(scrollHeight: number): void {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      return this.classList.contains('bookmark-context-menu') ? scrollHeight : 0
    },
  })
}

/** 父级卡片在视口中的位置：bottom 决定下方可用空间。 */
function stubAnchorRect(top: number): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    const isAnchor = this.classList.contains('bookmark-card-shell')
    const height = isAnchor ? CARD_HEIGHT : 0
    const rectTop = isAnchor ? top : 0
    return {
      x: 0,
      y: rectTop,
      top: rectTop,
      bottom: rectTop + height,
      left: 0,
      right: 200,
      width: 200,
      height,
      toJSON: () => ({}),
    } as DOMRect
  })
}

function renderMenu(props: Record<string, unknown> = {}): { anchor: HTMLElement; menu: HTMLElement } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const anchor = document.createElement('div')
  anchor.className = 'bookmark-card-shell'
  host.appendChild(anchor)

  render(BookmarkContextMenu, {
    target: anchor,
    props: { onEdit: () => undefined, ...props },
  })

  const menu = anchor.querySelector('.bookmark-context-menu') as HTMLElement
  return { anchor, menu }
}

afterEach(() => {
  cleanup()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('书签右键菜单的视口定位', () => {
  it('keeps opening downward when there is room below the card', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT })
    stubMenuGeometry(MENU_HEIGHT)
    stubAnchorRect(100)

    const { menu } = renderMenu()

    await waitFor(() => expect(menu.classList.contains('placement-up')).toBe(false))
    expect(menu.classList.contains('clamped')).toBe(false)
    expect(menu.getAttribute('style')).not.toContain('max-height')
  })

  it('flips upward when the card sits too close to the viewport bottom', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT })
    stubMenuGeometry(MENU_HEIGHT)
    // 卡片下沿 794，下方只剩 6px；上方有 734px，足够放下 45px 的菜单。
    stubAnchorRect(734)

    const { menu } = renderMenu()

    await waitFor(() => expect(menu.classList.contains('placement-up')).toBe(true))
    expect(menu.classList.contains('clamped')).toBe(false)
  })

  it('clamps and scrolls internally when neither side has enough room', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT })
    // 菜单比两侧空间都高：卡片 top=300、bottom=360 → 下方约 438px、上方约 298px，都放不下 500px。
    stubMenuGeometry(500)
    stubAnchorRect(300)

    const { menu } = renderMenu()

    // 选空间更大的一侧（下方），并夹到该侧可用空间内。
    await waitFor(() => expect(menu.classList.contains('clamped')).toBe(true))
    expect(menu.classList.contains('placement-up')).toBe(false)
    const clamped = Number(/max-height:\s*(\d+)px/.exec(menu.getAttribute('style') ?? '')?.[1])
    expect(clamped).toBeGreaterThan(400)
    expect(clamped).toBeLessThanOrEqual(438)
    // 内部滚动由 `.clamped` 类提供（jsdom 不套用样式表，故断言类名而非计算样式）。
    expect(menu.classList.contains('clamped')).toBe(true)
  })

  it('prefers the roomier side when flipping up', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT })
    stubMenuGeometry(500)
    // 卡片 top=500、bottom=560 → 下方约 238px、上方约 498px：应向上展开并夹到上方空间。
    stubAnchorRect(500)

    const { menu } = renderMenu()

    await waitFor(() => expect(menu.classList.contains('placement-up')).toBe(true))
    expect(menu.classList.contains('clamped')).toBe(true)
    const clamped = Number(/max-height:\s*(\d+)px/.exec(menu.getAttribute('style') ?? '')?.[1])
    expect(clamped).toBeGreaterThan(400)
    expect(clamped).toBeLessThanOrEqual(498)
  })

  it('remeasures after opening the real move picker without a resize event', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT })
    let menuHeight = MENU_HEIGHT
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.classList.contains('bookmark-context-menu') ? menuHeight : 0
      },
    })
    // 卡片 top=400、bottom=460 → 初始向下；移动选择器展开后自然高度变为 500，
    // 两侧都不足且上方空间更大 → afterUpdate 必须触发翻转与夹紧。
    stubAnchorRect(400)

    const { menu } = renderMenu({
      canMove: true,
      categories: [{ id: 1, title: 'Root', children: [] }],
      onMoveBookmark: () => undefined,
    })
    await waitFor(() => expect(menu.classList.contains('placement-up')).toBe(false))

    menuHeight = 500
    await fireEvent.click(menu.querySelector('[data-testid="bookmark-context-move"]') as HTMLElement)

    await waitFor(() => {
      expect(menu.classList.contains('placement-up')).toBe(true)
      expect(menu.classList.contains('clamped')).toBe(true)
    })
    expect(menu.querySelector('[data-testid="bookmark-context-move-picker"]')).not.toBeNull()
  })

  it('lets Escape reach the outer close listener from an outer menu control', async () => {
    const windowKeydown = vi.fn()
    window.addEventListener('keydown', windowKeydown)
    const { menu } = renderMenu()
    const edit = menu.querySelector('[data-testid="bookmark-context-edit"]') as HTMLButtonElement
    edit.focus()

    await fireEvent.keyDown(edit, { key: 'Escape' })

    expect(windowKeydown).toHaveBeenCalledOnce()
    window.removeEventListener('keydown', windowKeydown)
  })

  it('lets the nested category selector consume Escape before the outer menu', async () => {
    const windowKeydown = vi.fn()
    window.addEventListener('keydown', windowKeydown)
    const { menu } = renderMenu({
      canMove: true,
      categories: [{ id: 1, title: 'Root', children: [] }],
      onMoveBookmark: () => undefined,
    })
    await fireEvent.click(menu.querySelector('[data-testid="bookmark-context-move"]') as HTMLElement)
    const trigger = menu.querySelector('[data-testid="bookmark-context-move-select"]') as HTMLButtonElement
    await fireEvent.click(trigger)
    expect(menu.querySelector('.category-tree-menu')).not.toBeNull()
    trigger.focus()

    await fireEvent.keyDown(trigger, { key: 'Escape' })

    expect(menu.querySelector('.category-tree-menu')).toBeNull()
    expect(menu.querySelector('[data-testid="bookmark-context-move-picker"]')).not.toBeNull()
    expect(windowKeydown).not.toHaveBeenCalled()
    window.removeEventListener('keydown', windowKeydown)
  })
  it('remeasures when the nested category tree opens and closes, without scrolling', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: VIEWPORT_HEIGHT })
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        if (!this.classList.contains('bookmark-context-menu')) return 0
        return this.querySelector('.category-tree-menu') ? 500 : 123
      },
    })
    stubAnchorRect(400)
    const { menu } = renderMenu({
      canMove: true,
      categories: [{ id: 1, title: 'Root', children: [] }],
      onMoveBookmark: () => undefined,
    })
    await fireEvent.click(menu.querySelector('[data-testid="bookmark-context-move"]')!)
    await waitFor(() => expect(menu.classList.contains('placement-up')).toBe(false))
    await fireEvent.click(menu.querySelector('[data-testid="bookmark-context-move-select"]')!)
    await waitFor(() => expect(menu.classList.contains('placement-up')).toBe(true))
    expect(menu.classList.contains('clamped')).toBe(true)
    await fireEvent.keyDown(menu.querySelector('[data-testid="bookmark-context-move-select"]')!, { key: 'Escape' })
    await waitFor(() => expect(menu.classList.contains('placement-up')).toBe(false))
    expect(menu.classList.contains('clamped')).toBe(false)
  })

  it('reserves short-viewport space for the picker and restores actions/focus on cancel', async () => {
    stubMenuGeometry(200)
    stubAnchorRect(120)
    const { menu } = renderMenu({ canMove: true, categories: [{ id: 1, title: 'Root', children: [] }], onMoveBookmark: () => undefined })
    await fireEvent.click(menu.querySelector('[data-testid="bookmark-context-move"]')!)
    expect(menu.querySelector('[data-testid="bookmark-context-edit"]')).toBeNull()
    expect(menu.querySelector('[data-testid="bookmark-context-move"]')).toBeNull()
    await fireEvent.click(menu.querySelector('.move-cancel')!)
    expect(menu.querySelector('[data-testid="bookmark-context-edit"]')).not.toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(menu.querySelector('[data-testid="bookmark-context-move"]')))
  })

  it('keeps menu placement above the fixed sorting toolbar exclusion area', async () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    stubMenuGeometry(45)
    stubAnchorRect(620)
    const { anchor, menu } = renderMenu()
    anchor.style.setProperty('--home-sort-bottom-inset', '120px')
    window.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(menu.classList.contains('placement-up')).toBe(true))
  })

})

describe('move picker uses the available viewport instead of one card side',()=>{
  it('keeps enough space for a full row above the sorting toolbar',async()=>{
    Object.defineProperty(window,'innerHeight',{configurable:true,value:300})
    stubMenuGeometry(350);stubAnchorRect(120)
    const {anchor,menu}=renderMenu({canMove:true,categories:[{id:1,title:'Root',children:[]}],onMoveBookmark:()=>undefined})
    anchor.style.setProperty('--home-sort-bottom-inset','50px')
    await fireEvent.click(menu.querySelector('[data-testid="bookmark-context-move"]')!)
    await waitFor(()=>expect(menu.style.maxHeight).toBe('234px'))
    expect(menu.style.top).toBe('-112px')
    await fireEvent.click(menu.querySelector('.move-cancel')!)
    await waitFor(()=>expect(menu.style.top).toBe(''))
  })
  it('updates its bounds when the visual viewport changes',async()=>{
    Object.defineProperty(window,'innerHeight',{configurable:true,value:800})
    const viewport=Object.assign(new EventTarget(),{offsetTop:80,height:180})
    Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport})
    try {
      stubMenuGeometry(400);stubAnchorRect(200)
      const {menu}=renderMenu({canMove:true,categories:[{id:1,title:'Root',children:[]}],onMoveBookmark:()=>undefined})
      await fireEvent.click(menu.querySelector('[data-testid="bookmark-context-move"]')!)
      await waitFor(()=>expect(menu.style.maxHeight).toBe('164px'))
      viewport.height=240;viewport.dispatchEvent(new Event('resize'))
      await waitFor(()=>expect(menu.style.maxHeight).toBe('224px'))
    } finally {cleanup();delete (window as any).visualViewport}
  })
})
