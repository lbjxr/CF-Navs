// Read-only DOM measurements; host orchestration sends real CDP input.
export function pageModalMetrics() {
  const rect = (element) => {
    if (!element) return null
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      width: box.width, height: box.height, borderRadius: style.borderRadius,
      visible: box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0,
      overflowsViewport: box.left < -0.5 || box.right > innerWidth + 0.5 || box.top < -0.5 || box.bottom > innerHeight + 0.5,
    }
  }
  const category = document.querySelector('[aria-labelledby="category-modal-title"]')
  const card = document.querySelector('[data-testid="bookmark-modal"]')
  const results = { categoryModal: rect(category), bookmarkModal: rect(card), bookmarkActions: null }
  // Match the actual BookmarkModalActions contract, not an arbitrary footer.
  const bar = card?.querySelector('form > .modal-actions')
  if (bar) {
    const bounds = bar.getBoundingClientRect(), cardBounds = card.getBoundingClientRect()
    const buttons = [...bar.querySelectorAll('button')]
    const visible = buttons.filter((button) => rect(button).visible)
    const tops = visible.map((button) => button.getBoundingClientRect().top)
    const cancel = visible.find((button) => button.type === 'button' && button.textContent.trim() === '取消')
    const save = visible.find((button) => button.type === 'submit' && button.textContent.trim() === '保存')
    results.bookmarkActions = {
      ...rect(bar), buttons: visible.length, hasCancel: Boolean(cancel), hasSave: Boolean(save),
      cancelEnabled: Boolean(cancel && !cancel.disabled),
      wrapped: tops.length > 0 && Math.max(...tops) - Math.min(...tops) > 1,
      overflowsCard: bounds.left < cardBounds.left - 0.5 || bounds.right > cardBounds.right + 0.5 || bounds.top < cardBounds.top - 0.5 || bounds.bottom > cardBounds.bottom + 0.5,
      buttonsInside: visible.every((button) => {
        const b = button.getBoundingClientRect()
        return b.left >= bounds.left - 0.5 && b.right <= bounds.right + 0.5 && b.top >= bounds.top - 0.5 && b.bottom <= bounds.bottom + 0.5
      }),
      hitTargets: visible.every((button) => {
        const b = button.getBoundingClientRect(), hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
        return hit === button || button.contains(hit)
      }),
    }
  }
  return { viewportWidth: innerWidth, results }
}

export function assessModalActions(actions) {
  const failures = []
  if (!actions) return { passed: false, failures: ['missing-action-bar'] }
  if (!actions.visible || !Number.isFinite(actions.width) || !Number.isFinite(actions.height) || actions.width <= 0 || actions.height <= 0) failures.push('hidden-action-bar')
  if (actions.buttons !== 2 || !actions.hasCancel || !actions.hasSave || !actions.cancelEnabled) failures.push('missing-required-controls')
  for (const key of ['wrapped', 'overflowsViewport', 'overflowsCard']) if (actions[key] !== false) failures.push(key)
  for (const key of ['buttonsInside', 'hitTargets']) if (actions[key] !== true) failures.push(key)
  return { passed: failures.length === 0, failures }
}

export async function pageModalControl(kind) {
  const find = () => {
    if (kind === 'category') return document.querySelector('[data-testid="home-create-root-category"]')
    if (kind === 'category-cancel') return document.querySelector('[aria-labelledby="category-modal-title"] .modal-header button')
    if (kind === 'actions') return document.querySelector('[data-testid="home-actions-menu-trigger"]')
    if (kind === 'desktop-add') return document.querySelector('.section-actions button[aria-label="新增书签"]')
    if (kind === 'field') return document.querySelector('[data-testid="bookmark-modal"] input[type="text"]')
    if (kind === 'more') return document.querySelector('[data-home-category-scope] .scope-more-trigger')
    if (kind === 'add') return [...document.querySelectorAll('.scope-more-item')].find((e) => e.textContent.trim() === '新增书签')
    if (kind === 'cancel') return [...document.querySelectorAll('[data-testid="bookmark-modal"] form > .modal-actions button')].find((e) => e.type === 'button' && e.textContent.trim() === '取消')
    throw new Error('Unknown modal control: ' + kind)
  }
  const element = find()
  if (!element || element.disabled) return null
  let box = element.getBoundingClientRect()
  const style = getComputedStyle(element)
  if (!box.width || !box.height || style.visibility === 'hidden' || style.display === 'none') return null
  if (box.top < 0 || box.bottom > innerHeight || box.left < 0 || box.right > innerWidth) {
    element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' })
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
  box = element.getBoundingClientRect()
  const x = box.left + box.width / 2, y = box.top + box.height / 2
  const hit = document.elementFromPoint(x, y)
  return hit === element || element.contains(hit) ? { x, y } : null
}

export function pageModalsClosed() {
  return !document.querySelector('[data-testid="bookmark-modal"], [aria-labelledby="category-modal-title"], .confirm-dialog, .link-modal')
}

export async function waitForModal(read, label, timeoutMs = 10000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const value = await read()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 80))
  }
  throw new Error('Modal probe timed out: ' + label)
}

// Negative controls mutate only this test page's DOM and are restored in finally.
export function pageModalFault(mode, saved) {
  const bar = document.querySelector('[data-modal-acceptance-fault]') ?? document.querySelector('[data-testid="bookmark-modal"] form > .modal-actions')
  if (!bar) throw new Error('Negative control requires an action bar')
  const buttons = [...bar.querySelectorAll('button')]
  if (mode === 'restore') {
    if (saved.style == null) bar.removeAttribute('style'); else bar.setAttribute('style', saved.style)
    bar.className = saved.className
    buttons.forEach((button, i) => { if (saved.buttonStyles[i] == null) button.removeAttribute('style'); else button.setAttribute('style', saved.buttonStyles[i]) })
    bar.removeAttribute('data-modal-acceptance-fault')
    document.querySelector('[data-modal-acceptance-overlay]')?.remove()
    return true
  }
  const original = { className: bar.className, style: bar.getAttribute('style'), buttonStyles: buttons.map((b) => b.getAttribute('style')) }
  bar.setAttribute('data-modal-acceptance-fault', 'true')
  if (mode === 'missing') bar.classList.remove('modal-actions')
  else if (mode === 'empty') buttons.forEach((b) => { b.style.display = 'none' })
  else if (mode === 'hidden') bar.style.visibility = 'hidden'
  else if (mode === 'overflow') bar.style.transform = 'translateX(2000px)'
  else if (mode === 'covered') {
    const overlay = document.createElement('div')
    overlay.setAttribute('data-modal-acceptance-overlay', 'true')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:transparent;pointer-events:auto'
    document.body.append(overlay)
  } else throw new Error('Unknown modal fault: ' + mode)
  return original
}
