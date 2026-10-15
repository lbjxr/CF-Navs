import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractManifestIcons, extractManifestUrl, fetchManifestJson } from '../../../worker/lib/webManifest'

const MANIFEST_URL = 'https://example.com/site.webmanifest'

describe('extractManifestUrl', () => {
  it('extracts the manifest link and resolves it against the final url', () => {
    expect(
      extractManifestUrl('<link rel="manifest" href="/site.webmanifest">', 'https://example.com/page'),
    ).toBe('https://example.com/site.webmanifest')
    expect(
      extractManifestUrl('<link href="manifest.json" rel="manifest">', 'https://example.com/app/'),
    ).toBe('https://example.com/app/manifest.json')
    expect(
      extractManifestUrl('<link rel="manifest" href="https://cdn.example.com/m.json">', 'https://example.com/'),
    ).toBe('https://cdn.example.com/m.json')
  })

  it('rejects non-http, blocked and missing manifest hrefs', () => {
    expect(extractManifestUrl('<link rel="stylesheet" href="/a.css">', 'https://example.com/')).toBeNull()
    expect(extractManifestUrl('<link rel="manifest" href="ftp://example.com/m.json">', 'https://example.com/')).toBeNull()
    expect(extractManifestUrl('<link rel="manifest" href="http://169.254.169.254/m.json">', 'https://example.com/')).toBeNull()
  })
})

describe('extractManifestIcons', () => {
  it('resolves relative icon src against the manifest url and keeps http(s) only', () => {
    const icons = extractManifestIcons(
      { icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] },
      MANIFEST_URL,
    )
    expect(icons.map((icon) => icon.url)).toEqual(['https://example.com/icon-192.png'])
  })

  it('orders explicit any first, then default purpose by largest square size, monochrome last', () => {
    const icons = extractManifestIcons(
      {
        icons: [
          { src: '/mono.png', sizes: '256x256', purpose: 'monochrome' },
          { src: '/small.png', sizes: '48x48' },
          { src: '/big.png', sizes: '512x512' },
          { src: '/any.png', sizes: '96x96', purpose: 'any' },
        ],
      },
      MANIFEST_URL,
    )
    expect(icons.map((icon) => icon.url)).toEqual([
      'https://example.com/any.png',
      'https://example.com/big.png',
      'https://example.com/small.png',
      'https://example.com/mono.png',
    ])
  })

  it('treats sizes "any" as a large candidate', () => {
    const icons = extractManifestIcons(
      { icons: [{ src: '/a.svg', sizes: 'any', type: 'image/svg+xml' }, { src: '/b.png', sizes: '64x64' }] },
      MANIFEST_URL,
    )
    expect(icons[0].url).toBe('https://example.com/a.svg')
  })

  it('deduplicates identical resolved urls', () => {
    const icons = extractManifestIcons(
      { icons: [{ src: '/i.png', sizes: '128x128' }, { src: '/i.png', sizes: '256x256' }] },
      MANIFEST_URL,
    )
    expect(icons).toHaveLength(1)
  })

  it('accepts a missing or empty type but rejects present non-image types', () => {
    expect(
      extractManifestIcons({ icons: [{ src: '/ok.png', type: '' }] }, MANIFEST_URL).map((i) => i.url),
    ).toEqual(['https://example.com/ok.png'])
    expect(extractManifestIcons({ icons: [{ src: '/bad.png', type: 42 }] }, MANIFEST_URL)).toEqual([])
    expect(extractManifestIcons({ icons: [{ src: '/bad.png', type: 'text/html' }] }, MANIFEST_URL)).toEqual([])
  })

  it('rejects blocked hosts and malformed entries', () => {
    expect(
      extractManifestIcons({ icons: [{ src: 'http://169.254.169.254/i.png' }] }, MANIFEST_URL),
    ).toEqual([])
    expect(extractManifestIcons({ icons: [{}, 'x', null, 42] }, MANIFEST_URL)).toEqual([])
  })

  it('returns empty for non-object manifests or missing icons array', () => {
    expect(extractManifestIcons(null, MANIFEST_URL)).toEqual([])
    expect(extractManifestIcons('nope', MANIFEST_URL)).toEqual([])
    expect(extractManifestIcons({ icons: 'nope' }, MANIFEST_URL)).toEqual([])
    expect(extractManifestIcons({}, MANIFEST_URL)).toEqual([])
  })
})

describe('fetchManifestJson', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function jsonResponse(body: string, contentType = 'application/manifest+json'): Response {
    return new Response(body, { status: 200, headers: { 'Content-Type': contentType } })
  }

  it('parses a valid manifest json body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse('{"icons":[{"src":"/a.png"}]}'))
    const manifest = await fetchManifestJson(MANIFEST_URL)
    expect(manifest).toEqual({ icons: [{ src: '/a.png' }] })
  })

  it('accepts application/json content type', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse('{"ok":true}', 'application/json'))
    expect(await fetchManifestJson(MANIFEST_URL)).toEqual({ ok: true })
  })

  it('rejects non-json content types', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse('{"icons":[]}', 'text/html'))
    expect(await fetchManifestJson(MANIFEST_URL)).toBeNull()
  })

  it('returns null on non-2xx responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }))
    expect(await fetchManifestJson(MANIFEST_URL)).toBeNull()
  })

  it('returns null when the body exceeds the byte cap', async () => {
    const huge = `{"pad":"${'x'.repeat(70 * 1024)}"}`
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(huge))
    expect(await fetchManifestJson(MANIFEST_URL)).toBeNull()
  })

  it('returns null on malformed json', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse('{not json'))
    expect(await fetchManifestJson(MANIFEST_URL)).toBeNull()
  })

  it('returns null when fetch throws', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'))
    expect(await fetchManifestJson(MANIFEST_URL)).toBeNull()
  })

  it('aborts and returns null when the body stalls past the timeout', async () => {
    // 流永不结束，只有 fetch signal 触发时才 error：验证超时覆盖 body 读取而不仅是响应头。
    vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
      const signal = (init as RequestInit | undefined)?.signal
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          signal?.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true })
        },
      })
      return Promise.resolve(
        new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } }),
      )
    })
    expect(await fetchManifestJson(MANIFEST_URL, 20)).toBeNull()
  })
})
