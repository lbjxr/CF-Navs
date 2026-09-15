import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities } from '../../shared/decodeHtmlEntities'
import {
  MAX_TITLE_LENGTH,
  decodeHtmlBytes,
  extractCharsetLabel,
  extractHeadSection,
  extractIconCandidates,
  extractMetaContent,
  extractTitleTag,
  hostnameFallbackTitle,
  isBlockedFetchHostname,
  isJunkTitle,
  isRootPathUrl,
  normalizeTitleText,
  parseTargetUrl,
  pickBookmarkTitle,
  readHtmlHeadBytes,
  resolveHttpUrl,
} from '../../worker/lib/pageMetadata'

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

// 真实字节，不是伪造的占位值
const GBK_BAIDU = bytes(0xb0, 0xd9, 0xb6, 0xc8, 0xd2, 0xbb, 0xcf, 0xc2) // 百度一下
const GBK_ZHONGWEN = bytes(0xd6, 0xd0, 0xce, 0xc4) // 中文
const BIG5_ZHONGWEN = bytes(0xa4, 0xa4, 0xa4, 0xe5) // 中文
const SHIFT_JIS_NIHON = bytes(0x93, 0xfa, 0x96, 0x7b) // 日本
const UTF8_BOM = bytes(0xef, 0xbb, 0xbf)

describe('pageMetadata charset handling', () => {
  it('reads charset from the content-type header', () => {
    expect(extractCharsetLabel('text/html; charset=GBK', '')).toBe('gbk')
    expect(extractCharsetLabel('text/html;charset="gb2312"', '')).toBe('gb2312')
    expect(extractCharsetLabel('text/html; charset=utf-8; boundary=x', '')).toBe('utf-8')
  })

  it('falls back to the meta charset declaration', () => {
    expect(extractCharsetLabel(null, '<meta charset="gb2312">')).toBe('gb2312')
    expect(extractCharsetLabel(null, '<meta charset=gbk>')).toBe('gbk')
    expect(
      extractCharsetLabel(null, '<meta http-equiv="Content-Type" content="text/html; charset=big5">'),
    ).toBe('big5')
  })

  it('prefers the header over the document declaration', () => {
    expect(extractCharsetLabel('text/html; charset=utf-8', '<meta charset="gb2312">')).toBe('utf-8')
  })

  it('decodes GBK, Big5 and Shift_JIS page bytes', () => {
    const gbkPage = concat(utf8('<title>'), GBK_BAIDU, utf8('</title>'))
    expect(decodeHtmlBytes(gbkPage, 'text/html; charset=gbk')).toContain('百度一下')

    const big5Page = concat(utf8('<title>'), BIG5_ZHONGWEN, utf8('</title>'))
    expect(decodeHtmlBytes(big5Page, 'text/html; charset=big5')).toContain('中文')

    const sjisPage = concat(utf8('<title>'), SHIFT_JIS_NIHON, utf8('</title>'))
    expect(decodeHtmlBytes(sjisPage, 'text/html; charset=shift_jis')).toContain('日本')
  })

  it('lets a UTF-8 BOM override a stale charset declaration', () => {
    // TextDecoder('gbk') 不会剥 BOM，声明压过 BOM 会把整篇文档解坏
    const page = concat(UTF8_BOM, utf8('<title>百度一下</title>'))
    const html = decodeHtmlBytes(page, 'text/html; charset=gbk')

    expect(html).toContain('百度一下')
    expect(html.startsWith('<title>')).toBe(true)
  })

  it('falls back to UTF-8 for unsupported charset labels', () => {
    const page = utf8('<title>Hello</title>')
    expect(decodeHtmlBytes(page, 'text/html; charset=x-foobar')).toContain('Hello')
    // Node 会对该 label 抛 RangeError，必须被捕获
    expect(decodeHtmlBytes(page, 'text/html; charset=x-user-defined')).toContain('Hello')
  })

  it('maps common misspelled charset aliases', () => {
    const page = concat(utf8('<title>'), GBK_ZHONGWEN, utf8('</title>'))
    expect(decodeHtmlBytes(page, 'text/html; charset=gb_2312')).toContain('中文')
  })

  it('produces a replacement character when GBK bytes are read as UTF-8', () => {
    const page = concat(utf8('<title>'), GBK_ZHONGWEN, utf8('</title>'))
    // 这正是 normalizeTitleText 的 U+FFFD 体检要拦下的情况
    expect(decodeHtmlBytes(page, 'text/html; charset=utf-8')).toContain('�')
  })
})

describe('pageMetadata streaming head read', () => {
  // 用 pull 而不是 start 预先入队，才能观察到「不再继续拉取」这个真正的行为。
  // 命中 </head> 时当前 chunk 已经复制完了，省下的是后面的 chunk。
  function pullStream(chunks: Uint8Array[], pulled: Uint8Array[]): ReadableStream<Uint8Array> {
    let index = 0
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (index >= chunks.length) {
          controller.close()
          return
        }
        const chunk = chunks[index++]
        pulled.push(chunk)
        controller.enqueue(chunk)
      },
    })
  }

  it('stops pulling once </head> arrives', async () => {
    const pulled: Uint8Array[] = []
    const bytes = await readHtmlHeadBytes(
      pullStream([utf8('<html><head><title>Fast</title></head>'), utf8('x'.repeat(50_000))], pulled),
    )

    expect(pulled).toHaveLength(1) // 50KB 的 body 从未被拉取
    expect(new TextDecoder().decode(bytes)).toContain('<title>Fast</title>')
  })

  it('detects </head> split across chunk boundaries', async () => {
    const pulled: Uint8Array[] = []
    const bytes = await readHtmlHeadBytes(
      pullStream(
        [utf8('<head><title>Split</title></he'), utf8('ad><body>'), utf8('y'.repeat(50_000))],
        pulled,
      ),
    )

    expect(pulled).toHaveLength(2)
    expect(new TextDecoder().decode(bytes)).toContain('Split')
  })

  it('matches an uppercase </HEAD>', async () => {
    const pulled: Uint8Array[] = []
    await readHtmlHeadBytes(
      pullStream([utf8('<HEAD><TITLE>Up</TITLE></HEAD>'), utf8('z'.repeat(50_000))], pulled),
    )

    expect(pulled).toHaveLength(1)
  })

  it('caps the read when </head> never appears', async () => {
    const pulled: Uint8Array[] = []
    const bytes = await readHtmlHeadBytes(pullStream([utf8('<html>' + 'z'.repeat(5_000))], pulled), 1_024)

    expect(bytes.length).toBe(1_024)
  })

  it('returns everything when the stream ends early', async () => {
    const pulled: Uint8Array[] = []
    const bytes = await readHtmlHeadBytes(pullStream([utf8('<html><title>Tiny</title>')], pulled))

    expect(new TextDecoder().decode(bytes)).toBe('<html><title>Tiny</title>')
  })
})

describe('pageMetadata html extraction', () => {
  it('extracts the title tag with attributes and across lines', () => {
    expect(extractTitleTag('<title>Hello</title>')).toBe('Hello')
    expect(extractTitleTag('<title lang="zh">中文标题</title>')).toBe('中文标题')
    expect(extractTitleTag('<TITLE>Upper</TITLE>')).toBe('Upper')
    expect(extractTitleTag('<title>\n  Multi\n  line\n</title>')).toContain('Multi')
    expect(extractTitleTag('<p>no title</p>')).toBeNull()
  })

  it('reads meta content from either property or name', () => {
    expect(extractMetaContent('<meta property="og:title" content="Via property">', 'og:title')).toBe(
      'Via property',
    )
    expect(extractMetaContent('<meta name="og:title" content="Via name">', 'og:title')).toBe('Via name')
    expect(extractMetaContent('<meta name="twitter:title" content="Tweet">', 'twitter:title')).toBe('Tweet')
  })

  it('reads meta content regardless of attribute order or quoting', () => {
    expect(extractMetaContent('<meta content="First" property="og:title" />', 'og:title')).toBe('First')
    expect(extractMetaContent("<meta property='og:title' content='Single'>", 'og:title')).toBe('Single')
    expect(extractMetaContent('<META PROPERTY="OG:TITLE" CONTENT="Upper">', 'og:title')).toBe('Upper')
    expect(extractMetaContent('<meta property="og:title" content="">', 'og:title')).toBeNull()
  })

  it('ignores titles and meta tags outside the head', () => {
    const html = [
      '<html><head>',
      '<!-- <meta property="og:title" content="Commented"> -->',
      '<title>Real Title</title>',
      '</head><body>',
      '<svg><title>Logo</title></svg>',
      '</body></html>',
    ].join('')
    const head = extractHeadSection(html)

    expect(extractTitleTag(head)).toBe('Real Title')
    expect(extractMetaContent(head, 'og:title')).toBeNull()
  })

  it('does not truncate the head at boundaries inside comments', () => {
    const head = extractHeadSection('<head><!-- </head><body> --><title>Real Title</title></head><body>')

    expect(extractTitleTag(head)).toBe('Real Title')
  })

  it('does not join markup fragments across removed comments', () => {
    const head = extractHeadSection('<head><met<!-- gap -->a property="og:title" content="Forged"><title>Real Title</title></head>')

    expect(extractMetaContent(head, 'og:title')).toBeNull()
    expect(extractTitleTag(head)).toBe('Real Title')
  })

  it('ignores metadata in an unterminated comment', () => {
    const head = extractHeadSection('<head><title>Real Title</title><!-- <meta property="og:title" content="Hidden">')

    expect(extractMetaContent(head, 'og:title')).toBeNull()
    expect(extractTitleTag(head)).toBe('Real Title')
  })

  it('still extracts icon candidates after the refactor', () => {
    const html = [
      '<link rel="icon" href="/favicon.ico">',
      '<link rel="apple-touch-icon" href="https://cdn.example.com/a.png">',
      '<link rel="stylesheet" href="/a.css">',
    ].join('')

    expect(extractIconCandidates(html, 'https://example.com/page')).toEqual([
      'https://example.com/favicon.ico',
      'https://cdn.example.com/a.png',
    ])
  })
})

describe('pageMetadata text normalization', () => {
  it('decodes named, decimal and hex entities in a single pass', () => {
    expect(decodeHtmlEntities('a &amp; b')).toBe('a & b')
    expect(decodeHtmlEntities('&lt;tag&gt;')).toBe('<tag>')
    expect(decodeHtmlEntities('it&#39;s')).toBe("it's")
    expect(decodeHtmlEntities('it&#x27;s')).toBe("it's")
    expect(decodeHtmlEntities('&#20013;&#x6587;')).toBe('中文')
    expect(decodeHtmlEntities('a&mdash;b')).toBe('a—b')
  })

  it('does not double-decode escaped entities', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;')
  })

  it('leaves invalid and unknown entities untouched', () => {
    expect(decodeHtmlEntities('&foo;')).toBe('&foo;')
    expect(decodeHtmlEntities('&#999999999;')).toBe('&#999999999;')
    expect(decodeHtmlEntities('&#xD800;')).toBe('&#xD800;')
    expect(decodeHtmlEntities('&#0;')).toBe('&#0;')
  })

  it('collapses whitespace and strips control characters', () => {
    expect(normalizeTitleText('  Hello \n\t  World  ')).toBe('Hello World')
    expect(normalizeTitleText('中文　标题')).toBe('中文 标题')
    expect(normalizeTitleText('ab')).toBe('ab')
  })

  it('strips zero-width and bidi override characters', () => {
    expect(normalizeTitleText('a​b')).toBe('ab')
    expect(normalizeTitleText('safe‮gnahc')).toBe('safegnahc')
  })

  it('rejects text that failed to decode', () => {
    expect(normalizeTitleText('中�文')).toBe('')
  })

  it('truncates on code points without splitting surrogate pairs', () => {
    const long = 'a'.repeat(MAX_TITLE_LENGTH + 20)
    expect(Array.from(normalizeTitleText(long))).toHaveLength(MAX_TITLE_LENGTH)

    const emoji = '😀'.repeat(MAX_TITLE_LENGTH + 5)
    const codePoints = Array.from(normalizeTitleText(emoji))
    expect(codePoints).toHaveLength(MAX_TITLE_LENGTH)
    // 劈开代理对会产生孤立代理项，那样最后一个码位就不再等于完整的 emoji
    expect(codePoints.every((point) => point === '😀')).toBe(true)
  })

  it('returns an empty string for empty input', () => {
    expect(normalizeTitleText('')).toBe('')
    expect(normalizeTitleText(null)).toBe('')
    expect(normalizeTitleText(undefined)).toBe('')
  })
})

describe('pageMetadata junk title detection', () => {
  it('rejects placeholder and error titles', () => {
    expect(isJunkTitle('Untitled')).toBe(true)
    expect(isJunkTitle('无标题')).toBe(true)
    expect(isJunkTitle('404 Not Found')).toBe(true)
    expect(isJunkTitle('  ')).toBe(true)
  })

  it('rejects anti-bot interstitial titles', () => {
    expect(isJunkTitle('Just a moment...')).toBe(true)
    expect(isJunkTitle('Attention Required! | Cloudflare')).toBe(true)
    expect(isJunkTitle('Checking your browser before accessing')).toBe(true)
  })

  it('rejects login page titles', () => {
    expect(isJunkTitle('Sign in - Google Accounts')).toBe(true)
    expect(isJunkTitle('登录 - 知乎')).toBe(true)
    expect(isJunkTitle('Sign in')).toBe(true)
    expect(isJunkTitle('登录')).toBe(true)
    expect(isJunkTitle('Redirecting...')).toBe(true)
  })

  it('does not reject ordinary titles that merely start with a login word', () => {
    // 故意保守：宁可漏掉 "Log in to GitHub"，也不能把这类正常标题判成登录页
    expect(isJunkTitle('Login Manager 使用手册')).toBe(false)
    expect(isJunkTitle('Log in to GitHub')).toBe(false)
    expect(isJunkTitle('登录态设计笔记')).toBe(false)
  })

  it('accepts real titles', () => {
    expect(isJunkTitle('GitHub')).toBe(false)
    expect(isJunkTitle('百度一下，你就知道')).toBe(false)
    expect(isJunkTitle('Signal 官网')).toBe(false)
  })
})

describe('pageMetadata url helpers', () => {
  it('detects root URLs', () => {
    expect(isRootPathUrl('https://example.com')).toBe(true)
    expect(isRootPathUrl('https://example.com/')).toBe(true)
    expect(isRootPathUrl('https://example.com/?q=1#f')).toBe(true)
    expect(isRootPathUrl('https://example.com/index.html')).toBe(true)
    expect(isRootPathUrl('https://example.com/a/b')).toBe(false)
    expect(isRootPathUrl('not a url')).toBe(false)
  })

  it('builds a hostname fallback without the www prefix', () => {
    expect(hostnameFallbackTitle('https://www.example.com/a')).toBe('example.com')
    expect(hostnameFallbackTitle('https://wwww.example.com')).toBe('wwww.example.com')
    expect(hostnameFallbackTitle('nope')).toBe('')
  })

  it('strips embedded credentials from the target url', () => {
    const parsed = parseTargetUrl('https://user:secret@example.com/a')

    expect(parsed?.username).toBe('')
    expect(parsed?.password).toBe('')
    expect(parsed?.toString()).toBe('https://example.com/a')
  })

  it('rejects non-http protocols', () => {
    expect(parseTargetUrl('ftp://example.com')).toBeNull()
    expect(parseTargetUrl('javascript:alert(1)')).toBeNull()
    expect(parseTargetUrl('')).toBeNull()
    expect(parseTargetUrl(null)).toBeNull()
  })
})

describe('pageMetadata outbound target filtering', () => {
  it('blocks loopback, private and link-local IPv4 targets', () => {
    for (const host of [
      '127.0.0.1',
      '127.1.2.3',
      '0.0.0.0',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254', // 云元数据端点
      '100.64.0.1',
      '224.0.0.1',
    ]) {
      expect(isBlockedFetchHostname(host)).toBe(true)
      expect(parseTargetUrl(`http://${host}/a`)).toBeNull()
    }
  })

  it('allows public IPv4 targets that merely look similar', () => {
    for (const host of ['172.15.0.1', '172.32.0.1', '192.169.1.1', '11.0.0.1', '100.63.0.1', '8.8.8.8']) {
      expect(isBlockedFetchHostname(host)).toBe(false)
    }
  })

  it('blocks numeric and hex spellings of loopback', () => {
    // WHATWG URL 解析器会先把这些形式归一成 127.0.0.1
    expect(new URL('http://2130706433/').hostname).toBe('127.0.0.1')
    expect(parseTargetUrl('http://2130706433/')).toBeNull()
    expect(parseTargetUrl('http://0x7f.0.0.1/')).toBeNull()
    expect(parseTargetUrl('http://127.1/')).toBeNull()
  })

  it('blocks loopback, unique-local and link-local IPv6 targets', () => {
    for (const host of ['[::1]', '[::]', '[fc00::1]', '[fd12:3456::1]', '[fe80::1]', '[febf::1]']) {
      expect(isBlockedFetchHostname(host)).toBe(true)
    }
    expect(parseTargetUrl('http://[::1]:8080/a')).toBeNull()
    expect(parseTargetUrl('http://[0:0:0:0:0:0:0:1]/')).toBeNull()
  })

  it('blocks IPv4-mapped IPv6 loopback', () => {
    expect(isBlockedFetchHostname('[::ffff:127.0.0.1]')).toBe(true)
    expect(isBlockedFetchHostname('[::ffff:8.8.8.8]')).toBe(false)
  })

  it('allows public IPv6 targets', () => {
    expect(isBlockedFetchHostname('[2001:4860:4860::8888]')).toBe(false)
    expect(isBlockedFetchHostname('[fec0::1]')).toBe(false)
  })

  it('blocks internal hostnames regardless of case or trailing dot', () => {
    for (const host of [
      'localhost',
      'LOCALHOST',
      'localhost.',
      'db.localhost',
      'printer.local',
      'metadata.google.internal',
      'anything.internal',
    ]) {
      expect(isBlockedFetchHostname(host)).toBe(true)
    }
  })

  it('allows ordinary public hostnames', () => {
    for (const host of ['example.com', 'www.github.com', 'localhost.example.com', 'my-local.com']) {
      expect(isBlockedFetchHostname(host)).toBe(false)
    }
  })

  it('blocks icon candidates that point at internal addresses', () => {
    // 目标页可控：不过滤就能绕开 parseTargetUrl
    expect(resolveHttpUrl('http://169.254.169.254/latest/meta-data/', 'https://evil.example.com/')).toBeNull()
    expect(resolveHttpUrl('//127.0.0.1/icon.png', 'https://evil.example.com/')).toBeNull()
    expect(resolveHttpUrl('/favicon.ico', 'https://example.com/page')).toBe('https://example.com/favicon.ico')
  })
})

describe('pickBookmarkTitle', () => {
  const fullHead = [
    '<head>',
    '<meta property="og:site_name" content="GitHub">',
    '<meta property="og:title" content="sveltejs/svelte">',
    '<title>GitHub - sveltejs/svelte</title>',
    '</head>',
  ].join('')

  it('prefers the site name for root URLs', () => {
    expect(
      pickBookmarkTitle({
        html: fullHead,
        finalUrl: 'https://github.com/',
        requestedUrl: 'https://github.com',
      }),
    ).toBe('GitHub')
  })

  it('prefers the page title for deep links', () => {
    expect(
      pickBookmarkTitle({
        html: fullHead,
        finalUrl: 'https://github.com/sveltejs/svelte',
        requestedUrl: 'https://github.com/sveltejs/svelte',
      }),
    ).toBe('sveltejs/svelte')
  })

  it('decides root intent from the requested url, not the redirect target', () => {
    // 用户敲的是首页，重定向到了本地化落地页，仍应给站点名
    expect(
      pickBookmarkTitle({
        html: fullHead,
        finalUrl: 'https://github.com/zh-cn/home',
        requestedUrl: 'https://github.com',
      }),
    ).toBe('GitHub')
  })

  it('falls back through the priority chain on a root URL', () => {
    const noSiteName = '<head><meta property="og:title" content="Only OG"><title>Tag</title></head>'
    expect(
      pickBookmarkTitle({
        html: noSiteName,
        finalUrl: 'https://example.com/',
        requestedUrl: 'https://example.com/',
      }),
    ).toBe('Only OG')

    const onlyTitleTag = '<head><title>Hacker News</title></head>'
    expect(
      pickBookmarkTitle({
        html: onlyTitleTag,
        finalUrl: 'https://news.ycombinator.com/',
        requestedUrl: 'https://news.ycombinator.com/',
      }),
    ).toBe('Hacker News')
  })

  it('falls back to og:site_name for a deep link with no other source', () => {
    const onlySiteName = '<head><meta property="og:site_name" content="Example Site"></head>'
    expect(
      pickBookmarkTitle({
        html: onlySiteName,
        finalUrl: 'https://example.com/a/b',
        requestedUrl: 'https://example.com/a/b',
      }),
    ).toBe('Example Site')
  })

  it('falls back to the hostname when the page could not be parsed', () => {
    expect(
      pickBookmarkTitle({
        html: null,
        finalUrl: 'https://www.example.com/a',
        requestedUrl: 'https://www.example.com/a',
      }),
    ).toBe('example.com')
  })

  it('falls back to the requested host, not the redirect target', () => {
    // mail.google.com 未登录会被跳到 accounts.google.com，
    // 拿登录页的域名当书签名毫无意义
    const loginPage = '<head><title>Sign in - Google Accounts</title></head>'
    expect(
      pickBookmarkTitle({
        html: loginPage,
        finalUrl: 'https://accounts.google.com/ServiceLogin?service=mail',
        requestedUrl: 'https://mail.google.com/mail/u/0/',
      }),
    ).toBe('mail.google.com')
  })

  it('still uses the redirect target title for ordinary redirects', () => {
    // 短链和域名迁移是正常重定向，落点标题才是用户要的
    const article = '<head><meta property="og:title" content="真实文章标题"></head>'
    expect(
      pickBookmarkTitle({
        html: article,
        finalUrl: 'https://blog.example.com/posts/1',
        requestedUrl: 'https://sho.rt/abc',
      }),
    ).toBe('真实文章标题')
  })

  it('skips anti-bot interstitial titles instead of filling them in', () => {
    const blocked = '<head><title>Just a moment...</title></head>'
    expect(
      pickBookmarkTitle({
        html: blocked,
        finalUrl: 'https://guarded.example.com/',
        requestedUrl: 'https://guarded.example.com/',
      }),
    ).toBe('guarded.example.com')
  })

  it('skips candidates that failed to decode', () => {
    const mojibake = '<head><title>���</title></head>'
    expect(
      pickBookmarkTitle({
        html: mojibake,
        finalUrl: 'https://legacy.example.com/',
        requestedUrl: 'https://legacy.example.com/',
      }),
    ).toBe('legacy.example.com')
  })
})
