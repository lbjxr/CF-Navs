const $ = (id) => document.getElementById(id)
let items = []
let busy = false

function showStatus(message, type = '') {
  $('status').textContent = message
  $('status').className = type
}

function send(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message))
      else if (!response?.ok) reject(new Error(response?.error || '操作失败'))
      else resolve(response)
    })
  })
}

function returnToHome() {
  if (window.parent !== window) {
    window.parent.postMessage({ source: 'cf-navs-extension-panel', type: 'show-panel', view: 'popup' }, '*')
    return
  }
  window.close()
}

function statusText(item) {
  if (item.status === 'missing') return '浏览器收藏中已找不到这条记录，仍保留待同步。'
  if (item.status === 'changed') {
    const current = item.currentUrl || item.currentTitle || '内容已变化'
    return `浏览器收藏信息已变化：${current}`
  }
  return '浏览器收藏仍存在。'
}

function createItem(item) {
  const row = document.createElement('li')
  row.className = `item ${item.status}`

  const checkWrap = document.createElement('label')
  checkWrap.className = 'item-check'
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'item-select'
  checkbox.checked = true
  checkbox.dataset.key = item.key
  checkbox.setAttribute('aria-label', `选择同步 ${item.title || item.url}`)
  checkbox.addEventListener('change', updateSelectionState)
  checkWrap.append(checkbox)

  const body = document.createElement('div')
  body.className = 'item-main'
  const title = document.createElement('strong')
  title.className = 'item-title'
  title.textContent = item.title || item.url || '未命名收藏'
  const url = document.createElement('span')
  url.className = 'item-url'
  url.textContent = item.url || ''
  const state = document.createElement('p')
  state.className = `item-state ${item.status}`
  state.textContent = statusText(item)
  body.append(title, url, state)

  row.append(checkWrap, body)
  return row
}

function getSelectedKeys() {
  return [...document.querySelectorAll('.item-select:checked')].map((input) => input.dataset.key)
}

function updateSelectionState() {
  const checkboxes = [...document.querySelectorAll('.item-select')]
  const selectedCount = getSelectedKeys().length
  $('select-all').disabled = busy || !items.length
  $('refresh').disabled = busy
  $('select-all').checked = checkboxes.length > 0 && selectedCount === checkboxes.length
  $('select-all').indeterminate = selectedCount > 0 && selectedCount < checkboxes.length
  $('remove-selected').disabled = busy || selectedCount === 0
  $('sync-selected').disabled = busy || selectedCount === 0
}

function renderItems() {
  const list = $('list')
  list.replaceChildren()
  if (!items.length) {
    const empty = document.createElement('li')
    empty.className = 'empty'
    empty.textContent = '暂无待同步收藏。'
    list.append(empty)
  } else {
    list.append(...items.map(createItem))
  }
  $('summary').textContent = items.length ? `共 ${items.length} 条，已动态检查浏览器收藏状态` : '没有待同步收藏'
  $('select-all').disabled = busy || !items.length
  $('refresh').disabled = busy
  updateSelectionState()
}

function setBusy(value) {
  busy = value
  $('home').disabled = value
  $('select-all').disabled = value || !items.length
  $('refresh').disabled = value
  if (value) {
    $('remove-selected').disabled = true
    $('sync-selected').disabled = true
  } else {
    updateSelectionState()
  }
}

async function loadItems() {
  setBusy(true)
  showStatus('正在读取浏览器收藏状态...')
  try {
    const response = await send({ type: 'get-pending-list' })
    items = Array.isArray(response.items) ? response.items : []
    renderItems()
    showStatus('状态已更新。', 'success')
  } catch (error) {
    items = []
    renderItems()
    showStatus(error.message || '读取待同步收藏失败。', 'error')
  } finally {
    setBusy(false)
  }
}

async function startSelectedSync() {
  const keys = getSelectedKeys()
  if (!keys.length || busy) return
  setBusy(true)
  showStatus('正在打开同步确认...')
  try {
    await send({ type: 'start-selected-sync', keys })
  } catch (error) {
    showStatus(error.message || '打开同步确认失败。', 'error')
    setBusy(false)
  }
}

async function removeSelected() {
  const keys = getSelectedKeys()
  if (!keys.length || busy) return
  if (!window.confirm(`确定删除选中的 ${keys.length} 条待同步收藏吗？删除后不会再次拉取。`)) return
  setBusy(true)
  showStatus('正在删除待同步记录...')
  try {
    await send({ type: 'remove-pending', keys })
    await loadItems()
  } catch (error) {
    showStatus(error.message || '删除待同步收藏失败。', 'error')
    setBusy(false)
  }
}

$('home').addEventListener('click', returnToHome)
$('refresh').addEventListener('click', loadItems)
$('sync-selected').addEventListener('click', startSelectedSync)
$('remove-selected').addEventListener('click', removeSelected)
$('select-all').addEventListener('change', () => {
  document.querySelectorAll('.item-select').forEach((checkbox) => {
    checkbox.checked = $('select-all').checked
  })
  updateSelectionState()
})

loadItems()
