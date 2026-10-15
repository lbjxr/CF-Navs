import { describe, expect, it } from 'vitest'
import { syncBrowserBookmarks } from '../../worker/lib/db/browserSync'

type Statement = {
  sql: string
  params: unknown[]
  bind: (...params: unknown[]) => Statement
  all: <T>() => Promise<{ results: T[] }>
  first: <T>() => Promise<T | null>
}

function createBrowserSyncDb() {
  const inserts: Statement[] = []
  let nextId = 100

  const prepare = (sql: string): Statement => {
    const statement: Statement = {
      sql,
      params: [],
      bind(...params) {
        statement.params = params
        return statement
      },
      async all<T>() {
        if (sql.includes('PRAGMA table_info')) {
          return {
            results: [
              { name: 'icon_source' },
              { name: 'icon_blob' },
              { name: 'icon_background_color' },
              { name: 'description_mode' },
              { name: 'is_private' },
              { name: 'click_count' },
              { name: 'parent_id' },
            ] as T[]
          }
        }
        if (sql.startsWith('SELECT url FROM bookmarks')) return { results: [] as T[] }
        return { results: [] as T[] }
      },
      async first<T>() {
        if (sql.startsWith('SELECT id, parent_id, title')) {
          return {
            id: 7,
            parent_id: null,
            title: '浏览器新增收藏',
            icon: null,
            is_private: 0,
            sort: 0,
            created_at: 1,
          } as T
        }
        if (sql.startsWith('INSERT INTO bookmarks')) {
          inserts.push(statement)
          return { id: nextId++ } as T
        }
        return null
      },
    }
    return statement
  }

  const db = {
    prepare,
    async batch(statements: Statement[]) {
      // 模拟 D1 batch：依次执行，INSERT 语句走 first() 记录 inserts
      for (const statement of statements) {
        if (statement.sql.startsWith('INSERT INTO bookmarks')) {
          await statement.first()
        }
      }
      return statements.map(() => ({ success: true }))
    },
  }

  return { db: db as unknown as D1Database, inserts }
}

describe('browser bookmark sync', () => {
  it('persists the default favicon.im candidate for synced bookmarks', async () => {
    const { db, inserts } = createBrowserSyncDb()

    const result = await syncBrowserBookmarks(db, [
      { title: '  Example  ', url: ' https://www.example.com/path ' },
      { title: 'Duplicate', url: 'https://www.example.com/path' },
      { title: 'Unsafe', url: 'javascript:alert(1)' },
    ])

    expect(result).toMatchObject({ created: 1, skipped: 2 })
    expect(inserts).toHaveLength(1)
    expect(inserts[0].params.slice(0, 5)).toEqual([
      7,
      'Example',
      'https://www.example.com/path',
      'https://favicon.im/example.com?larger=true',
      'favicon_im',
    ])
  })
})
