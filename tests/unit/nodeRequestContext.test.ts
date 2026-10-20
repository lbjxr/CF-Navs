import { describe, expect, it } from 'vitest'
import { ipMatches, resolveClientIp } from '../../server/requestContext'
import { getClientIp } from '../../worker/middleware/rateLimit'

const headers = (obj: Record<string, string>) => new Headers(obj)
const NO_TRUST = { trustProxy: false, trustProxyCidrs: [] as string[] }
const TRUST_ANY = { trustProxy: true, trustProxyCidrs: [] as string[] }
const TRUST_LAN = { trustProxy: true, trustProxyCidrs: ['10.0.0.0/8', '127.0.0.1'] }

describe('ipMatches', () => {
  it('IPv4 CIDR 与精确匹配', () => {
    expect(ipMatches('10.1.2.3', '10.0.0.0/8')).toBe(true)
    expect(ipMatches('11.1.2.3', '10.0.0.0/8')).toBe(false)
    expect(ipMatches('192.168.1.5', '192.168.1.5')).toBe(true)
    expect(ipMatches('192.168.1.6', '192.168.1.5')).toBe(false)
    expect(ipMatches('203.0.113.9', '0.0.0.0/0')).toBe(true)
  })

  it('IPv4-mapped IPv6 归一后匹配', () => {
    expect(ipMatches('::ffff:10.1.2.3', '10.0.0.0/8')).toBe(true)
    expect(ipMatches('::ffff:127.0.0.1', '127.0.0.1')).toBe(true)
  })

  it('IPv6 CIDR', () => {
    expect(ipMatches('fd00::5', 'fd00::/8')).toBe(true)
    expect(ipMatches('fe80::5', 'fd00::/8')).toBe(false)
    expect(ipMatches('::1', '::1')).toBe(true)
  })

  it('非法输入一律不匹配', () => {
    expect(ipMatches('garbage', '10.0.0.0/8')).toBe(false)
    expect(ipMatches('10.0.0.1', 'garbage/8')).toBe(false)
    expect(ipMatches('10.0.0.1', '10.0.0.0/99')).toBe(false)
  })
})

describe('resolveClientIp（IP 信任边界）', () => {
  it('对端不可信：伪造的全部转发头被忽略', () => {
    const h = headers({ 'cf-connecting-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1', 'x-real-ip': '2.2.2.2' })
    expect(resolveClientIp('203.0.113.50', h, NO_TRUST)).toBe('203.0.113.50')
  })

  it('对端不可信（不在可信 CIDR 内）：同样忽略转发头', () => {
    const h = headers({ 'x-forwarded-for': '1.1.1.1' })
    expect(resolveClientIp('203.0.113.50', h, TRUST_LAN)).toBe('203.0.113.50')
  })

  it('可信代理 + X-Real-IP（覆盖写入）：采用之', () => {
    const h = headers({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '6.6.6.6' })
    expect(resolveClientIp('127.0.0.1', h, TRUST_LAN)).toBe('198.51.100.7')
  })

  it('可信代理 + XFF 追加：取代理追加的右端，攻击者伪造的前缀不生效', () => {
    const h = headers({ 'x-forwarded-for': '6.6.6.6, 6.6.6.7, 198.51.100.7' })
    expect(resolveClientIp('127.0.0.1', h, TRUST_LAN)).toBe('198.51.100.7')
  })

  it('多跳可信代理链：逐跳剥离可信段', () => {
    const h = headers({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7, 10.0.0.9' })
    expect(resolveClientIp('10.0.0.8', h, TRUST_LAN)).toBe('198.51.100.7')
  })

  it('TRUST_PROXY=true 无 CIDR：信任直连对端这一跳', () => {
    const h = headers({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7' })
    expect(resolveClientIp('172.17.0.1', h, TRUST_ANY)).toBe('198.51.100.7')
  })

  it('可信对端但无任何转发头：回落到对端地址', () => {
    expect(resolveClientIp('127.0.0.1', headers({}), TRUST_LAN)).toBe('127.0.0.1')
  })
})

describe('getClientIp 注入优先', () => {
  const fakeContext = (hdrs: Record<string, string>, injected?: string) => ({
    req: { header: (name: string) => hdrs[name] },
    get: (key: 'clientIp') => (key === 'clientIp' ? injected : undefined),
  })

  it('有注入值时忽略伪造头', () => {
    const c = fakeContext({ 'cf-connecting-ip': '8.8.8.8' }, '198.51.100.7')
    expect(getClientIp(c)).toBe('198.51.100.7')
  })

  it('无注入时保持 Worker 语义（cf-connecting-ip 优先）', () => {
    const c = fakeContext({ 'cf-connecting-ip': '8.8.8.8', 'x-forwarded-for': '1.1.1.1' })
    expect(getClientIp(c)).toBe('8.8.8.8')
  })

  it('无注入无头 → unknown（与原行为一致）', () => {
    expect(getClientIp(fakeContext({}))).toBe('unknown')
  })
})
