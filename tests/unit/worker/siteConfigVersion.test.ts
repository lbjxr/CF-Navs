import { describe, expect, it } from 'vitest'
import { getDataVersion, getSiteConfig, getSiteConfigWithDataVersion } from '../../../worker/lib/db/settings'
import publicRoutes from '../../../worker/routes/public'
import type { Env } from '../../../worker/types'

type Row = { key: string; value: string | null }

// 记录每次 prepare 的假 D1：`/api/data/version` 是每次页面加载都会走的热路径，
// 查询条数是需要锁住的契约，不只是实现细节。
function createDb(rows: Row[]) {
  const statements: string[] = []

  const db = {
    statements,
    prepare(sql: string) {
      statements.push(sql)
      return {
        bind(...params: unknown[]) {
          return {
            async first<T>() {
              const key = params[0]
              const row = rows.find((item) => item.key === key)
              return (row ? { value: row.value } : null) as T | null
            },
          }
        },
        async all<T>() {
          const keys = [...sql.matchAll(/'([a-z_]+)'/g)].map((match) => match[1])
          return { results: rows.filter((row) => keys.includes(row.key)) as T[] }
        },
      }
    },
  }

  return db as unknown as D1Database & { statements: string[] }
}

function row(key: string, value: unknown): Row {
  return { key, value: JSON.stringify(value) }
}

describe('site config and data version reading', () => {
  it('reads both in a single query', () => {
    const db = createDb([row('site_title', 'My Nav'), row('public_mode', false), row('data_version', 'v7')])

    return getSiteConfigWithDataVersion(db).then((result) => {
      expect(db.statements).toHaveLength(1)
      expect(result).toEqual({
        config: { site_title: 'My Nav', public_mode: false },
        version: 'v7',
      })
    })
  })

  it('matches the separate readers field by field', async () => {
    // 覆盖各种缺失、非法和非 JSON 的历史值，确认合并后的回退行为逐字段一致
    const cases: Row[][] = [
      [],
      [row('site_title', 'Nav')],
      [row('public_mode', true)],
      [row('data_version', 'v1')],
      [row('data_version', 12345)],
      [row('data_version', '')],
      [row('data_version', null)],
      [{ key: 'data_version', value: 'not-json' }],
      [{ key: 'site_title', value: 'not-json' }],
      [{ key: 'site_title', value: null }],
      [row('site_title', 42), row('public_mode', 'yes')],
      [row('site_title', 'Nav'), row('public_mode', false), row('data_version', 'v9')],
    ]

    for (const rows of cases) {
      const label = JSON.stringify(rows)
      const merged = await getSiteConfigWithDataVersion(createDb(rows))

      expect(merged.config, label).toEqual(await getSiteConfig(createDb(rows)))
      expect(merged.version, label).toEqual(await getDataVersion(createDb(rows)))
    }
  })

  it('falls back to defaults when settings are empty', async () => {
    const result = await getSiteConfigWithDataVersion(createDb([]))

    expect(result.version).toBe('0')
    expect(typeof result.config.site_title).toBe('string')
    expect(typeof result.config.public_mode).toBe('boolean')
  })
})

describe('GET /api/data/version', () => {
  async function callRoute(rows: Row[]) {
    const db = createDb(rows)
    const response = await publicRoutes.request(
      'https://example.com/data/version',
      {},
      { DB: db } as unknown as Env,
    )

    return { db, body: await response.json() as { code: number; data: unknown } }
  }

  it('hits D1 exactly once per request', async () => {
    // 这是每次页面加载都会走的热路径。多一条查询就多一次串行 D1 往返，
    // 所以查询条数是契约，不是实现细节。
    const { db, body } = await callRoute([
      row('site_title', 'My Nav'),
      row('public_mode', true),
      row('data_version', 'v7'),
    ])

    expect(db.statements).toHaveLength(1)
    // 确认这一条确实是合并查询，而不是某个分支意外短路掉了版本读取
    expect(db.statements[0]).toContain('data_version')
    expect(body).toEqual({
      code: 0,
      msg: 'ok',
      data: { version: 'v7', site_title: 'My Nav', public_mode: true },
    })
  })

  it('still gates on public_mode with the merged read', async () => {
    const { db, body } = await callRoute([row('site_title', 'Private'), row('public_mode', false)])

    expect(db.statements).toHaveLength(1)
    expect(body).toMatchObject({
      code: 1005,
      data: { site_title: 'Private', public_mode: false },
    })
  })
})
