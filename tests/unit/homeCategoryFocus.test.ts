// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/svelte'
import Home from '../../src/views/Home.svelte'
import type { PublicBookmark, PublicCategory } from '../../shared/types'

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, writable: true, value: vi.fn() })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => { })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

it('selects a newly created empty child instead of leaving the parent bookmarks visible', async () => {
  const root: PublicCategory = { id: 1, parent_id: null, title: 'Parent', icon: null, sort: 0 }
  const existing: PublicCategory = { id: 2, parent_id: 1, title: 'Existing child', icon: null, sort: 0 }
  const created: PublicCategory = { id: 3, parent_id: 1, title: 'Created child', icon: null, sort: 1 }
  const bookmarks: PublicBookmark[] = [{
    id: 1,
    category_id: 1,
    title: 'Root bookmark',
    url: 'https://example.com/root',
    icon: null,
    icon_source: 'custom',
    icon_background_color: null,
    description: null,
    description_mode: null,
    open_method: 1,
    sort: 0,
  }]
  const { rerender } = render(Home, { props: { categories: [root, existing], bookmarks } })
  expect(screen.getByText('Root bookmark')).toBeTruthy()

  await rerender({ categories: [root, existing, created], focusCategoryId: created.id })

  await waitFor(() => {
    expect(screen.getByRole('tab', { name: 'Created child 0' }).getAttribute('aria-selected')).toBe('true')
  })
  expect(screen.queryByText('Root bookmark')).toBeNull()
})
