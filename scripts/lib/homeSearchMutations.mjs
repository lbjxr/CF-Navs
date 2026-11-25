// Keep this function self-contained: perf-audit serializes it into the page realm.
/** @param {Iterable<MutationRecord>} records */
export function classifyHomeSearchMutations(records) {
  const cardSelector = '.bookmark-card-shell'
  const iconSelector = '.bookmark-icon, [data-category-icon]'
  const decorationSelector = 'img, span.icon-text, span.category-icon-text'
  const resultSelector = '.bookmark-title, .bookmark-icon-title, .bookmark-description, ' +
    '.bookmark-grid, .bookmark-grid-item, .category-section, .category-scope, [data-section-id], [data-home-category-scope]'
  const containsCard = (node) => Boolean(
    node && ((node.nodeType === 1 && node.matches(cardSelector)) || node.querySelector?.(cardSelector)),
  )
  const isDecoration = (node, boundary) => {
    if (node.nodeType === 3 || node.nodeType === 8) return true
    if (node.nodeType !== 1) return false
    const knownElement = (element) => !element.matches(resultSelector) &&
      (element === boundary || element.matches(decorationSelector))
    return knownElement(node) && Array.from(node.querySelectorAll('*')).every(knownElement)
  }

  let rawRecords = 0
  let resultRecords = 0
  let decorativeRecords = 0
  let cardStructureRecords = 0
  for (const record of records) {
    rawRecords += 1
    const target = record?.target
    const changedNodes = record?.type === 'childList'
      ? [...record.addedNodes, ...record.removedNodes]
      : []
    const element = target?.nodeType === 1 ? target : target?.parentElement
    const boundary = element?.closest?.(iconSelector)
    const changesCardStructure = changedNodes.some(containsCard)
    if (changesCardStructure) cardStructureRecords += 1
    // Check detached removed subtrees as well as live targets. A whole card or
    // unknown structure can never become decorative merely by being inside an icon.
    const decorative = (record?.type === 'childList' || record?.type === 'characterData') &&
      target && boundary && !containsCard(target) && !containsCard(boundary) &&
      !changesCardStructure && isDecoration(boundary, boundary) && isDecoration(element, boundary) &&
      changedNodes.every((node) => isDecoration(node, boundary))
    if (decorative) decorativeRecords += 1
    else resultRecords += 1
  }
  // Return counts only: no DOM references, text, attributes or object identifiers.
  return { rawRecords, resultRecords, decorativeRecords, cardStructureRecords }
}
