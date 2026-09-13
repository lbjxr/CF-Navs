import { isDeepStrictEqual } from 'node:util'

// A child with bookmarks plus excluded bookmarks proves more than exporting an empty root.
export function pickExportSample(data) {
  const categories = new Map(data.categories.map((category) => [Number(category.id), category]))
  const counts = new Map()
  for (const bookmark of data.bookmarks) {
    const id = Number(bookmark.category_id)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const candidates = data.categories.filter((category) => {
    if (category.parent_id == null) return false
    const parent = categories.get(Number(category.parent_id))
    const count = counts.get(Number(category.id)) ?? 0
    return parent?.parent_id === null && count > 0 && count < data.bookmarks.length
  })
  candidates.sort((a, b) => counts.get(Number(b.id)) - counts.get(Number(a.id)) || Number(a.id) - Number(b.id))
  const child = candidates[0]
  if (!child) return null

  const rootId = Number(child.parent_id)
  const children = data.categories
    .filter((category) => category.parent_id != null && Number(category.parent_id) === rootId)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || Number(a.id) - Number(b.id))
  return {
    rootId,
    childId: Number(child.id),
    childIndex: children.findIndex((category) => Number(category.id) === Number(child.id)),
    rootCategoryIds: [rootId, ...children.map((category) => Number(category.id))],
  }
}

// Compare every record, not just counts: a full backup or a leaked parent bookmark must fail.
export function verifyExportDownload(source, download, selectedIds, includeSettings) {
  const selected = new Set(selectedIds)
  const expectedCategories = new Set(selected)
  for (const category of source.categories) {
    if (selected.has(Number(category.id)) && category.parent_id != null) {
      expectedCategories.add(Number(category.parent_id))
    }
  }
  const categories = source.categories.filter((category) => expectedCategories.has(Number(category.id)))
  const bookmarks = source.bookmarks.filter((bookmark) => selected.has(Number(bookmark.category_id)))
  const matches = (actual, expected) => {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false
    const byId = new Map(actual.map((record) => [record?.id, record]))
    return byId.size === actual.length && expected.every((record) => isDeepStrictEqual(byId.get(record.id), record))
  }
  const payload = download?.payload
  const formatValid = download?.mime === 'application/json' && download.bytes > 0 &&
    /^cf-navs-backup-\d{4}-\d{2}-\d{2}\.json$/.test(download.fileName) &&
    payload?.version === 2 && Number.isSafeInteger(payload.exported_at) && payload.exported_at > 0
  const categoriesMatch = matches(payload?.categories, categories)
  const bookmarksMatch = matches(payload?.bookmarks, bookmarks)
  const settingsMatch = isDeepStrictEqual(payload?.settings, includeSettings ? source.settings : null)
  return {
    passed: formatValid && categoriesMatch && bookmarksMatch && settingsMatch,
    formatValid,
    categoriesMatch,
    bookmarksMatch,
    settingsMatch,
    categories: payload?.categories?.length ?? 0,
    bookmarks: payload?.bookmarks?.length ?? 0,
    expectedCategories: categories.length,
    expectedBookmarks: bookmarks.length,
    bytes: download?.bytes ?? 0,
  }
}

// These functions run in the page through CdpSession.call; they cannot capture module state.
export async function pageReadExportSource(origin, token) {
  const response = await fetch(`${origin}/api/admin/data`, {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  const body = await response.json()
  if (!response.ok || body?.code !== 0 || !Array.isArray(body.data?.categories) || !Array.isArray(body.data?.bookmarks)) {
    throw new Error(`Cannot read export source: HTTP ${response.status}, code ${body?.code}`)
  }
  return body.data
}

export function pageInstallExportCapture() {
  if (window.__cfNavsExportCapture) throw new Error('Export capture is already installed')
  const capture = {
    createObjectURL: URL.createObjectURL,
    click: HTMLAnchorElement.prototype.click,
    blobs: new Map(),
    downloads: [],
  }
  window.__cfNavsExportCapture = capture
  URL.createObjectURL = function(value) {
    const url = capture.createObjectURL.call(URL, value)
    if (value instanceof Blob) capture.blobs.set(url, value)
    return url
  }
  HTMLAnchorElement.prototype.click = function() {
    const blob = capture.blobs.get(this.href)
    if (blob && this.download) {
      // Capture the application's actual Blob at its download boundary, never a probe-built payload.
      // Do not invoke the native download: production backup contents must remain in memory.
      capture.downloads.push({ blob, fileName: this.download })
      return
    }
    return capture.click.call(this)
  }
  return true
}

export async function pageReadExportDownload(index) {
  const downloads = window.__cfNavsExportCapture?.downloads
  if (!downloads || downloads.length <= index) return null
  if (downloads.length !== index + 1) throw new Error('One export action triggered multiple downloads')
  const { blob, fileName } = downloads[index]
  let payload
  try {
    payload = JSON.parse(await blob.text())
  } catch {
    throw new Error('Application export is not valid JSON')
  }
  return { fileName, mime: blob.type, bytes: blob.size, payload }
}

export function pageRestoreExportCapture() {
  const capture = window.__cfNavsExportCapture
  if (!capture) return false
  URL.createObjectURL = capture.createObjectURL
  HTMLAnchorElement.prototype.click = capture.click
  delete window.__cfNavsExportCapture
  return true
}

export async function pageExportControl(kind, sample) {
  let element
  const operation = document.querySelector('.export-operation')
  if (kind === 'backup') {
    element = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === '数据备份与导入')
  } else if (kind === 'clear') {
    element = [...(operation?.querySelectorAll('.export-selection-toolbar button') ?? [])]
      .find((button) => button.textContent.trim() === '清空')
  } else if (kind === 'settings') {
    element = operation?.querySelector('.settings-toggle input')
  } else if (kind === 'export') {
    element = operation?.querySelector('button.primary-button')
  } else if (kind === 'child' || kind === 'root') {
    const children = document.getElementById(`export-category-children-${sample.rootId}`)
    element = kind === 'child'
      ? children?.querySelectorAll('.category-tree-row-child input')[sample.childIndex]
      : children?.closest('.category-tree-root')?.querySelector('.category-tree-row-root input')
  } else {
    throw new Error(`Unknown export control: ${kind}`)
  }
  if (!element) return null
  element.scrollIntoView({ block: 'center', inline: 'center' })
  await new Promise((resolve) => requestAnimationFrame(resolve))
  const rect = element.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    disabled: Boolean(element.disabled),
    checked: Boolean(element.checked),
    indeterminate: Boolean(element.indeterminate),
  }
}
