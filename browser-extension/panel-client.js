// Extension-page bridge. The host receives navigation/visibility messages only;
// drafts are exchanged directly with the background, scoped to the current view.
globalThis.createPanelClient = function (view, readDraft, onResume) {
  const revision = Number(new URL(location.href).searchParams.get('panel'))
  const context = revision > 0 ? { view, revision, instanceId: crypto.randomUUID() } : null
  let ready = false
  let saving = Promise.resolve()

  function send(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ ...message, ...(context ? { panel: context } : {}) }, (response) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
          else if (!response?.ok) reject(new Error(response?.error || '操作失败'))
          else resolve(response)
        })
      } catch (error) { reject(error) }
    })
  }

  function save() {
    if (!ready || !context) return Promise.resolve()
    const draft = { ...readDraft(), scrollY: window.scrollY }
    // Send every edit immediately; there is no debounce to lose the last edit
    // when a tab navigates or is discarded. The background serializes writes.
    saving = send({ type: 'save-panel-draft', draft }).catch((error) => {
      if (!error.message.includes('已切换')) console.warn('[CF-Navs] 未能保存弹窗草稿', error)
    })
    return saving
  }

  document.addEventListener('input', save)
  document.addEventListener('change', save)
  document.addEventListener('toggle', save, true)
  window.addEventListener('scroll', save, { passive: true })
  window.addEventListener('pagehide', save)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') save()
  })
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.source !== 'cf-navs-extension-host') return
    if (event.data.type !== 'resume-panel' || event.data.revision !== (context?.revision || 0) || !ready) return
    Promise.resolve(onResume()).catch((error) => console.warn('[CF-Navs] 刷新弹窗失败', error))
  })

  return {
    send, save,
    async restore() {
      if (!context) { ready = true; return null }
      const response = await send({ type: 'get-panel-context' })
      context.revision = response.revision
      if (window.parent !== window) window.parent.postMessage({
        source: 'cf-navs-extension-panel', type: 'panel-ready', revision: context.revision,
      }, '*')
      ready = true
      return response.draft || null
    },
    async navigate(nextView) {
      await save()
      await send({ type: 'navigate-panel', view: nextView })
    },
    async close() {
      await save()
      await send({ type: 'hide-current-panel' })
    },
  }
}
