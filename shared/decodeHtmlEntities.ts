// 标题、属性与浏览器书签导入共用的实体子集，不引入完整的 WHATWG 实体表。
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  ensp: '\u2002',
  emsp: '\u2003',
  thinsp: '\u2009',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  laquo: '\u00ab',
  raquo: '\u00bb',
  middot: '\u00b7',
  bull: '\u2022',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  deg: '\u00b0',
  times: '\u00d7',
  divide: '\u00f7',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  sect: '\u00a7',
  para: '\u00b6',
}

function safeFromCodePoint(code: number, fallback: string): string {
  // 代理区码位不是合法字符，String.fromCodePoint 不会为它们抛错。
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return fallback
  if (code >= 0xd800 && code <= 0xdfff) return fallback
  return String.fromCodePoint(code)
}

// 仅解码一次，保留 &amp;lt; 中的转义层；返回值是文本，不能当作 HTML 注入。
export function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g,
    (match, dec: string | undefined, hex: string | undefined, named: string | undefined) => {
      if (dec !== undefined) return safeFromCodePoint(Number.parseInt(dec, 10), match)
      if (hex !== undefined) return safeFromCodePoint(Number.parseInt(hex, 16), match)
      const name = named?.toLowerCase()
      return name !== undefined && Object.hasOwn(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : match
    },
  )
}
