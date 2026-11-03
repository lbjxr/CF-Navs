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
    chrome.runtime.sendMessage({ type: 'register-web-tab' }, () => void chrome.runtime.lastError)
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

  function showPanel(view = 'popup') {
    const nextView = VIEW_CONFIG[view] ? view : 'popup'
    const config = VIEW_CONFIG[nextView]
    let panel = findPanel()
    if (!panel) {
      panel = document.createElement('iframe')
      panel.dataset.cfNavsPanel = 'true'
      panel.setAttribute('frameborder', '0')
      panel.setAttribute('scrolling', 'no')
      panel.setAttribute('aria-label', config.title)
      panelFrame = panel
      ;(document.body || document.documentElement).append(panel)
    }

    if (panel.dataset.view !== nextView) {
      panel.dataset.view = nextView
      panel.src = chrome.runtime.getURL(config.file)
    }
    applyPanelStyle(panel, nextView)
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
    if (event.data.type === 'close-panel') hidePanel()
    if (event.data.type === 'show-panel') showPanel(event.data.view)
  })

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'toggle-panel') {
      sendResponse(isPanelVisible() ? hidePanel() : showPanel(message.view))
      return false
    }
    if (message?.type === 'show-panel') {
      sendResponse(showPanel(message.view))
      return false
    }
    if (message?.type === 'hide-panel') {
      sendResponse(hidePanel())
      return false
    }
    return false
  })

  if (document.visibilityState === 'visible') registerWebTab()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registerWebTab()
  })
})()
