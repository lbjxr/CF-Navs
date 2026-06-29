import { Hono } from 'hono'
import type { Context } from 'hono'
import { getBookmark, getCategory, getIconBlob, setIconBlob } from '../lib/db'
import type { HonoEnv } from '../types'

type AppContext = Context<HonoEnv>

export const iconRoutes = new Hono<HonoEnv>()

const CACHE_TIMEOUT_MS = 5000
const MAX_ICON_SIZE = 256_000
const ICON_ACCEPT = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.1'
const SUCCESS_CACHE = 'public, max-age=604800, s-maxage=2592000, immutable'
const MISS_CACHE = 'public, max-age=300, s-maxage=300'

function errorResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'Cache-Control': MISS_CACHE,
    },
  })
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function fallbackIconResponse(title: string, url: string): Response {
  let hostname = 'NAV'
  try {
    hostname = new URL(url).hostname.replace(/^www\./, '') || hostname
  } catch {
    hostname = 'NAV'
  }

  const text = escapeSvgText((title.trim() || hostname).slice(0, 4))
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#111827"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#f9fafb" font-size="180" font-weight="700" font-family="Arial,Helvetica,sans-serif">${text}</text>
</svg>`

  return new Response(svg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': MISS_CACHE,
      'X-Icon-Fallback': '1',
    },
  })
}

function dataUriToResponse(dataUri: string): Response | null {
  const match = dataUri.match(/^data:([^;,]+);base64,(.+)$/)
  if (!match) return null

  const mime = match[1] || 'image/png'
  const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': SUCCESS_CACHE,
    },
  })
}

async function fetchIconAsDataUri(iconUrl: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CACHE_TIMEOUT_MS)

  try {
    const response = await fetch(iconUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: ICON_ACCEPT,
      },
    })

    if (!response.ok) return null

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png'
    if (!contentType.startsWith('image/') && contentType !== 'application/octet-stream') {
      return null
    }

    const buffer = await response.arrayBuffer()
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_ICON_SIZE) {
      return null
    }

    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i])
    }

    return `data:${contentType.startsWith('image/') ? contentType : 'image/png'};base64,${btoa(binary)}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function cacheResponse(c: AppContext, request: Request, response: Response) {
  const executionCtx = (c as unknown as { executionCtx?: ExecutionContext }).executionCtx
  const edgeCache = (caches as unknown as { default: Cache }).default
  executionCtx?.waitUntil(edgeCache.put(request, response.clone()))
}

iconRoutes.get('/icon/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return new Response('invalid id', { status: 400 })
  }

  try {
    const edgeCache = (caches as unknown as { default: Cache }).default
    const cached = await edgeCache.match(c.req.raw)
    if (cached) {
      return cached
    }

    const blob = await getIconBlob(c.env.DB, id)
    if (blob) {
      const response = dataUriToResponse(blob)
      if (!response) return errorResponse('invalid blob', 500)
      cacheResponse(c, c.req.raw, response)
      return response
    }

    const bookmark = await getBookmark(c.env.DB, id)
    if (!bookmark?.icon) {
      return errorResponse('icon not found', 404)
    }

    if (bookmark.icon.startsWith('data:image/')) {
      await setIconBlob(c.env.DB, id, bookmark.icon)
      const response = dataUriToResponse(bookmark.icon)
      if (!response) return errorResponse('invalid data uri', 500)
      cacheResponse(c, c.req.raw, response)
      return response
    }

    if (!/^https?:\/\//i.test(bookmark.icon)) {
      return errorResponse('unsupported icon', 404)
    }

    const nextBlob = await fetchIconAsDataUri(bookmark.icon)
    if (!nextBlob) {
      return fallbackIconResponse(bookmark.title, bookmark.url)
    }

    await setIconBlob(c.env.DB, id, nextBlob)
    const response = dataUriToResponse(nextBlob)
    if (!response) return errorResponse('invalid fetched icon', 500)
    cacheResponse(c, c.req.raw, response)
    return response
  } catch {
    return new Response('server error', { status: 500 })
  }
})

iconRoutes.get('/category-icon/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) {
    return new Response('invalid id', { status: 400 })
  }

  try {
    const edgeCache = (caches as unknown as { default: Cache }).default
    const cached = await edgeCache.match(c.req.raw)
    if (cached) {
      return cached
    }

    const category = await getCategory(c.env.DB, id)
    if (!category?.icon) {
      return errorResponse('icon not found', 404)
    }

    if (category.icon.startsWith('data:image/')) {
      const response = dataUriToResponse(category.icon)
      if (!response) return errorResponse('invalid data uri', 500)
      cacheResponse(c, c.req.raw, response)
      return response
    }

    if (!/^https?:\/\//i.test(category.icon)) {
      return fallbackIconResponse(category.title, '')
    }

    const nextBlob = await fetchIconAsDataUri(category.icon)
    if (!nextBlob) {
      return fallbackIconResponse(category.title, category.icon)
    }

    const response = dataUriToResponse(nextBlob)
    if (!response) return errorResponse('invalid fetched icon', 500)
    cacheResponse(c, c.req.raw, response)
    return response
  } catch {
    return new Response('server error', { status: 500 })
  }
})
