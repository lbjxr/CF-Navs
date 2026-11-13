(() => {
  if (globalThis.__CF_NAVS_PANEL_CONTROLLER__) return
  globalThis.__CF_NAVS_PANEL_CONTROLLER__ = true

  const PANEL_SOURCE = 'cf-navs-extension-panel'
  const CONTENT_SOURCE = 'cf-navs-extension-content'

  // Pointer events do not bubble out of an iframe. Child web pages report the
  // interaction; only the top page owns the extension panel and its visibility.
  if (window.top !== window) {
    document.addEventListener('pointerdown', () => {
      window.top.postMessage({ source: CONTENT_SOURCE, type: 'outside-pointerdown' }, '*')
    }, true)
    return
  }

  const VIEW_CONFIG = {
    popup: {
      file: 'popup.html',
      width: 400,
      height: 690,
      title: 'CF-Navs 浏览器书签同步',
    },
    sync: {
      file: 'sync-dialog.html',
      width: 430,
      height: 620,
      title: '同步书签到 CF-Navs',
    },
    'pending-list': {
      file: 'pending-list.html',
      width: 460,
      height: 690,
      title: '待同步浏览器收藏',
    },
  }

  let panelFrame = null

  function registerWebTab() {
    // Reloading an extension invalidates old content scripts until the web page
    // is refreshed. A visibility event from that old document must be harmless.
    if (!chrome.runtime?.id) return
    try {
      chrome.runtime.sendMessage({ type: 'register-web-tab' }, () => void chrome.runtime.lastError)
    } catch { /* The extension was reloaded while this page remained open. */ }
  }

  function findPanel() {
    if (panelFrame?.isConnected) return panelFrame
    panelFrame = document.querySelector('iframe[data-cf-navs-panel="true"]')
    return panelFrame
  }

  function isPanelVisible() {
    const panel = findPanel()
    return Boolean(panel && !panel.hidden && panel.style.display !== 'none')
  }

  function applyPanelStyle(panel, view) {
    const config = VIEW_CONFIG[view] || VIEW_CONFIG.popup
    panel.title = config.title
    panel.hidden = false
    panel.style.cssText = [
      'position: fixed !important',
      'top: 16px !important',
      'right: 12px !important',
      `width: min(${config.width}px, calc(100vw - 24px)) !important`,
      `height: min(${config.height}px, calc(100vh - 32px)) !important`,
      'max-width: calc(100vw - 24px) !important',
      'max-height: calc(100vh - 32px) !important',
      'min-width: 0 !important',
      'min-height: 0 !important',
      'display: block !important',
      'visibility: visible !important',
      'opacity: 1 !important',
      'border: 0 !important',
      'border-radius: 16px !important',
      'background: #f6f8fc !important',
      'box-shadow: 0 18px 50px rgba(25, 35, 56, .28) !important',
      'z-index: 2147483647 !important',
    ].join(';')
  }

  function resumePanel(panel) {
    panel.contentWindow?.postMessage({
      source: 'cf-navs-extension-host', type: 'resume-panel',
      revision: Number(panel.dataset.revision || 0),
    }, '*')
  }

  function showPanel(view = 'popup', revision = 0) {
    const nextView = VIEW_CONFIG[view] ? view : 'popup'
    const config = VIEW_CONFIG[nextView]
    if (document.visibilityState === 'hidden') return { ok: true, visible: false, view: nextView }
    let panel = findPanel()
    const replace = panel && (panel.dataset.view !== nextView || panel.dataset.revision !== String(revision))
    if (!panel || replace) {
      // A view/session transition creates an actual new document. Updating the
      // old frame's size and data-view alone can leave its old content visible.
      const previous = panel
      panel = document.createElement('iframe')
      panel.dataset.cfNavsPanel = 'true'
      panel.dataset.view = nextView
      panel.dataset.revision = String(revision)
      panel.setAttribute('frameborder', '0')
      panel.setAttribute('scrolling', 'no')
      panel.setAttribute('aria-label', config.title)
      const url = new URL(chrome.runtime.getURL(config.file))
      if (revision) url.searchParams.set('panel', String(revision))
      panel.src = url.href
      applyPanelStyle(panel, nextView)
      panelFrame = panel
      ;(document.body || document.documentElement).append(panel)
      previous?.remove()
    } else {
      applyPanelStyle(panel, nextView)
      resumePanel(panel)
    }
    return { ok: true, visible: true, view: nextView }
  }

  function hidePanel() {
    const panel = findPanel()
    if (!panel) return { ok: true, visible: false }
    panel.hidden = true
    panel.style.setProperty('display', 'none', 'important')
    return { ok: true, visible: false, view: panel.dataset.view || 'popup' }
  }

  document.addEventListener('pointerdown', (event) => {
    if (isPanelVisible() && !event.composedPath().includes(findPanel())) hidePanel()
  }, true)

  window.addEventListener('message', (event) => {
    const panel = findPanel()
    if (!panel) return
    if (event.data?.source === CONTENT_SOURCE && event.data.type === 'outside-pointerdown') {
      if (event.source && event.source !== window && event.source !== panel.contentWindow) hidePanel()
      return
    }
    if (event.source !== panel.contentWindow || event.data?.source !== PANEL_SOURCE) return
    if (event.data.type === 'panel-ready' && Number.isSafeInteger(event.data.revision) &&
        event.data.revision >= Number(panel.dataset.revision)) {
      panel.dataset.revision = String(event.data.revision)
    }
    if (event.data.type === 'close-panel') hidePanel()
    if (event.data.type === 'show-panel' && event.data.view === 'popup') {
      chrome.runtime.sendMessage({
        type: 'navigate-panel', view: 'popup',
        panel: { view: panel.dataset.view, revision: Number(panel.dataset.revision) },
      }, () => void chrome.runtime.lastError)
    }
  })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'toggle-panel') {
      const panel = findPanel()
      const sameSession = panel?.dataset.view === message.view &&
        panel?.dataset.revision === String(message.revision || 0)
      sendResponse(isPanelVisible() && sameSession ? hidePanel() : showPanel(message.view, message.revision))
      return false
    }
    if (message?.type === 'show-panel') {
      sendResponse(showPanel(message.view, message.revision))
      return false
    }
    if (message?.type === 'hide-panel') {
      sendResponse(hidePanel())
      return false
    }
    if (message?.type === 'refresh-panel') {
      const panel = findPanel()
      if (panel?.dataset.view === message.view && panel.dataset.revision === String(message.revision || 0)) resumePanel(panel)
      sendResponse({ ok: true, visible: isPanelVisible() })
      return false
    }
    return false
  })

  if (document.visibilityState === 'visible') registerWebTab()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registerWebTab()
    else hidePanel()
  })
  window.addEventListener('pagehide', hidePanel)
})()
