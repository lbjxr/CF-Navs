// The background owns one resumable panel session for all tabs. Drafts never
// pass through the host page; storage.session expires with the browser session.
globalThis.createPanelSession = function ({ read, write }) {
  const views = ['popup', 'pending-list', 'sync']
  let state = null
  let queue = Promise.resolve()

  function cleanDraft(view, draft = {}) {
    const text = (key) => typeof draft[key] === 'string' ? draft[key] : ''
    const scrollY = Number.isFinite(draft.scrollY) ? Math.max(0, draft.scrollY) : 0
    if (view === 'pending-list') {
      return { selectedKeys: [...new Set((Array.isArray(draft.selectedKeys) ? draft.selectedKeys : [])
        .filter((key) => typeof key === 'string' && key))], scrollY }
    }
    if (view === 'sync') {
      return {
        key: text('key'), title: text('title'), url: text('url'),
        categoryId: text('categoryId'), edited: draft.edited === true,
        completed: draft.completed === true, scrollY,
      }
    }
    // Passwords and tokens are deliberately excluded from resumable form state.
    return { baseUrl: text('baseUrl'), username: text('username'), expanded: draft.expanded === true, scrollY }
  }

  async function load() {
    if (state) return
    const stored = await read()
    state = {
      version: 1,
      view: views.includes(stored?.view) ? stored.view : null,
      revision: Number.isSafeInteger(stored?.revision) && stored.revision >= 0 ? stored.revision : 0,
      tabId: Number.isInteger(stored?.tabId) ? stored.tabId : null,
      instanceId: typeof stored?.instanceId === 'string' ? stored.instanceId : null,
      drafts: {},
    }
    for (const view of views) {
      if (stored?.drafts?.[view]) state.drafts[view] = cleanDraft(view, stored.drafts[view])
    }
  }

  function run(operation) {
    const result = queue.then(async () => { await load(); return operation() })
    queue = result.catch(() => undefined)
    return result
  }

  const copy = () => structuredClone(state)
  const routeMatches = (context) => context && context.view === state.view &&
    context.revision === state.revision && context.tabId === state.tabId
  const matches = (context) => routeMatches(context) &&
    (!state.instanceId || context.instanceId === state.instanceId)
  async function persist() { await write(copy()) }

  return {
    get: () => run(copy),
    isCurrent: (context) => run(() => Boolean(matches(context))),
    bind: (context) => run(async () => {
      if (!routeMatches(context)) throw new Error('弹窗已切换，请在当前页面继续操作')
      if (context.instanceId && context.instanceId !== state.instanceId) {
        if (state.instanceId) state.revision += 1
        state.instanceId = context.instanceId
        await persist()
      }
      return copy()
    }),
    open: (view, tabId) => run(async () => {
      if (!views.includes(view)) throw new Error('未知的扩展页面')
      if (state.view !== view || state.tabId !== tabId) {
        state.view = view
        state.tabId = tabId
        state.instanceId = null
        state.revision += 1
        await persist()
      }
      return copy()
    }),
    saveDraft: (context, draft) => run(async () => {
      if (!matches(context)) return false
      state.drafts[context.view] = cleanDraft(context.view, draft)
      await persist()
      return true
    }),
    prepareSync: (key, preserveCurrent) => run(async () => {
      const draft = state.drafts.sync
      if (!preserveCurrent || !draft?.key || draft.completed) {
        if (draft?.key !== key || draft?.completed) {
          state.drafts.sync = cleanDraft('sync', { key })
          // A new sync intent also invalidates delayed responses/close timers
          // from the previous bookmark, even when the view and tab are unchanged.
          if (state.view === 'sync') {
            state.revision += 1
            state.instanceId = null
          }
        }
      }
      await persist()
    }),
    finishSync: (key, nextKey) => run(async () => {
      // A completed request in an old tab must not erase a newer bookmark draft.
      if (state.drafts.sync?.key === key) {
        state.drafts.sync = cleanDraft('sync', { key: nextKey || '', completed: !nextKey })
        await persist()
      }
    }),
    forgetTab: (tabId) => run(async () => {
      if (state.tabId === tabId) {
        state.tabId = null
        state.instanceId = null
        state.revision += 1
        await persist()
      }
    }),
  }
}
