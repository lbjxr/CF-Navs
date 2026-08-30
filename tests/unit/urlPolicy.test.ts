import { describe, expect, it } from 'vitest'
import { isAllowedBookmarkUrl, normalizeBookmarkUrl } from '../../shared/urlPolicy'
import { toBookmarkPayload } from '../../src/lib/adminFormAdapters'

describe('bookmark url protocol allowlist', () => {
  it('accepts http and https', () => {
    expect(isAllowedBookmarkUrl('https://example.com')).toBe(true)
    expect(isAllowedBookmarkUrl('http://example.com/a?b=1#c')).toBe(true)
    expect(isAllowedBookmarkUrl('  https://example.com  ')).toBe(true)
    expect(isAllowedBookmarkUrl('HTTPS://EXAMPLE.COM')).toBe(true)
    expect(isAllowedBookmarkUrl('http://192.168.1.10:8123/lovelace')).toBe(true)
  })

  it('rejects script-capable and non-web protocols', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'ftp://example.com',
      'blob:https://example.com/abc',
    ]) {
      expect(isAllowedBookmarkUrl(value), value).toBe(false)
    }
  })

  it('rejects the usual obfuscation variants', () => {
    // URL 解析器负责小写化和剥离内嵌控制字符，所以这些都归一化到同一个协议。
    expect(isAllowedBookmarkUrl('JaVaScRiPt:alert(1)')).toBe(false)
    expect(isAllowedBookmarkUrl('java\nscript:alert(1)')).toBe(false)
    expect(isAllowedBookmarkUrl('java\tscript:alert(1)')).toBe(false)
    expect(isAllowedBookmarkUrl('  javascript:alert(1)  ')).toBe(false)
  })

  it('rejects values that are not parseable urls at all', () => {
    expect(isAllowedBookmarkUrl('')).toBe(false)
    expect(isAllowedBookmarkUrl('   ')).toBe(false)
    expect(isAllowedBookmarkUrl('example.com')).toBe(false)
    expect(isAllowedBookmarkUrl(null)).toBe(false)
    expect(isAllowedBookmarkUrl(undefined)).toBe(false)
    expect(isAllowedBookmarkUrl(42)).toBe(false)
  })
})

describe('imported bookmark url normalization', () => {
  it('keeps already valid urls byte-for-byte', () => {
    expect(normalizeBookmarkUrl('https://example.com/a')).toBe('https://example.com/a')
    // 不做尾部斜杠之类的重写：备份恢复后地址应该和导出时一致
    expect(normalizeBookmarkUrl('http://example.com')).toBe('http://example.com')
  })

  it('rescues values that only lack a scheme', () => {
    expect(normalizeBookmarkUrl('example.com/x')).toBe('https://example.com/x')
    expect(normalizeBookmarkUrl('//example.com')).toBe('https://example.com/')
    // 自建服务常见写法：冒号后是纯数字时按 host:port 理解，而不是当成协议
    expect(normalizeBookmarkUrl('localhost:8080')).toBe('https://localhost:8080/')
    expect(normalizeBookmarkUrl('192.168.1.10:8123/x')).toBe('https://192.168.1.10:8123/x')
  })

  it('drops values that declare a non-web scheme instead of mangling them', () => {
    // 盲目补 https:// 会把 ftp://a.com 变成 https://ftp//a.com —— 既不是原意也不可用，
    // 比如实丢弃更糟。声明了协议的一律按原值判定。
    expect(normalizeBookmarkUrl('ftp://example.com')).toBeNull()
    expect(normalizeBookmarkUrl('file:///etc/passwd')).toBeNull()
    expect(normalizeBookmarkUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeBookmarkUrl('data:text/html,x')).toBeNull()
  })

  it('drops empty and non-string values', () => {
    expect(normalizeBookmarkUrl('')).toBeNull()
    expect(normalizeBookmarkUrl('   ')).toBeNull()
    expect(normalizeBookmarkUrl(null)).toBeNull()
    expect(normalizeBookmarkUrl(123)).toBeNull()
  })
})

describe('admin form url normalization', () => {
  const baseForm = {
    category_id: 1,
    title: 'Site',
    url: '',
    icon: '',
    icon_source: '',
    icon_background_color: '',
    description: '',
    description_mode: 'inherit' as const,
    open_method: 'new_tab' as const,
  }

  it('completes a bare domain typed into the admin form', () => {
    // 直接敲 example.com 是常见输入习惯，不该撞上服务端的英文协议校验报错
    expect(toBookmarkPayload({ ...baseForm, url: '  example.com/tools  ' }).url)
      .toBe('https://example.com/tools')
  })

  it('leaves a well-formed url untouched', () => {
    expect(toBookmarkPayload({ ...baseForm, url: 'https://github.com/a?b=1' }).url)
      .toBe('https://github.com/a?b=1')
  })

  it('normalizes the optional internal url independently', () => {
    expect(toBookmarkPayload({ ...baseForm, internal_url: 'http://192.168.100.111:5666/login' }).internal_url)
      .toBe('http://192.168.100.111:5666/login')
    expect(toBookmarkPayload({ ...baseForm, internal_url: '   ' }).internal_url).toBeNull()
  })

  it('sends an unrescuable value through so the server owns the rejection', () => {
    // 前端不假装能修：补不了的原样提交，由服务端返回权威错误，
    // 避免前端悄悄改成一个用户没输入过的地址。
    expect(toBookmarkPayload({ ...baseForm, url: '  javascript:alert(1)  ' }).url)
      .toBe('javascript:alert(1)')
  })
})
