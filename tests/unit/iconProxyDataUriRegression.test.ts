import { describe, expect, it } from 'vitest'
import { dataUriToResponse } from '../../worker/lib/iconData'
import { createIconAcceptanceFixtures } from '../../scripts/lib/iconAcceptanceFixtures.mjs'
const uri = createIconAcceptanceFixtures().bookmark.uri
const svg = decodeURIComponent(uri.slice(uri.indexOf(',') + 1))
describe('Issue 28 ordinary-proxy data URI regression (known unresolved)', () => {
  it('serves the base64 control', async () => {
    const response = dataUriToResponse('data:image/svg+xml;base64,' + btoa(svg), 'no-store')
    expect(await response?.text()).toBe(svg)
  })
  // Expected-failure is deliberate: the real browser copy-503 scenario reaches
  // this parser and shows a fallback. Remove .fails only with the actual fix.
  it.fails('must serve the charset-bearing URL-encoded SVG accepted by the trusted path', async () => {
    const response = dataUriToResponse(uri, 'no-store')
    expect(response).not.toBeNull()
    expect(await response?.text()).toBe(svg)
  })
  it.fails('must serve a URL-encoded SVG without charset as well', async () => {
    const response = dataUriToResponse(uri.replace(';charset=utf-8', ''), 'no-store')
    expect(response).not.toBeNull()
    expect(await response?.text()).toBe(svg)
  })
})
