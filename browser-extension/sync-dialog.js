const $ = (id) => document.getElementById(id)
let pending = null
let busy = false
let loading = false
let refreshQueued = false
let remoteSyncing = false
let draft = null
let edited = false
const panel = createPanelClient('sync', readDraft, initialize)

function readDraft() {
  if (!pending) return draft || {}
  return {
    key: pending.key, title: $('bookmark-title').value, url: $('bookmark-url').value,
    categoryId: $('category').value, edited,
  }
}

function showStatus(message, type = '') {
  $('status').textContent = message
  $('status').className = type
}

function closePanel() {
  panel.close().catch(() => undefined)
}

async function returnToHome() {
  try { await panel.navigate('popup') }
  catch (error) { showStatus(error.message || '返回首页失败，请重试。', 'error') }
}

function setBusy(value) {
  busy = value
  const locked = value || remoteSyncing
  $('sync').disabled = locked || !pending || !$('category').value
  $('later').disabled = value
  $('category').disabled = locked || !pending
  $('bookmark-title').disabled = locked || !pending
  $('bookmark-url').disabled = locked || !pending
  $('sync').textContent = locked ? '正在同步...' : '确认同步'
}

function send(message) {
  return panel.send(message)
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
  const validSelection = byId.has(Number(selectedId)) ? String(selectedId)
    : selectedId ? '' : String(roots[0]?.id || '')
  if (!validSelection) select.prepend(new Option('请选择有效分类', ''))
  select.value = validSelection
  select.disabled = false
  $('sync').disabled = false
}

async function initialize() {
  if (busy || loading) { refreshQueued = true; return }
  loading = true
  try {
    const response = await send({ type: 'get-sync-dialog' })
    if (!response.pending) {
      pending = null
      draft = { completed: true }
      remoteSyncing = false
      showStatus('当前批次已处理完成，可返回首页查看其他待同步收藏。', 'success')
      $('later').textContent = '返回首页'
      setBusy(false)
      await panel.save()
      return
    }
    const sameBookmark = pending?.key === response.pending.key
    const saved = response.draft?.key === response.pending.key ? response.draft
      : draft?.key === response.pending.key ? draft : null
    const selectedCategory = sameBookmark ? $('category').value : saved?.categoryId || response.selectedCategoryId
    if (!sameBookmark) {
      edited = saved?.edited === true
      renderBookmark(edited ? saved : response.pending)
    }
    pending = response.pending
    remoteSyncing = response.syncing === true
    draft = null
    const categories = response.categories
      .slice()
      .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0) || Number(a.id) - Number(b.id))
    renderCategories(categories, selectedCategory)
    showStatus(remoteSyncing ? '正在同步此收藏，请等待结果。'
      : pending.count > 1 ? `还有 ${pending.count} 条待同步收藏，将逐条确认。` : '')
    setBusy(false)
    await panel.save()
    if (!sameBookmark && saved?.scrollY) window.scrollTo(0, saved.scrollY)
  } catch (error) {
    remoteSyncing = false
    if (!pending) renderCategories([], null)
    else setBusy(false)
    showStatus(`${error.message || '无法读取收藏或分类'} 收藏仍保留，可从扩展窗口重试。`, 'error')
  } finally {
    loading = false
    if (refreshQueued && !busy) { refreshQueued = false; initialize() }
  }
}

for (const id of ['bookmark-title', 'bookmark-url', 'category']) {
  $(id).addEventListener('input', () => { edited = true })
  $(id).addEventListener('change', () => {
    edited = true
    if (id === 'category') setBusy(busy)
  })
}

$('sync').addEventListener('click', async () => {
  if (!pending || busy || remoteSyncing || !$('category').value) return
  const bookmark = readBookmark()
  if (!bookmark) return
  setBusy(true)
  showStatus('正在写入导航页...')
  try {
    await panel.save()
    const response = await send({
      type: 'confirm-sync',
      key: pending.key,
      categoryId: Number($('category').value),
      title: bookmark.title,
      url: bookmark.url,
    })
    if (response.pending) {
      pending = response.pending
      edited = false
      renderBookmark(pending)
      showStatus(`已同步，剩余 ${pending.count} 条待确认。`, 'success')
    } else {
      showStatus('当前批次已同步，可以返回首页。', 'success')
      $('sync').disabled = true
      $('later').textContent = '返回首页'
      pending = null
      draft = { completed: true }
      window.setTimeout(closePanel, 900)
    }
  } catch (error) {
    showStatus(error.message || '同步失败，收藏仍保留在待同步列表。', 'error')
  } finally {
    setBusy(false)
    await panel.save()
    if (!pending) $('sync').disabled = true
    if (refreshQueued) { refreshQueued = false; initialize() }
  }
})

$('later').addEventListener('click', returnToHome)

panel.restore().then((saved) => {
  draft = saved
  return initialize()
}).catch((error) => showStatus(error.message || '读取同步草稿失败。', 'error'))
