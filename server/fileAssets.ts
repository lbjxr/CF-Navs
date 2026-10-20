// Node 静态资源 Fetcher：以 ASSETS.fetch() 的形状服务 dist/。
//
// 职责边界：文件查找、MIME、ETag、dist/_headers 规则应用在本层；
// Cache-Control/CSP 的业务策略由共享的 withAssetCacheHeaders 在上层统一处理
// （两层取值一致，叠加无冲突）。未知路径返回 404，SPA 回退由共享的
// fetchAssetResponse 决定，与 Worker 路径的行为分工相同。

import { readFile, stat } from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import type { AssetsLike } from './runtime'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml; charset=utf-8',
}

interface HeaderRule {
  pattern: string
  headers: Array<[string, string]>
}

/** 解析 Cloudflare _headers 文本：路径块 + 缩进的 `Name: value` 行。 */
export function parseHeaderRules(text: string): HeaderRule[] {
  const rules: HeaderRule[] = []
  let current: HeaderRule | null = null
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] }
      rules.push(current)
    } else if (current) {
      const idx = line.indexOf(':')
      if (idx > 0) {
        current.headers.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()])
      }
    }
  }
  return rules
}

function ruleMatches(pattern: string, pathname: string): boolean {
  if (pattern.endsWith('/*')) return pathname.startsWith(pattern.slice(0, -1))
  return pattern === pathname
}

export async function loadHeaderRules(distDir: string): Promise<HeaderRule[]> {
  try {
    const text = await readFile(join(distDir, '_headers'), 'utf8')
    return parseHeaderRules(text)
  } catch {
    return [] // 没有 _headers（如未构建）时不应用额外规则，共享层策略仍生效
  }
}

export function createFileAssets(distDir: string, rules: HeaderRule[]): AssetsLike {
  const root = resolve(distDir)

  function applyRules(pathname: string, headers: Headers): void {
    for (const rule of rules) {
      if (!ruleMatches(rule.pattern, pathname)) continue
      for (const [name, value] of rule.headers) headers.set(name, value)
    }
  }

  async function serveFile(filePath: string, pathname: string, request: Request): Promise<Response> {
    const info = await stat(filePath)
    const etag = `W/"${info.size}-${Math.floor(info.mtimeMs)}"`
    const headers = new Headers()
    headers.set('Content-Type', MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream')
    headers.set('ETag', etag)
    headers.set('Last-Modified', info.mtime.toUTCString())
    applyRules(pathname, headers)

    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers })
    }
    if (request.method === 'HEAD') {
      headers.set('Content-Length', String(info.size))
      return new Response(null, { status: 200, headers })
    }
    const body = await readFile(filePath)
    headers.set('Content-Length', String(body.byteLength))
    return new Response(body, { status: 200, headers })
  }

  return {
    async fetch(request: Request): Promise<Response> {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response(null, { status: 404 })
      }
      let pathname: string
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname)
      } catch {
        return new Response(null, { status: 404 })
      }

      const relative = pathname.replace(/^\/+/, '')
      const candidate = resolve(root, relative)
      // 路径穿越防护：解析后的路径必须仍在 dist 根内
      if (candidate !== root && !candidate.startsWith(root + sep)) {
        return new Response(null, { status: 404 })
      }

      try {
        const info = await stat(candidate)
        if (info.isDirectory()) {
          const indexPath = join(candidate, 'index.html')
          return await serveFile(indexPath, pathname, request)
        }
        if (info.isFile()) {
          return await serveFile(candidate, pathname, request)
        }
      } catch {
        // 落到 404
      }
      return new Response(null, { status: 404 })
    },
  }
}
