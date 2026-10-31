// Node 请求来源解析：客户端 IP 信任边界（方案阶段 4 安全项）。
//
// 原则：转发头只有在「直连对端是已配置的可信代理」时才采信，且采信方式是
// 「代理覆盖写入的 X-Real-IP 优先，其次从 X-Forwarded-For 右端逐跳剥离可信代理」。
// 解析结果经 Hono Variables.clientIp 注入共享代码（worker/middleware/rateLimit.ts
// 的 getClientIp 优先取注入值）；Worker 路径不经过本模块，行为不变。

import { getConnInfo } from '@hono/node-server/conninfo'
import type { MiddlewareHandler } from 'hono'
import type { HonoEnv } from '../worker/types'
import type { ServerConfig } from './config'

/** 归一 IPv4-mapped IPv6（Node 双栈 socket 常见 ::ffff:1.2.3.4）。 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim()
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(trimmed)
  return mapped ? mapped[1] : trimmed
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = value * 256 + n
  }
  return value
}

function ipv6ToBigInt(ip: string): bigint | null {
  let addr = ip.toLowerCase()
  const zone = addr.indexOf('%')
  if (zone >= 0) addr = addr.slice(0, zone)
  const halves = addr.split('::')
  if (halves.length > 2) return null
  const parseHalf = (half: string): number[] | null => {
    if (!half) return []
    const groups: number[] = []
    for (const part of half.split(':')) {
      if (part.includes('.')) {
        const v4 = ipv4ToInt(part)
        if (v4 === null) return null
        groups.push(Math.floor(v4 / 65536), v4 % 65536)
      } else {
        if (!/^[0-9a-f]{1,4}$/.test(part)) return null
        groups.push(parseInt(part, 16))
      }
    }
    return groups
  }
  const left = parseHalf(halves[0])
  const right = halves.length === 2 ? parseHalf(halves[1]) : []
  if (left === null || right === null) return null
  const missing = 8 - left.length - right.length
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null
  const groups = [...left, ...Array(missing).fill(0), ...right]
  let value = 0n
  for (const g of groups) value = (value << 16n) | BigInt(g)
  return value
}

/** 判断 ip 是否落在 cidr（或与裸 IP 相等）内；版本不一致或格式非法一律 false。 */
export function ipMatches(ip: string, cidr: string): boolean {
  const normalized = normalizeIp(ip)
  const [base, prefixRaw] = cidr.trim().split('/')
  const baseNormalized = normalizeIp(base)
  if (prefixRaw === undefined) return normalized === baseNormalized

  const prefix = Number(prefixRaw)
  if (!Number.isInteger(prefix) || prefix < 0) return false

  const ipV4 = ipv4ToInt(normalized)
  const baseV4 = ipv4ToInt(baseNormalized)
  if (ipV4 !== null && baseV4 !== null) {
    if (prefix > 32) return false
    if (prefix === 0) return true
    const mask = (0xffffffff << (32 - prefix)) >>> 0
    return (ipV4 & mask) === (baseV4 & mask)
  }
  const ipV6 = ipv6ToBigInt(normalized)
  const baseV6 = ipv6ToBigInt(baseNormalized)
  if (ipV6 !== null && baseV6 !== null) {
    if (prefix > 128) return false
    if (prefix === 0) return true
    const shift = BigInt(128 - prefix)
    return ipV6 >> shift === baseV6 >> shift
  }
  return false
}

type TrustConfig = Pick<ServerConfig, 'trustProxy' | 'trustProxyCidrs'>

function peerIsTrusted(peer: string, config: TrustConfig): boolean {
  if (!config.trustProxy) return false
  if (config.trustProxyCidrs.length === 0) return true
  return config.trustProxyCidrs.some((cidr) => ipMatches(peer, cidr))
}

function chainEntryTrusted(entry: string, peer: string, config: TrustConfig): boolean {
  if (entry === peer) return true
  if (config.trustProxyCidrs.length === 0) return false
  return config.trustProxyCidrs.some((cidr) => ipMatches(entry, cidr))
}

/**
 * 从直连对端与请求头解析真实客户端 IP。
 * - 对端不可信：忽略全部转发头，客户端就是对端（伪造头不生效）。
 * - 对端可信：X-Real-IP（代理覆盖写入）优先；否则 XFF 从右向左剥可信跳。
 */
export function resolveClientIp(peer: string, headers: Headers, config: TrustConfig): string {
  const normalizedPeer = normalizeIp(peer)
  if (!peerIsTrusted(normalizedPeer, config)) return normalizedPeer

  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return normalizeIp(realIp)

  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const chain = forwarded
      .split(',')
      .map((part) => normalizeIp(part))
      .filter(Boolean)
    for (let i = chain.length - 1; i >= 0; i--) {
      if (!chainEntryTrusted(chain[i], normalizedPeer, config)) return chain[i]
    }
    if (chain.length > 0) return chain[0]
  }
  return normalizedPeer
}

/** Node 入口中间件：把解析出的客户端 IP 注入每个请求的 Variables.clientIp。 */
export function clientIpMiddleware(config: TrustConfig): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    let peer = 'unknown'
    try {
      peer = getConnInfo(c).remote.address ?? 'unknown'
    } catch {
      // 非 @hono/node-server 承载环境（如直接 app.request 的测试）没有连接信息，保持 unknown
    }
    c.set('clientIp', resolveClientIp(peer, c.req.raw.headers, config))
    await next()
  }
}
