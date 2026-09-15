import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../schema.sql', () => ({ default: 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);' }))

import app from '../../worker/index'
import type { Env } from '../../worker/types'

type AssetBinding = Pick<Env, 'ASSETS'>

function request(pathname: string, assets: AssetBinding['ASSETS'], headers: HeadersInit = {}) {
  return app.request(
    `https://example.com${pathname}`,
    { headers },
    { ASSETS: assets } as Env,
  )
}

describe('Worker asset routing', () => {
  it('turns an HTML SPA fallback into a non-cacheable asset 404', async () => {
    const fetch = vi.fn(async () => new Response('<!doctype html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))

    const response = await request('/assets/missing.js', { fetch })

    expect(response.status).toBe(404)
    expect(response.headers.get('Content-Type')).toContain('text/plain')
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(await response.text()).toBe('')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('falls back to index.html only for document navigations', async () => {
    const paths: string[] = []
    const fetch = vi.fn(async (assetRequest: Request) => {
      const pathname = new URL(assetRequest.url).pathname
      paths.push(pathname)
      if (pathname === '/admin') return new Response('missing', { status: 404 })
      return new Response('<!doctype html><div id="app"></div>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    })

    const response = await request('/admin', { fetch }, { Accept: 'text/html' })

    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<div id="app"></div>')
    expect(paths).toEqual(['/admin', '/index.html'])
  })

  it('keeps valid JavaScript assets cacheable and unchanged', async () => {
    const fetch = vi.fn(async () => new Response('export default 1', {
      headers: { 'Content-Type': 'text/javascript; charset=utf-8' },
    }))

    const response = await request('/assets/chunk-abc.js', { fetch })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/javascript')
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    expect(await response.text()).toBe('export default 1')
  })

  it('does not route file-like non-HTML requests through the app shell', async () => {
    const fetch = vi.fn(async () => new Response('missing', { status: 404 }))

    const response = await request('/robots.txt', { fetch })

    expect(response.status).toBe(404)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('uses explicit 404 handling in the public Wrangler asset configuration', () => {
    const config = readFileSync('wrangler.toml', 'utf8')
    expect(config).toContain('not_found_handling = "none"')
  })
})
