import { extractAttribute, fetchWithRedirectLimit, resolveHttpUrl } from './pageMetadata'

export type ManifestIconCandidate = {
  url: string
  size: number
  purpose: string
}

const MANIFEST_ACCEPT = 'application/manifest+json,application/json,*/*;q=0.1'
const MANIFEST_TIMEOUT_MS = 3000
const MAX_MANIFEST_BYTES = 64 * 1024
const MAX_MANIFEST_ICONS = 6

export function extractManifestUrl(html: string, baseUrl: string): string | null {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = extractAttribute(tag, 'rel')
    const href = extractAttribute(tag, 'href')
    if (!rel || !href || !/(^|\s)manifest(\s|$)/i.test(rel)) continue
    const resolved = resolveHttpUrl(href, baseUrl)
    if (resolved) return resolved
  }
  return null
}

export async function fetchManifestJson(
  url: string,
  timeoutMs = MANIFEST_TIMEOUT_MS,
): Promise<unknown | null> {
  // 一个 controller 覆盖握手和 body 读取：fetchWithTimeout 只在响应头到达前有效，
  // manifest body 是随后才逐块读的，慢速/永不结束的流必须也能被同一个超时中止。
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // 重定向手动跟随：每一跳都做 SSRF 主机名校验，不用 redirect:'follow'。
    const response = await fetchWithRedirectLimit(url, {
      method: 'GET',
      headers: { Accept: MANIFEST_ACCEPT },
      signal: controller.signal,
    })
    if (!response.ok || !isManifestContentType(response.headers.get('Content-Type'))) return null

    const bytes = await readLimitedBytes(response, MAX_MANIFEST_BYTES)
    if (!bytes) return null
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function extractManifestIcons(manifest: unknown, manifestUrl: string): ManifestIconCandidate[] {
  if (!manifest || typeof manifest !== 'object' || !('icons' in manifest)) return []
  const icons = manifest.icons
  if (!Array.isArray(icons)) return []

  const seen = new Set<string>()
  const result: ManifestIconCandidate[] = []
  for (const icon of icons) {
    const normalized = normalizeManifestIcon(icon, manifestUrl)
    if (!normalized || seen.has(normalized.url)) continue
    seen.add(normalized.url)
    result.push(normalized)
  }
  return result.sort(compareManifestIcons).slice(0, MAX_MANIFEST_ICONS)
}

function isManifestContentType(contentType: string | null): boolean {
  if (!contentType) return true
  const mime = contentType.split(';', 1)[0].trim().toLowerCase()
  return mime === 'application/manifest+json' || mime === 'application/json' || mime === 'text/json'
}

async function readLimitedBytes(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const reader = response.body?.getReader()
  if (!reader) return null

  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (!value) continue
    total += value.byteLength
    if (total > maxBytes) return null
    chunks.push(value)
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out
}

function normalizeManifestIcon(icon: unknown, manifestUrl: string): ManifestIconCandidate | null {
  if (!icon || typeof icon !== 'object') return null
  const src = 'src' in icon ? icon.src : undefined
  if (typeof src !== 'string' || !src.trim()) return null
  // type 可缺省；一旦存在就必须是非空的 image/* 字符串，非字符串或非图片类型直接拒绝。
  const type = 'type' in icon ? icon.type : undefined
  if (type !== undefined && type !== '') {
    if (typeof type !== 'string' || !type.toLowerCase().startsWith('image/')) return null
  }

  const url = resolveHttpUrl(src, manifestUrl)
  if (!url) return null
  // 缺省 purpose 属于普通档（1），只有显式 any 才优先（2），monochrome 垫底（0）。
  const purposeRaw = 'purpose' in icon ? icon.purpose : undefined
  const purpose = typeof purposeRaw === 'string' ? purposeRaw.toLowerCase() : ''
  const sizes = 'sizes' in icon ? icon.sizes : undefined
  return { url, size: parseLargestSize(sizes), purpose }
}

function parseLargestSize(sizes: unknown): number {
  if (typeof sizes !== 'string') return 0
  if (/^\s*any\s*$/i.test(sizes)) return 512

  let best = 0
  for (const part of sizes.split(/\s+/)) {
    const match = part.match(/^(\d{1,4})x(\d{1,4})$/i)
    if (!match) continue
    const width = Number(match[1])
    const height = Number(match[2])
    if (width !== height || width > 512) continue
    best = Math.max(best, width)
  }
  return best
}

function compareManifestIcons(a: ManifestIconCandidate, b: ManifestIconCandidate): number {
  const purposeScore = scorePurpose(b.purpose) - scorePurpose(a.purpose)
  if (purposeScore !== 0) return purposeScore
  return b.size - a.size
}

function scorePurpose(purpose: string): number {
  if (/\bany\b/.test(purpose)) return 2
  if (/\bmonochrome\b/.test(purpose)) return 0
  return 1
}
