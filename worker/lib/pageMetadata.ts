// 目标站页面抓取与元信息解析。
// 从 routes/favicon.ts 抽出，供图标解析和站点名称解析共用：
// 路由只负责编排，这里只负责抓取和纯文本解析。

import { decodeHtmlEntities } from '../../shared/decodeHtmlEntities'

export const HTML_ACCEPT = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
export const MAX_HTML_BYTES = 131_072
export const FETCH_TIMEOUT_MS = 3000
export const MAX_TITLE_LENGTH = 80
// charset 只可能出现在文档开头，扫描前若干字节即可，不必解码整篇。
const CHARSET_SNIFF_BYTES = 2048
// 标题和 og 标签都在 <head> 里，读到 </head> 就可以断开连接，
// 不必把整个页面 body 下载完 —— 这是这条链路上最大的一笔时间。
const HEAD_END = new Uint8Array([0x3c, 0x2f, 0x68, 0x65, 0x61, 0x64, 0x3e]) // </head>

function toLowerAsciiByte(value: number): number {
  return value >= 0x41 && value <= 0x5a ? value + 0x20 : value
}

function indexOfAsciiSequence(
  haystack: Uint8Array,
  needle: Uint8Array,
  from: number,
  end: number,
): number {
  const limit = end - needle.length
  for (let i = Math.max(0, from); i <= limit; i++) {
    let matched = true
    for (let j = 0; j < needle.length; j++) {
      if (toLowerAsciiByte(haystack[i + j]) !== needle[j]) {
        matched = false
        break
      }
    }
    if (matched) return i
  }
  return -1
}

// 边读边找 </head>：命中就 cancel，让上游停止发送剩余 body。
export async function readHtmlHeadBytes(
  stream: ReadableStream<Uint8Array>,
  maxBytes = MAX_HTML_BYTES,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const buffer = new Uint8Array(maxBytes)
  let length = 0

  try {
    while (length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value || value.length === 0) continue

      const copied = Math.min(value.length, maxBytes - length)
      buffer.set(value.subarray(0, copied), length)
      // </head> 可能跨 chunk，回退 needle 长度重叠搜索
      const searchFrom = Math.max(0, length - HEAD_END.length + 1)
      length += copied
      if (indexOfAsciiSequence(buffer, HEAD_END, searchFrom, length) >= 0) break
    }
  } finally {
    void reader.cancel().catch(() => { })
  }

  return buffer.subarray(0, length)
}

export type PageFetchResult = {
  html: string | null
  finalUrl: string
}

// 带超时的 fetch：避免某个上游连接挂起导致整个请求长时间卡住。
// 注意 fetch 在响应头到达时就 resolve，所以这个超时不覆盖读 body 的过程；
// 调用方需要自己再套一层整体 deadline。
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ========== 出网目标过滤 ==========
// Worker 会去访问调用方给出的地址，所以要挡住内网和云元数据端点（SSRF）。
// 注意这道防线有天花板：它只看地址字面量，挡不住 DNS 重绑定
// （域名合法但解析到内网），而 Workers 没有可插手的解析钩子。
// WHATWG URL 解析器会先把 2130706433、0x7f.0.0.1 这类写法归一成 127.0.0.1，
// 常见的进制绕过因此已经在 new URL() 阶段被拉平。

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal'])
const BLOCKED_HOSTNAME_SUFFIXES = ['.localhost', '.local', '.internal']

function isBlockedIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4) return false

  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN))
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false

  const [a, b] = octets
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true // 链路本地，含云元数据 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true // 运营商级 NAT
  if (a >= 224) return true // 组播与保留段
  return false
}

function isBlockedIpv6(hostname: string): boolean {
  // new URL() 会把 IPv6 主机名保留成 [..] 形式，并压缩成小写
  const address = hostname.slice(1, -1)
  if (address === '::1' || address === '::') return true

  // IPv4-mapped / IPv4-compatible，例如 ::ffff:127.0.0.1
  const mapped = address.match(/^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mapped) return isBlockedIpv4(mapped[1])

  const head = address.split(':')[0]
  if (!head) return false

  const value = Number.parseInt(head, 16)
  if (!Number.isFinite(value)) return false
  if (value >= 0xfc00 && value <= 0xfdff) return true // fc00::/7 唯一本地
  if (value >= 0xfe80 && value <= 0xfebf) return true // fe80::/10 链路本地
  return false
}

export function isBlockedFetchHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return true
  if (BLOCKED_HOSTNAMES.has(host)) return true
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  if (host.startsWith('[') && host.endsWith(']')) return isBlockedIpv6(host)
  return isBlockedIpv4(host)
}

export function parseTargetUrl(raw: string | null): URL | null {
  if (!raw) return null

  const value = raw.trim()
  if (!value) return null

  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return null
    }
    if (isBlockedFetchHostname(url.hostname)) {
      return null
    }
    // 不要把 URL 里内嵌的账号密码转发给上游。
    url.username = ''
    url.password = ''
    return url
  } catch {
    return null
  }
}

export function extractAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'=<>`]+))', 'i')
  const match = tag.match(pattern)
  const value = match?.[1] ?? match?.[2] ?? match?.[3]
  return value?.trim() || null
}

export function resolveHttpUrl(raw: string, baseUrl: string): string | null {
  try {
    const url = new URL(raw, baseUrl)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null
    }
    // 图标候选来自目标页的 <link href>，是第三方可控内容：
    // 不过滤的话，一个恶意页面挂 <link rel=icon href="http://169.254.169.254/..">
    // 就能绕开 parseTargetUrl 的检查。
    if (isBlockedFetchHostname(url.hostname)) {
      return null
    }
    return url.toString()
  } catch {
    return null
  }
}

export function extractIconCandidates(html: string, baseUrl: string): string[] {
  const matches = html.match(/<link\b[^>]*>/gi) ?? []
  const seen = new Set<string>()
  const candidates: string[] = []

  for (const tag of matches) {
    const rel = extractAttribute(tag, 'rel')
    const href = extractAttribute(tag, 'href')
    if (!rel || !href || !/\bicon\b/i.test(rel)) {
      continue
    }

    const resolved = resolveHttpUrl(href, baseUrl)
    if (!resolved || seen.has(resolved)) {
      continue
    }

    seen.add(resolved)
    candidates.push(resolved)
  }

  return candidates
}

// ========== 编码处理 ==========

// Response.text() 按 Fetch 规范恒用 UTF-8 解码，会忽略 Content-Type 里的 charset。
// 只解析 ASCII 的 <link> 标签时没影响，但站点名称是正文，GBK/GB2312 页面会解出乱码。

// 常见的错误拼写和历史别名，TextDecoder 不认这些 label。
const CHARSET_ALIASES: Record<string, string> = {
  utf8: 'utf-8',
  'utf-8-sig': 'utf-8',
  gb_2312: 'gbk',
  'gb2312-80': 'gbk',
  'x-gbk': 'gbk',
  'x-sjis': 'shift_jis',
  sjis: 'shift_jis',
  'ms932': 'shift_jis',
  'big5-hkscs': 'big5',
  'euc_kr': 'euc-kr',
  'euc_jp': 'euc-jp',
}

// BOM 优先于一切声明：TextDecoder('gbk') 不会剥掉 UTF-8 BOM，
// 让过时的 <meta charset=gb2312> 压过真实 BOM 会把整篇文档解坏。
function detectBom(bytes: Uint8Array): { label: string; offset: number } | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { label: 'utf-8', offset: 3 }
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { label: 'utf-16le', offset: 2 }
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { label: 'utf-16be', offset: 2 }
  }
  return null
}

export function extractCharsetLabel(contentType: string | null, head: string): string | null {
  const fromHeader = contentType?.match(/charset\s*=\s*"?([^";\s]+)"?/i)?.[1]
  if (fromHeader) return fromHeader.trim().toLowerCase()

  const metaCharset = head.match(/<meta\b[^>]*\bcharset\s*=\s*["']?([a-z0-9_\-:.]+)/i)?.[1]
  if (metaCharset) return metaCharset.trim().toLowerCase()

  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/http-equiv\s*=\s*["']?content-type/i.test(tag)) continue
    const label = extractAttribute(tag, 'content')?.match(/charset\s*=\s*"?([^";\s]+)"?/i)?.[1]
    if (label) return label.trim().toLowerCase()
  }

  return null
}

function createDecoder(label: string | null): TextDecoder {
  if (label && label !== 'utf-8') {
    try {
      return new TextDecoder(label)
    } catch {
      // 运行时不支持这个 label（Node 与 workerd 的支持集并不完全一致）。
    }

    const alias = CHARSET_ALIASES[label]
    if (alias) {
      try {
        return new TextDecoder(alias)
      } catch {
        // 继续回退 UTF-8。
      }
    }
  }

  return new TextDecoder('utf-8')
}

export function decodeHtmlBytes(input: ArrayBuffer | Uint8Array, contentType: string | null): string {
  const all = input instanceof Uint8Array ? input : new Uint8Array(input)
  const bom = detectBom(all)
  const body = all.subarray(bom?.offset ?? 0, (bom?.offset ?? 0) + MAX_HTML_BYTES)

  if (bom) {
    return createDecoder(bom.label).decode(body)
  }

  // charset 声明本身是 ASCII，用 UTF-8 解码开头一段来嗅探是安全的。
  const head = new TextDecoder('utf-8').decode(body.subarray(0, CHARSET_SNIFF_BYTES))
  return createDecoder(extractCharsetLabel(contentType, head)).decode(body)
}

export async function fetchPageHtml(url: string): Promise<PageFetchResult | null> {
  try {
    const response = await fetchWithTimeout(url, {
      redirect: 'follow',
      headers: {
        Accept: HTML_ACCEPT,
        // Workers 默认不带 UA，部分站点直接 403，会同时拖低图标和标题命中率。
        'User-Agent': 'Mozilla/5.0 (compatible; CF-Navs/1.0)',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })

    const finalUrl = response.url || url
    if (!response.ok) {
      return { html: null, finalUrl }
    }

    const contentType = response.headers.get('content-type')
    const normalizedContentType = contentType?.toLowerCase() ?? ''
    if (
      !normalizedContentType.includes('text/html') &&
      !normalizedContentType.includes('application/xhtml+xml')
    ) {
      return { html: null, finalUrl }
    }

    // 只读到 </head> 就断开；没有 body 流时退回一次性读取。
    const bytes = response.body
      ? await readHtmlHeadBytes(response.body)
      : new Uint8Array(await response.arrayBuffer())

    return { html: decodeHtmlBytes(bytes, contentType), finalUrl }
  } catch {
    return null
  }
}

// ========== 标题解析 ==========

export function normalizeTitleText(raw: string | null | undefined): string {
  if (!raw) return ''

  const cleaned = decodeHtmlEntities(raw)
    .replace(/[\t\n\r\f\v]+/g, ' ')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, '')
    // 零宽字符和双向控制符：站点标题是第三方文本，U+202E 能把后台列表整段翻转。
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // U+FFFD 说明这段字节没被正确解码，宁可当作解析失败也不要写入乱码。
  if (cleaned.includes('\ufffd')) return ''

  const codePoints = Array.from(cleaned)
  // 按码位截断，`.slice()` 会把代理对劈开，末尾是 emoji 的标题会产生孤立代理项。
  return codePoints.length > MAX_TITLE_LENGTH
    ? codePoints.slice(0, MAX_TITLE_LENGTH).join('').trim()
    : cleaned
}

// 反爬墙和占位标题看起来像成功解析，但填进去全是垃圾，比留空更糟。
const JUNK_TITLES = new Set([
  'untitled',
  'document',
  'index',
  'home',
  'error',
  'new page 1',
  '无标题',
  '首页',
  '新建网页 1',
  '新建网页1',
  '页面不存在',
  '出错了',
  '安全验证',
  '403 forbidden',
  '404 not found',
  '404',
  'not found',
  'access denied',
  'forbidden',
  'robot check',
  'are you a robot?',
])

// 登录页字样。只在「整个标题就是登录字样」或「登录字样后紧跟分隔符」时判为登录页，
// 故意不匹配 "Login Manager 使用手册" 这类以登录词开头的正常标题。
const LOGIN_TITLES = new Set([
  'sign in',
  'sign up',
  'signin',
  'log in',
  'login',
  '登录',
  '登陆',
  '请登录',
  '用户登录',
])
const LOGIN_TITLE_PREFIX = /^(sign in|sign up|signin|log in|login|登录|登陆|请登录)\s*[-–—|·:：｜]/

export function isJunkTitle(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return true
  if (JUNK_TITLES.has(normalized)) return true
  // Cloudflare / 各类人机校验页
  if (/^(just a moment|attention required|please wait|checking your browser|一个时刻)/.test(normalized)) {
    return true
  }
  // 需要登录的站点会被跳到登录页，登录页标题不是用户想要的书签名
  if (LOGIN_TITLES.has(normalized) || LOGIN_TITLE_PREFIX.test(normalized)) return true
  return /^(redirecting|正在跳转|页面跳转中)/.test(normalized)
}

// 先切到 <head>，再解析：既排除正文里 <svg><title>Logo</title></svg> 的误命中，
// 也把正则输入从 256KB 缩到通常 20KB 以内。
export function extractHeadSection(html: string): string {
  // 用空格保留分隔，避免移除注释后把两侧片段拼成新的标签或注释起始符。
  // 先排除注释，再找 head/body 边界；未闭合注释持续到输入末尾。
  const uncommented = html.replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
  const lower = uncommented.toLowerCase()
  const headEnd = lower.indexOf('</head>')
  const bodyStart = lower.indexOf('<body')
  const candidates = [headEnd, bodyStart].filter((index) => index >= 0)
  return candidates.length > 0 ? uncommented.slice(0, Math.min(...candidates)) : uncommented
}

export function extractTitleTag(html: string): string | null {
  return html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null
}

// og:* 通常写在 property，但相当一部分站点写成 name，twitter:* 则基本都是 name。
export function extractMetaContent(html: string, key: string): string | null {
  const expected = key.toLowerCase()

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    // content 与 property/name 的书写顺序不固定，逐个标签读属性而不是靠一条大正则。
    const actual = extractAttribute(tag, 'property') ?? extractAttribute(tag, 'name')
    if (actual?.toLowerCase() !== expected) continue

    const content = extractAttribute(tag, 'content')
    if (content) return content
  }

  return null
}

export function hostnameFallbackTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '')
  } catch {
    return ''
  }
}

export function isRootPathUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname
    if (pathname === '' || pathname === '/') return true
    return /^\/(index|home|default)\.(html?|php|aspx?|jsp)$/i.test(pathname)
  } catch {
    return false
  }
}

// 根地址收藏的是「站点」，深层链接收藏的是「这一页」，两者要的名字不同。
export function pickBookmarkTitle(input: {
  html: string | null
  finalUrl: string
  requestedUrl: string
}): string {
  const fallbackUrl = input.finalUrl || input.requestedUrl

  if (input.html) {
    const head = extractHeadSection(input.html)
    const siteName = extractMetaContent(head, 'og:site_name')
    const ogTitle = extractMetaContent(head, 'og:title')
    const twitterTitle = extractMetaContent(head, 'twitter:title')
    const titleTag = extractTitleTag(head)

    // 用用户实际输入的地址判断根/深层：他敲首页就是想要站点名，
    // 敲文章地址就是想要文章标题，重定向落点不代表这个意图。
    const rootIntent = isRootPathUrl(input.requestedUrl || fallbackUrl)
    const ordered = rootIntent
      ? [siteName, ogTitle, twitterTitle, titleTag]
      : [ogTitle, twitterTitle, titleTag, siteName]

    for (const candidate of ordered) {
      const normalized = normalizeTitleText(candidate)
      if (normalized && !isJunkTitle(normalized)) return normalized
    }
  }

  // 兜底用用户输入的地址，而不是重定向落点：mail.google.com 未登录会被跳到
  // accounts.google.com，拿登录页的域名当书签名毫无意义。
  return hostnameFallbackTitle(input.requestedUrl) || hostnameFallbackTitle(fallbackUrl)
}
