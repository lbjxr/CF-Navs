const $ = (id) => document.getElementById(id)
let pending = null
let busy = false

function showStatus(message, type = '') {
  $('status').textContent = message
  $('status').className = type
}

function closePanel() {
  if (window.parent !== window) {
    window.parent.postMessage({ source: 'cf-navs-extension-panel', type: 'close-panel' }, '*')
    return
  }
  window.close()
}

function returnToHome() {
  const showHome = () => {
    if (window.parent !== window) {
      window.parent.postMessage({ source: 'cf-navs-extension-panel', type: 'show-panel', view: 'popup' }, '*')
      return
    }
    window.close()
  }
  chrome.runtime.sendMessage({ type: 'clear-sync-selection' }, () => {
    void chrome.runtime.lastError
    showHome()
  })
}

function setBusy(value) {
  busy = value
  $('sync').disabled = value || !pending || !$('category').value
  $('later').disabled = value
  $('category').disabled = value
  $('bookmark-title').disabled = value || !pending
  $('bookmark-url').disabled = value || !pending
  $('sync').textContent = value ? '正在同步...' : '确认同步'
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

function renderBookmark(item) {
  $('bookmark-title').value = item.title || item.url || ''
  $('bookmark-url').value = item.url || ''
  $('bookmark-title').disabled = false
  $('bookmark-url').disabled = false
}

function readBookmark() {
  const title = $('bookmark-title').value.trim()
  const url = $('bookmark-url').value.trim()
  if (!title) {
    showStatus('请输入书签标题。', 'error')
    $('bookmark-title').focus()
    return null
  }

  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) throw new Error()
  } catch {
    showStatus('请输入有效的书签 URL（需以 http:// 或 https:// 开头）。', 'error')
    $('bookmark-url').focus()
    return null
  }

  return { title, url }
}

function renderCategories(categories, selectedId) {
  const select = $('category')
  select.replaceChildren()
  if (!categories.length) {
    select.append(new Option('暂无分类，请先在导航页创建', ''))
    select.disabled = true
    $('sync').disabled = true
    return
  }
  const byId = new Map(categories.map((category) => [Number(category.id), category]))
  const roots = categories.filter((category) => category.parent_id == null)
  for (const root of roots) {
    select.append(new Option(root.title, String(root.id)))
    for (const child of categories.filter((category) => Number(category.parent_id) === Number(root.id))) {
      select.append(new Option(`　${root.title} / ${child.title}`, String(child.id)))
    }
  }
  const validSelection = byId.has(Number(selectedId)) ? String(selectedId) : String(roots[0].id)
  select.value = validSelection
  select.disabled = false
  $('sync').disabled = false
}

async function initialize() {
  try {
    const response = await send({ type: 'get-sync-dialog' })
    pending = response.pending
    renderBookmark(pending)
    const categories = response.categories
      .slice()
      .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0) || Number(a.id) - Number(b.id))
    renderCategories(categories, response.selectedCategoryId)
    showStatus(pending.count > 1 ? `还有 ${pending.count} 条待同步收藏，将逐条确认。` : '')
  } catch (error) {
    renderCategories([], null)
    $('later').textContent = '关闭'
    showStatus(`${error.message || '无法读取收藏或分类'} 收藏仍保留，可从扩展窗口重试。`, 'error')
  }
}

$('sync').addEventListener('click', async () => {
  if (!pending || busy || !$('category').value) return
  const bookmark = readBookmark()
  if (!bookmark) return
  setBusy(true)
  showStatus('正在写入导航页...')
  try {
    const response = await send({
      type: 'confirm-sync',
      categoryId: Number($('category').value),
      title: bookmark.title,
      url: bookmark.url,
    })
    if (response.pending) {
      pending = response.pending
      renderBookmark(pending)
      showStatus(`已同步，剩余 ${pending.count} 条待确认。`, 'success')
    } else {
      showStatus('全部收藏已同步，可以关闭窗口。', 'success')
      $('sync').disabled = true
      $('later').textContent = '关闭'
      pending = null
      window.setTimeout(closePanel, 900)
    }
  } catch (error) {
    showStatus(error.message || '同步失败，收藏仍保留在待同步列表。', 'error')
  } finally {
    setBusy(false)
    if (!pending) $('sync').disabled = true
  }
})

$('later').addEventListener('click', returnToHome)

initialize()
