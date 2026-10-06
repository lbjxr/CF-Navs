// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte'
import Home from '../../src/views/Home.svelte'
import { getSortToolbarInset } from '../../src/lib/homeSortToolbar'
import type { PublicBookmark, PublicCategory } from '../../shared/types'

const categories: PublicCategory[] = [{ id: 1, parent_id: null, title: 'Tools', icon: null, sort: 0 }]
const bookmarks: PublicBookmark[] = [{ id: 1, category_id: 1, title: 'Example', url: 'https://example.test', icon: 'E', icon_source: 'custom', icon_background_color: null, description: null, open_method: 1, sort: 0 }]
let toolbarTop = 700
let notify: (() => void) | undefined
let disconnected = vi.fn()
beforeEach(() => {
  toolbarTop = 700
  notify = undefined
  disconnected = vi.fn()
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { notify = callback } observe() {} disconnect() { disconnected() } })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.classList.contains('home-sort-bar') ? { top: toolbarTop, bottom: 788, height: 788 - toolbarTop, left: 0, right: 300, width: 300 } as DOMRect : { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 } as DOMRect
  })
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

async function enter(onReorganizeBookmarks = vi.fn(async () => {})) {
  const rendered = render(Home, { props: { categories, bookmarks, isAuthenticated: true, onReorganizeBookmarks } })
  await fireEvent.click(rendered.container.querySelector('button[aria-label="排序"]')!)
  await waitFor(() => expect(rendered.container.querySelector('.home-sort-bar')).not.toBeNull())
  const shell = rendered.container.querySelector('.home-shell') as HTMLElement
  return { ...rendered, shell, onReorganizeBookmarks }
}

describe('home fixed sort toolbar clearance', () => {
  it('reserves the full viewport occlusion, updates after wrap/resize, and clears on cancel', async () => {
    const { container, shell, onReorganizeBookmarks } = await enter()
    await waitFor(() => expect(shell.style.getPropertyValue('--home-sort-bottom-inset')).toBe('108px'))
    toolbarTop = 650
    notify?.()
    await waitFor(() => expect(shell.style.getPropertyValue('--home-sort-bottom-inset')).toBe('158px'))
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 750 })
    window.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(shell.style.getPropertyValue('--home-sort-bottom-inset')).toBe('108px'))
    await fireEvent.click(container.querySelector('.home-sort-cancel')!)
    await waitFor(() => expect(shell.style.getPropertyValue('--home-sort-bottom-inset')).toBe('0px'))
    expect(disconnected).toHaveBeenCalled()
    expect(onReorganizeBookmarks).not.toHaveBeenCalled()
  })

  it('retains clearance when save fails and removes it when the error bar is dismissed', async () => {
    const { container, shell } = await enter(vi.fn(async () => { throw new Error('offline') }))
    await fireEvent.click(container.querySelector('.home-sort-save')!)
    await waitFor(() => expect(container.querySelector('.home-sort-bar.error-state')).not.toBeNull())
    expect(shell.style.getPropertyValue('--home-sort-bottom-inset')).toBe('108px')
    await fireEvent.click(container.querySelector('.home-sort-cancel')!)
    await waitFor(() => expect(shell.style.getPropertyValue('--home-sort-bottom-inset')).toBe('0px'))
  })

  it('disconnects measurement and ignores late callbacks after unmount', async () => {
    const { unmount, shell } = await enter()
    await waitFor(() => expect(shell.style.getPropertyValue('--home-sort-bottom-inset')).toBe('108px'))
    unmount()
    expect(disconnected).toHaveBeenCalled()
    notify?.()
    window.dispatchEvent(new Event('resize'))
  })
})

describe('sort toolbar geometry', () => {
  it.each([
    [800, 700, 88, 108],
    [300, 220.4, 67.6, 88],
    [800, 820, 40, 0],
    [800, 700, 0, 0],
    [800, Number.NaN, 40, 0],
  ])('measures viewport %s / top %s / height %s as %s', (viewport, top, height, expected) => {
    expect(getSortToolbarInset(viewport, top, height)).toBe(expected)
  })
})

it('publishes actual top-navigation bounds and removes the inset in left mode',async()=>{
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function(){
    return (this as HTMLElement).classList.contains('top-navigation')?{top:12,bottom:64,height:52,left:0,right:1000,width:1000} as DOMRect:{top:0,bottom:0,height:0,left:0,right:0,width:0} as DOMRect
  })
  const {container,rerender}=render(Home,{props:{categories,bookmarks,isAuthenticated:true,settings:{navigation:{position:'top',always_expanded:false}} as any}})
  const shell=container.querySelector('.home-shell') as HTMLElement
  await waitFor(()=>expect(shell.style.getPropertyValue('--home-top-inset')).toBe('64px'))
  await rerender({categories,bookmarks,isAuthenticated:true,settings:{navigation:{position:'left',always_expanded:false}} as any})
  await waitFor(()=>expect(shell.style.getPropertyValue('--home-top-inset')).toBe('0px'))
})
