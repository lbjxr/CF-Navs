import { normalizeBookmarkUrl } from '../../shared/urlPolicy'

// 先用正则识别网址形态，再复用书签写入策略。普通关键词不能仅因 URL() 能补全就成为网址。
const WEB_ADDRESS = /^(?:(?:https?:)?\/\/)?(\[[0-9a-f:.]+\]|[^:/?#@\s\\]+)(?::\d{1,5})?(?:[/?#][^\s\\]*)?$/i
const IPV4_ADDRESS = /^(?:\d{1,3}\.){3}\d{1,3}$/
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i
const DOMAIN_SUFFIX = /^(?:[a-z]{2,63}|xn--[a-z0-9-]+)$/i

/** 搜索无结果时可预填的新书签网址；不请求网络，也不改动搜索关键词。 */
export function getBookmarkQuickAddUrl(query: string): string | null {
  const value = query.trim()
  if (/\p{Cc}/u.test(value)) return null
  const match = WEB_ADDRESS.exec(value)
  if (!match) return null

  const normalized = normalizeBookmarkUrl(value)
  if (!normalized) return null
  const { hostname } = new URL(normalized)

  // URL 解析器负责 IP 和端口范围校验；原文必须是完整 IP，避免把「1.2」识别成网址。
  if (hostname === 'localhost' || IPV4_ADDRESS.test(match[1]) || match[1].startsWith('[')) return normalized

  // hostname 已由 URL 转为 ASCII，中文域名与 punycode 因而遵循同一套标签规则。
  const domain = hostname.replace(/\.$/, '')
  const labels = domain.split('.')
  if (domain.length > 253 || labels.length < 2 || !labels.every((label) => DOMAIN_LABEL.test(label))) return null
  if (!DOMAIN_SUFFIX.test(labels[labels.length - 1])) return null
  return normalized
}
