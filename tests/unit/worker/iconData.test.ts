import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  classifyIconFailure,
  dataUriToResponse,
  fetchIcon,
  iconBytesToDataUri,
  isIconifyIconUrl,
  shouldPersistIconBlob,
} from '../../../worker/lib/iconData'

describe('worker icon data helpers', () => {
  it('round-trips fetched icon bytes through a data URI response', async () => {
    const dataUri = iconBytesToDataUri({
      bytes: new Uint8Array([137, 80, 78, 71]),
      contentType: 'image/png',
    })

    expect(dataUri).toBe('data:image/png;base64,iVBORw==')

    const response = dataUriToResponse(dataUri, 'public, max-age=60')
    expect(response).not.toBeNull()
    expect(response?.headers.get('Content-Type')).toBe('image/png')
    expect(response?.headers.get('Cache-Control')).toBe('public, max-age=60')
    expect(new Uint8Array(await response!.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]))
  })

  it('recognizes Iconify URLs and avoids persisting Iconify blobs', () => {
    expect(isIconifyIconUrl('https://api.iconify.design/logos/github-icon.svg')).toBe(true)
    expect(isIconifyIconUrl('https://icon-sets.iconify.design/logos/github-icon/')).toBe(true)
    expect(isIconifyIconUrl('https://example.com/logos/github-icon.svg')).toBe(false)

    expect(shouldPersistIconBlob('https://example.com/favicon.ico', null)).toBe(true)
    expect(shouldPersistIconBlob('https://api.iconify.design/logos/github-icon.svg', null)).toBe(false)
    expect(shouldPersistIconBlob('https://example.com/icon.svg', 'iconify')).toBe(false)
    expect(shouldPersistIconBlob('data:image/png;base64,abc', null)).toBe(false)
  })
})

describe('worker icon fetch outcome', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function stub(status: number, body: BodyInit, contentType = 'image/svg+xml') {
    const fetchMock = vi.fn(async () => new Response(body, {
      status,
      headers: { 'content-type': contentType },
    }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('classifies only explicit not-found statuses as missing', () => {
    expect(classifyIconFailure(404)).toBe('missing')
    expect(classifyIconFailure(410)).toBe('missing')
    expect(classifyIconFailure(429)).toBe('transient')
    expect(classifyIconFailure(503)).toBe('transient')
    // null 表示网络错误或超时，两者都会自行恢复
    expect(classifyIconFailure(null)).toBe('transient')
  })

  it('returns the bytes for a real image', async () => {
    stub(200, '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>')

    const outcome = await fetchIcon('https://icons.example.com/a.svg')

    expect(outcome.ok).toBe(true)
    expect(outcome.ok && outcome.icon.contentType).toBe('image/svg+xml')
  })

  it('reports a missing icon without retrying', async () => {
    // 图标确实不存在时不能重试打上游；调用方按这个结论沿用 5 分钟短缓存兜底图
    const fetchMock = stub(404, 'not found', 'text/plain')

    expect(await fetchIcon('https://icons.example.com/a.svg')).toEqual({ ok: false, failure: 'missing' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports transient failures separately so callers can keep them out of caches', async () => {
    const fetchMock = stub(503, 'busy', 'text/plain')

    expect(await fetchIcon('https://icons.example.com/a.svg')).toEqual({ ok: false, failure: 'transient' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats an HTML page and an oversized payload as missing, not transient', async () => {
    stub(200, '<!doctype html><html><body>login</body></html>', 'image/png')
    expect(await fetchIcon('https://icons.example.com/a.svg')).toEqual({ ok: false, failure: 'missing' })

    stub(200, new Uint8Array(300_000), 'image/png')
    expect(await fetchIcon('https://icons.example.com/a.svg')).toEqual({ ok: false, failure: 'missing' })
  })

  it('treats a network error and an empty body as transient', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('connection reset') }))
    expect(await fetchIcon('https://icons.example.com/a.svg')).toEqual({ ok: false, failure: 'transient' })

    stub(200, '', 'image/svg+xml')
    expect(await fetchIcon('https://icons.example.com/a.svg')).toEqual({ ok: false, failure: 'transient' })
  })
})
