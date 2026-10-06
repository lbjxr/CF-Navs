import { describe, expect, it } from 'vitest'
import { dataUriToResponse } from '../../worker/lib/iconData'
import { createIconAcceptanceFixtures } from '../../scripts/lib/iconAcceptanceFixtures.mjs'
const uri = createIconAcceptanceFixtures().bookmark.uri
const svg = decodeURIComponent(uri.slice(uri.indexOf(',') + 1))
describe('Issue 28 ordinary-proxy data URI regression ', () => {
  it('serves the base64 control', async () => {
    const response = dataUriToResponse('data:image/svg+xml;base64,' + btoa(svg), 'no-store')
    expect(await response?.text()).toBe(svg)
  })
  // The real browser copy-503 scenario must recover through this ordinary path.
  it('must serve the charset-bearing URL-encoded SVG accepted by the trusted path', async () => {
    const response = dataUriToResponse(uri, 'no-store')
    expect(response).not.toBeNull()
    expect(await response?.text()).toBe(svg)
  })
  it('must serve a URL-encoded SVG without charset as well', async () => {
    const response = dataUriToResponse(uri.replace(';charset=utf-8', ''), 'no-store')
    expect(response).not.toBeNull()
    expect(await response?.text()).toBe(svg)
  })
})

it('preserves UTF-8 bytes and the caller cache policy',async()=>{
  const text='<svg xmlns="http://www.w3.org/2000/svg"><text>图标</text></svg>'
  const response=dataUriToResponse('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(text),'private, no-store')!
  expect(await response.text()).toBe(text)
  expect(response.headers.get('Content-Length')).toBe(String(new TextEncoder().encode(text).length))
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
})
it.each(['data:image/svg+xml,%ZZ','data:image/svg+xml;charset=gbk,abc','data:text/html;base64,PHNjcmlwdD4=','data:image/png;base64,%%%'])('rejects malformed or unsupported input %s',value=>expect(dataUriToResponse(value,'no-store')).toBeNull())
