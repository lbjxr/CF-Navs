import { describe, expect, it } from 'vitest'
import { compareIconSamples, evaluateIconFixtures } from '../../scripts/lib/iconAcceptance.mjs'
import { createIconAcceptanceFixtures } from '../../scripts/lib/iconAcceptanceFixtures.mjs'
const images = createIconAcceptanceFixtures()
const expected = [
  { key: 'bookmark:1:home', kind: 'image', pixels: images.bookmark.pixels },
  { key: 'bookmark:1:search', kind: 'image', pixels: images.bookmark.pixels },
  { key: 'category:1:heading', kind: 'image', pixels: images.category.pixels },
  { key: 'bookmark:2:home', kind: 'text', text: '文' },
]
function observations(): any[] { return expected.map(row => ({ ...structuredClone(row), loaded: row.kind === 'image' })) }
describe('independent icon oracle', () => {
  it('accepts exact object and placement content', () => {
    expect(evaluateIconFixtures(expected, observations()).passed).toBe(true)
  })
  it('uses deterministic distinct image signatures', () => {
    expect(createIconAcceptanceFixtures()).toEqual(images)
    expect(images.bookmark.pixels).toHaveLength(256)
    expect(images.bookmark.pixels).not.toEqual(images.category.pixels)
    expect(images.bookmark.uri).not.toEqual(images.category.uri)
  })
  const mutations: [string, (rows: any[]) => void][] = [
    ['wrong image', rows => { rows[0].pixels = images.category.pixels }],
    ['decodable fallback', rows => { rows[0].pixels = Array(256).fill(255) }],
    ['missing duplicate placement', rows => { rows.splice(1, 1) }],
    ['missing category', rows => { rows.splice(2, 1) }],
    ['duplicate key', rows => { rows.push({ ...rows[0] }) }],
    ['unexpected private object', rows => { rows.push({ ...rows[0], key: 'private' }) }],
    ['missing pixel evidence', rows => { delete rows[0].pixels }],
    ['CORS or decode failure', rows => { rows[0].error = 'image-unreadable' }],
    ['broken image', rows => { rows[0].loaded = false }],
    ['text replacing image', rows => { rows[0].kind = 'text' }],
    ['wrong intentional text', rows => { rows[3].text = '错' }],
  ]
  it.each(mutations)('rejects %s', (_name, mutate) => {
    const rows = observations(); mutate(rows)
    expect(evaluateIconFixtures(expected, rows).passed).toBe(false)
  })
  it('fails for empty, duplicate or evidence-free expectations', () => {
    expect(evaluateIconFixtures([], []).passed).toBe(false)
    expect(evaluateIconFixtures([expected[0], expected[0]], [observations()[0]]).passed).toBe(false)
    expect(evaluateIconFixtures([{ key: 'a', kind: 'image' }], [{ key: 'a', kind: 'image', loaded: true }]).passed).toBe(false)
  })
})
describe('production display non-regression', () => {
  const base = [{ key: 'same', loaded: true }, { key: 'same', loaded: true }, { key: 'text', loaded: false }]
  it('preserves multiplicity regardless of order, without claiming identity', () => {
    expect(compareIconSamples(base, [...base].reverse())).toEqual({ passed: true, errors: [], assurance: 'display-non-regression-only' })
  })
  it.each([
    ['missing duplicate', base.slice(1)],
    ['missing baseline text', base.slice(0, 2)],
    ['lost image', [{ key: 'same', loaded: true }, { key: 'same', loaded: false }, base[2]]],
    ['unexpected instance', [...base, { key: 'extra', loaded: true }]],
    ['broken image', [...base.slice(0, 2), { ...base[2], broken: true }]],
  ])('rejects %s', (_name, rows) => {
    expect(compareIconSamples(base, rows).passed).toBe(false)
  })
  it('rejects an empty baseline', () => { expect(compareIconSamples([], []).passed).toBe(false) })
})
