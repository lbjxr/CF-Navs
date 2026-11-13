import { describe, expect, it, vi } from 'vitest'
import { createExtensionBackground } from '../helpers/extensionBackground'

describe('extension panel session ownership', () => {
  it('returns to the real home route and preserves that choice when reopened', async () => {
    const host = createExtensionBackground()
    const context = await host.toolbar()
    expect(context.view).toBe('pending-list')
    expect(await host.send({ type: 'navigate-panel', view: 'popup', panel: context })).toEqual({ ok: true })
    expect(host.state().view).toBe('popup')
    expect(host.state().revision).toBeGreaterThan(context.revision)
    await host.toolbar(2)
    expect(host.state().view).toBe('popup')
    expect(host.calls.at(-1)).toMatchObject({ tabId: 2, message: { type: 'toggle-panel', view: 'popup' } })
  })

  it('restores the latest sync view after moving across three tabs, including an older cached tab', async () => {
    const host = createExtensionBackground()
    await host.toolbar(1)
    host.activate(2)
    host.createBookmark({ id: '33', title: 'New bookmark', url: 'https://new.example/' })
    await vi.waitFor(() => expect(host.state()).toMatchObject({ view: 'sync', tabId: 2 }))
    expect(host.state().drafts.sync?.key).toBe('bookmark:33')
    const context = await host.toolbar(3)
    expect(context.view).toBe('sync')
    await host.toolbar(1)
    expect(host.state().view).toBe('sync')
    expect(host.calls.at(-1)).toMatchObject({ tabId: 1, message: { view: 'sync' } })
  })

  it('keeps bookmark edits and category selection through a worker restart and tab change', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:22'] })
    const context = host.context()
    const draft = { key: 'bookmark:22', title: 'Edited', url: 'https://edited.example/', categoryId: '7', edited: true, scrollY: 42 }
    expect(await host.send({ type: 'save-panel-draft', panel: context, draft })).toEqual({ ok: true })
    host.startWorker()
    await host.toolbar(2)
    expect((await host.send({ type: 'get-panel-context', panel: host.context() }, 2)).draft).toEqual({ ...draft, completed: false })
    const sync = await host.send({ type: 'get-sync-dialog', panel: host.context() }, 2)
    expect(sync).toMatchObject({ ok: true, pending: { key: 'bookmark:22' }, draft })
  })

  it('rejects a delayed draft, navigation or mutation from the old owner', async () => {
    const host = createExtensionBackground()
    const old = await host.toolbar(1)
    await host.toolbar(2)
    await host.send({ type: 'save-panel-draft', panel: host.context(), draft: { selectedKeys: ['bookmark:22'] } }, 2)
    for (const message of [
      { type: 'save-panel-draft', draft: { selectedKeys: ['bookmark:11'] } },
      { type: 'navigate-panel', view: 'popup' },
      { type: 'remove-pending', keys: ['bookmark:11'] },
      { type: 'start-selected-sync', keys: ['bookmark:11'] },
    ]) {
      expect(await host.send({ ...message, panel: old }, 1)).toMatchObject({ ok: false, error: expect.stringContaining('已切换') })
    }
    expect(host.state()).toMatchObject({ view: 'pending-list', tabId: 2, drafts: { 'pending-list': { selectedKeys: ['bookmark:22'] } } })
    expect(host.local.pendingSyncBookmarks).toHaveLength(2)
  })

  it('does not reset the revision or drafts on repeated toolbar clicks in the same tab', async () => {
    const host = createExtensionBackground()
    const initial = await host.toolbar()
    await host.send({ type: 'save-panel-draft', panel: initial, draft: { selectedKeys: ['bookmark:22'] } })
    expect(await host.toolbar()).toEqual(initial)
    expect(host.state().drafts['pending-list']?.selectedKeys).toEqual(['bookmark:22'])
  })

  it('keeps a sync draft when a new bookmark arrives, without overwriting the edited fields', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:22'] })
    const draft = { key: 'bookmark:22', title: 'Keep me', url: 'https://edited.example/', categoryId: '7', edited: true }
    await host.send({ type: 'save-panel-draft', panel: host.context(), draft })
    host.createBookmark({ id: '33', title: 'Later', url: 'https://later.example/' })
    await vi.waitFor(() => expect(host.local.pendingSyncBookmarks).toHaveLength(3))
    await vi.waitFor(() => expect(host.calls.at(-1)?.message.view).toBe('sync'))
    expect(host.state().drafts.sync).toMatchObject(draft)
    expect(host.session.syncSelectionKeys).toEqual(['bookmark:22'])
  })

  it('completes only the selected sync batch instead of advancing into unselected bookmarks', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:22'] })
    const response = await host.send({ type: 'confirm-sync', panel: host.context(), key: 'bookmark:22', categoryId: 7, title: 'Beta', url: 'https://beta.example/' })
    expect(response).toMatchObject({ ok: true, pending: null })
    expect(host.local.pendingSyncBookmarks).toEqual([{ title: 'Alpha', url: 'https://alpha.example/', browserBookmarkId: '11' }])
    expect(host.session.syncSelectionKeys).toEqual([])
    expect(await host.send({ type: 'get-sync-dialog', panel: host.context() })).toMatchObject({ ok: true, pending: null })
    expect(await host.send({ type: 'confirm-sync', panel: host.context(), key: 'bookmark:22', categoryId: 7 })).toMatchObject({ ok: false })
    expect(host.session.syncSelectionKeys).toEqual([])
  })

  it('never substitutes a different bookmark for a stale confirmation key', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:11', 'bookmark:22'] })
    const message = { type: 'confirm-sync', panel: host.context(), key: 'bookmark:11', categoryId: 7, title: 'Alpha', url: 'https://alpha.example/' }
    expect(await host.send(message)).toMatchObject({ ok: true, pending: { key: 'bookmark:22' } })
    expect(await host.send(message)).toMatchObject({ ok: false })
    expect(host.fetch.mock.calls.filter(([url]) => url.endsWith('/api/browser-sync/bookmarks'))).toHaveLength(1)
    expect(host.local.pendingSyncBookmarks).toHaveLength(1)
  })

  it('excludes credentials and arbitrary page data from session drafts', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'navigate-panel', view: 'popup' })
    await host.send({ type: 'save-panel-draft', panel: host.context(), draft: {
      baseUrl: 'https://navigation.example', username: 'sample', expanded: true,
      password: 'do-not-store', token: 'do-not-store', html: '<div>not a draft</div>',
    } })
    expect(host.state().drafts.popup).toEqual({ baseUrl: 'https://navigation.example', username: 'sample', expanded: true, scrollY: 0 })
  })

  it('invalidates the old document after a same-tab page reload binds a new instance', async () => {
    const host = createExtensionBackground()
    const first = { ...await host.toolbar(), instanceId: 'first-document' }
    await host.send({ type: 'get-panel-context', panel: first })
    await host.send({ type: 'save-panel-draft', panel: first, draft: { selectedKeys: ['bookmark:22'] } })
    const rebound = await host.send({ type: 'get-panel-context', panel: { ...first, instanceId: 'reloaded-document' } })
    expect(rebound.revision).toBeGreaterThan(first.revision)
    expect(rebound.draft).toMatchObject({ selectedKeys: ['bookmark:22'] })
    expect(await host.send({ type: 'save-panel-draft', panel: first, draft: { selectedKeys: [] } })).toMatchObject({ ok: false })
  })

  it('rejects old category responses after navigating to a newer page', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:22'] })
    let release!: () => void
    const fetch = host.fetch.getMockImplementation()!
    host.fetch.mockImplementationOnce(async (...args) => {
      await new Promise<void>((resolve) => { release = resolve })
      return fetch(...args)
    })
    const pending = host.send({ type: 'get-sync-dialog', panel: host.context() })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await host.send({ type: 'navigate-panel', view: 'popup', panel: host.context() })
    release()
    expect(await pending).toMatchObject({ ok: false, error: expect.stringContaining('已切换') })
    expect(host.state().view).toBe('popup')
  })

  it('finishes an in-flight sync once after changing tabs and reports the same busy record', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:22'] })
    let release!: () => void
    const fetch = host.fetch.getMockImplementation()!
    host.fetch.mockImplementation(async (...args) => {
      if (args[0].endsWith('/api/browser-sync/bookmarks')) await new Promise<void>((resolve) => { release = resolve })
      return fetch(...args)
    })
    const submitted = host.send({ type: 'confirm-sync', panel: host.context(), key: 'bookmark:22', categoryId: 7 })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    await host.toolbar(2)
    expect(await host.send({ type: 'get-sync-dialog', panel: host.context() }, 2)).toMatchObject({ ok: true, syncing: true, pending: { key: 'bookmark:22' } })
    release()
    expect(await submitted).toMatchObject({ ok: true, pending: null })
    expect(host.fetch.mock.calls.filter(([url]) => url.endsWith('/api/browser-sync/bookmarks'))).toHaveLength(1)
    expect(host.local.pendingSyncBookmarks).toHaveLength(1)
    expect(host.calls.at(-1)).toMatchObject({ tabId: 2, message: { type: 'refresh-panel', view: 'sync' } })
  })

  it('starts a new bookmark after the previous selected batch has completed', async () => {
    const host = createExtensionBackground()
    await host.send({ type: 'start-selected-sync', keys: ['bookmark:22'] })
    await host.send({ type: 'confirm-sync', panel: host.context(), key: 'bookmark:22', categoryId: 7 })
    const completedContext = host.context()
    host.createBookmark({ id: '33', title: 'New', url: 'https://new.example/' })
    await vi.waitFor(() => expect(host.state().drafts.sync?.key).toBe('bookmark:33'))
    await vi.waitFor(() => expect(host.session.syncSelectionKeys).toBeUndefined())
    expect(host.state().revision).toBeGreaterThan(completedContext.revision)
    expect(await host.send({ type: 'hide-current-panel', panel: completedContext })).toMatchObject({ ok: false })
    expect(await host.send({ type: 'get-sync-dialog', panel: host.context() })).toMatchObject({ ok: true, pending: { key: 'bookmark:33' } })
  })
})
