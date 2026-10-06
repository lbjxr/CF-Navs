// Pure assertions: no DOM, networking, storage or production-data dependencies.
export function compareIconSamples(baseline, next) {
  const errors = []
  const groups = rows => {
    const result = new Map()
    for (const row of rows) {
      const group = result.get(row.key) ?? []
      group.push(row); result.set(row.key, group)
    }
    return result
  }
  const before = groups(baseline), after = groups(next)
  if (!baseline.length) errors.push('empty-baseline')
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(key) ?? [], b = after.get(key) ?? []
    if (a.length !== b.length) errors.push(`instance-count:${key}`)
    // This is only a non-regression comparison, NOT proof of image identity.
    if (a.filter(row => row.loaded).length > b.filter(row => row.loaded).length) errors.push(`image-regression:${key}`)
    if (b.some(row => row.broken)) errors.push(`broken-image:${key}`)
  }
  return { passed: errors.length === 0, errors, assurance: 'display-non-regression-only' }
}

// Expected manifest is authored independently of the observed page. Missing,
// duplicate, unexpected, unreadable and wrong-image results all fail closed.
export function evaluateIconFixtures(expected, observed) {
  const errors = []
  const keys = new Set()
  if (!expected.length) errors.push('empty-manifest')
  for (const fixture of expected) {
    if (!fixture.key || keys.has(fixture.key)) errors.push(`invalid-key:${fixture.key}`)
    keys.add(fixture.key)
    const matches = observed.filter(row => row.key === fixture.key)
    if (matches.length !== 1) { errors.push(`instance-count:${fixture.key}`); continue }
    const row = matches[0]
    if (row.error || row.kind !== fixture.kind) { errors.push(`display:${fixture.key}`); continue }
    if (fixture.kind === 'image') {
      if (!row.loaded || !Array.isArray(fixture.pixels) || !fixture.pixels.length ||
          JSON.stringify(row.pixels) !== JSON.stringify(fixture.pixels)) errors.push(`image-content:${fixture.key}`)
    } else if (fixture.kind === 'text') {
      if (!fixture.text || row.text !== fixture.text) errors.push(`text-content:${fixture.key}`)
    } else errors.push(`unsupported-kind:${fixture.key}`)
  }
  for (const row of observed) if (!keys.has(row.key)) errors.push(`unexpected:${row.key}`)
  return { passed: errors.length === 0, errors, assurance: 'fixture-pixel-signature' }
}

// Serializable CDP page function. It reads the actual displayed image; it never
// fetches a replacement image and never treats canvas/CORS failures as success.
export async function collectIconFixtures(manifest) {
  const rows = []
  for (const fixture of manifest) {
    for (const element of document.querySelectorAll(fixture.selector)) {
      const image = element.matches('img') ? element : element.querySelector('img')
      const row = { key: fixture.key, kind: image ? 'image' : 'text', text: element.textContent.trim(), loaded: false }
      if (image) {
        try {
          let timer
          try { await Promise.race([image.decode(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Image decode timed out')), 1500) })]) }
          finally { clearTimeout(timer) }
          row.loaded = image.complete && image.naturalWidth > 0
          const canvas = document.createElement('canvas')
          canvas.width = 8; canvas.height = 8
          const context = canvas.getContext('2d', { willReadFrequently: true })
          context.drawImage(image, 0, 0, 8, 8)
          row.pixels = Array.from(context.getImageData(0, 0, 8, 8).data)
        } catch { row.error = 'image-unreadable' }
      }
      rows.push(row)
    }
  }
  return rows
}
