import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildIconifyWorkItems,
  iconifyProxyPath,
  iconifyUrlFromParams,
  normalizeIconifyNamePair,
  normalizeIconifySearchQuery,
  searchIconifyIcons,
} from '../../../worker/lib/iconifySearch'

describe('worker Iconify search helpers', () => {
  it('normalizes Iconify names, package names, and known API URLs', () => {
    expect(normalizeIconifySearchQuery('@iconify-json/logos/github-icon')).toBe('logos:github-icon')
    expect(normalizeIconifySearchQuery('iconify:logos:github-icon')).toBe('logos:github-icon')
    expect(normalizeIconifySearchQuery('https://api.iconify.design/logos/github-icon.svg?color=black')).toBe(
      'logos:github-icon',
    )
    expect(normalizeIconifySearchQuery(' h o m e ')).toBe('home')
    expect(normalizeIconifySearchQuery('image upload')).toBe('image upload')
    expect(normalizeIconifySearchQuery('x')).toBe('')
  })

  it('keeps search candidates when optional SVG inspection is temporarily unavailable', async () => {
    let iconFetches = 0
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/search?')) {
        return new Response(JSON.stringify({
          icons: ['mdi:home'],
          collections: { mdi: { name: 'Material Design Icons' } },
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      iconFetches += 1
      if (iconFetches === 1) return new Response('temporary upstream failure', { status: 503 })
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      })
    }))

    const writeIconCache = () => undefined
    const first = await searchIconifyIcons('transient-empty-result', 'https://navs.test/api', writeIconCache)
    const second = await searchIconifyIcons('transient-empty-result', 'https://navs.test/api', writeIconCache)

    expect(first?.candidates).toHaveLength(1)
    expect(first?.candidates[0]).toMatchObject({ name: 'mdi:home', colored: false })
    expect(second?.candidates).toHaveLength(1)
    expect(iconFetches).toBe(2)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('validates Iconify route params before building upstream URLs', () => {
    expect(normalizeIconifyNamePair('Logos', 'github-icon.svg')).toBe('logos:github-icon')
    expect(normalizeIconifyNamePair('bad/prefix', 'home')).toBeNull()
    expect(iconifyUrlFromParams('Logos', 'github-icon.svg')).toBe(
      'https://api.iconify.design/logos/github-icon.svg',
    )
    expect(iconifyUrlFromParams('bad/prefix', 'home')).toBeNull()
    expect(iconifyProxyPath('logos', 'github-icon')).toBe('/api/iconify/logos/github-icon.svg')
  })

  it('deduplicates search results and prioritizes palette collections', () => {
    const items = buildIconifyWorkItems('mdi:home', {
      icons: ['logos:github-icon', 'mdi:home', 'bad-name'],
      collections: {
        logos: { name: 'Logos', palette: true },
        mdi: { name: 'Material Design Icons' },
      },
    })

    expect(items.map((item) => item.name)).toEqual(['logos:github-icon', 'mdi:home'])
    expect(items[0]).toMatchObject({
      collection: 'Logos',
      palette: true,
    })
  })

  it('prewarms the same namespaced key used by the Iconify route', async () => {
    const writes: Request[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/search?')) {
        return new Response(JSON.stringify({
          icons: ['mdi:home'],
          collections: { mdi: { name: 'Material Design Icons' } },
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" /></svg>', {
        status: 200,
        headers: { 'content-type': 'image/svg+xml' },
      })
    }))

    await searchIconifyIcons('prewarm-key', 'https://navs.test/api', (request) => {
      writes.push(request)
    })

    expect(writes).toHaveLength(1)
    const url = new URL(writes[0].url)
    expect(url.pathname).toBe('/api/iconify/mdi/home.svg')
    expect(url.searchParams.get('ns')).toBe('3')
  })
})
