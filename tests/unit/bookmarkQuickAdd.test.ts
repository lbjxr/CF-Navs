import { describe, expect, it } from 'vitest'
import { getBookmarkQuickAddUrl } from '../../src/lib/bookmarkQuickAdd'

describe('search bookmark quick-add URL recognition', () => {
  it.each([
    ['https://example.com', 'https://example.com'],
    ['  HTTP://Example.com/Case?q=Value#Part  ', 'HTTP://Example.com/Case?q=Value#Part'],
    ['example.com', 'https://example.com/'],
    ['www.example.com/Path?q=Value', 'https://www.example.com/Path?q=Value'],
    ['//example.com/Path', 'https://example.com/Path'],
    ['https://example.com:8443/Path', 'https://example.com:8443/Path'],
    ['https://example.com/a%20b', 'https://example.com/a%20b'],
    ['localhost:8080/path', 'https://localhost:8080/path'],
    ['http://localhost:3000', 'http://localhost:3000'],
    ['192.0.2.1:8080/path', 'https://192.0.2.1:8080/path'],
    ['http://[2001:db8::1]:8080/path', 'http://[2001:db8::1]:8080/path'],
    ['[::1]:3000', 'https://[::1]:3000/'],
    ['例子.测试/路径', 'https://xn--fsqu00a.xn--0zwm56d/%E8%B7%AF%E5%BE%84'],
    ['https://例子.测试/路径', 'https://例子.测试/路径'],
  ])('recognizes %s without changing an existing URL', (query, expected) => {
    expect(getBookmarkQuickAddUrl(query)).toBe(expected)
  })

  it.each([
    '', '   ', 'wwer', 'sdl fjsd', '搜索书签', 'example', 'example.c',
    'example..com', '-example.com', 'example-.com', 'example_com.test',
    'https://', 'https:///example.com', 'http:example.com',
    'ftp://example.com', 'javascript:alert(1)', 'data:text/html,<h1>x</h1>',
    'file:///C:/example.txt', 'https://reader@example.com', 'reader@example.com',
    'https://example.com/a b', 'https://example.com\n/Path', 'https://example.com\\path',
    'https://example.com:65536', '999.999.999.999', '192.0.2.999', '1.2', '12345',
    '[not-ipv6]', 'https://[:::1]', `https://${'a'.repeat(64)}.example`,
  ])('does not offer a bookmark for %j', (query) => {
    expect(getBookmarkQuickAddUrl(query)).toBeNull()
  })
})
