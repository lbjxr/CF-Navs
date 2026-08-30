import { describe, expect, it } from 'vitest'
import type { BookmarkUpsertReq } from '../../shared/types'
import { parseBookmarkUpsertPayload } from '../../worker/lib/bookmarkPayload'

const validBody: BookmarkUpsertReq = {
  category_id: 1,
  title: '  GitHub  ',
  url: '  https://github.com  ',
  icon: 'mdi:github',
  icon_source: 'iconify',
  icon_background_color: '  #fff  ',
  description: 'Code hosting',
  open_method: 1,
}

function expectRejected(body: unknown, message = 'invalid bookmark payload') {
  const result = parseBookmarkUpsertPayload(body as BookmarkUpsertReq)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.message).toBe(message)
}

describe('bookmark upsert payload parsing', () => {
  it('trims and normalizes a valid payload', () => {
    const result = parseBookmarkUpsertPayload(validBody)

    expect(result).toEqual({
      ok: true,
      value: {
        category_id: 1,
        title: 'GitHub',
        url: 'https://github.com',
        icon: 'mdi:github',
        icon_source: 'iconify',
        icon_background_color: '#fff',
        description: 'Code hosting',
        internal_url: null,
        open_method: 1,
      },
    })
  })

  it('fills nullable fields when they are omitted', () => {
    const result = parseBookmarkUpsertPayload({ category_id: 2, title: 'A', url: 'https://a.com' })

    expect(result).toEqual({
      ok: true,
      value: {
        category_id: 2,
        title: 'A',
        url: 'https://a.com',
        icon: null,
        icon_source: null,
        icon_background_color: null,
        description: null,
        internal_url: null,
        open_method: undefined,
      },
    })
  })

  it('distinguishes an omitted description_mode from an explicit null', () => {
    // 缺省 = 保留原有覆盖值；显式 null = 恢复跟随全局设置。两者不能被压成同一个值。
    const omitted = parseBookmarkUpsertPayload({ category_id: 1, title: 'A', url: 'https://a.com' })
    const explicit = parseBookmarkUpsertPayload({
      category_id: 1,
      title: 'A',
      url: 'https://a.com',
      description_mode: null,
    })

    expect(omitted.ok && 'description_mode' in omitted.value).toBe(false)
    expect(explicit.ok && explicit.value.description_mode).toBeNull()
  })

  it('rejects every invalid field shape', () => {
    expectRejected(null)
    expectRejected({ ...validBody, category_id: 0 })
    expectRejected({ ...validBody, category_id: 1.5 })
    expectRejected({ ...validBody, category_id: '1' })
    expectRejected({ ...validBody, title: '   ' })
    expectRejected({ ...validBody, title: 123 })
    expectRejected({ ...validBody, url: '' })
    expectRejected({ ...validBody, icon: 5 })
    expectRejected({ ...validBody, icon_background_color: {} })
    expectRejected({ ...validBody, description: [] })
    expectRejected({ ...validBody, description_mode: 'sometimes' })
    expectRejected({ ...validBody, icon_source: 'unknown_source' })
    expectRejected({ ...validBody, open_method: 4 })
    expectRejected({ ...validBody, open_method: 0 })
  })

  it('accepts every allowed enum value', () => {
    for (const mode of ['always', 'hover', 'hidden'] as const) {
      expect(parseBookmarkUpsertPayload({ ...validBody, description_mode: mode }).ok).toBe(true)
    }
    for (const source of ['direct', 'favicon_im', 'logo_surf', 'google', 'iconify', 'custom'] as const) {
      expect(parseBookmarkUpsertPayload({ ...validBody, icon_source: source }).ok).toBe(true)
    }
    for (const method of [1, 2, 3] as const) {
      expect(parseBookmarkUpsertPayload({ ...validBody, open_method: method }).ok).toBe(true)
    }
  })

  it('rejects non-http bookmark urls with a distinct message', () => {
    expectRejected(
      { ...validBody, url: 'javascript:alert(1)' },
      'bookmark url must start with http:// or https://',
    )
    expectRejected(
      { ...validBody, url: 'example.com' },
      'bookmark url must start with http:// or https://',
    )
  })
})

describe('bookmark route wiring', () => {
  it('uses one shared parser for create and update', async () => {
    // 这两条路径之前是逐字符复制的两份校验条件，单边修改会让新增和编辑悄悄分叉。
    const { readFileSync } = await import('node:fs')
    const source = readFileSync('worker/routes/bookmarks.ts', 'utf8')
    const calls = source.match(/parseBookmarkUpsertPayload\(/g) ?? []

    expect(calls).toHaveLength(2)
    expect(source).not.toContain("!['always', 'hover', 'hidden'].includes")
    expect(source).not.toContain('function isNonEmptyString')
  })
})

