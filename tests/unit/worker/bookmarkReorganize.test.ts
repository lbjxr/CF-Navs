import { describe, expect, it } from 'vitest'
import { BookmarkReorganizeError, incrementBookmarkClick, reorganizeBookmarks } from '../../../worker/lib/db/bookmarks'

type RecordedStatement = {
  sql: string
  params: unknown[]
  bind: (...params: unknown[]) => RecordedStatement
  run: () => Promise<{ success: true }>
}

function createFakeDb(categoryIds: number[], bookmarkIds: number[]) {
  const updateBatches: RecordedStatement[][] = []
  const selectStatements = new Set(['SELECT id FROM categories', 'SELECT id FROM bookmarks'])

  const prepare = (sql: string): RecordedStatement => {
    const statement = {
      sql,
      params: [] as unknown[],
      bind(...params: unknown[]) {
        statement.params = params
        return statement
      },
      async run() {
        return { success: true as const }
      },
    }
    return statement
  }

  const db = {
    prepare,
    async batch(statements: RecordedStatement[]) {
      if (statements.every((statement) => selectStatements.has(statement.sql))) {
        return [
          { results: categoryIds.map((id) => ({ id })) },
          { results: bookmarkIds.map((id) => ({ id })) },
        ]
      }
      updateBatches.push(statements)
      return statements.map(() => ({ results: [], success: true }))
    },
  }

  return { db: db as unknown as D1Database, updateBatches }
}

describe('reorganizeBookmarks', () => {
  it('updates categories and global order in bounded CASE batches', async () => {
    const { db, updateBatches } = createFakeDb([1, 2], [10, 11, 12])

    await reorganizeBookmarks(db, [
      { category_id: 1, ids: [11, 10] },
      { category_id: 2, ids: [12] },
    ])

    expect(updateBatches).toHaveLength(1)
    expect(updateBatches[0]).toHaveLength(2)
    expect(updateBatches[0][0].sql).toContain('SET category_id = CASE id')
    expect(updateBatches[0][0].params).toEqual([11, 1, 10, 1, 12, 2, 11, 10, 12])
    expect(updateBatches[0][1].sql).toContain('SET sort = CASE id')
    expect(updateBatches[0][1].params).toEqual([11, 0, 10, 1, 12, 2, 11, 10, 12])
  })

  it('reports stale bookmark collections as a conflict', async () => {
    const { db } = createFakeDb([1], [10, 11])

    await expect(reorganizeBookmarks(db, [{ category_id: 1, ids: [10] }]))
      .rejects.toBeInstanceOf(BookmarkReorganizeError)
  })
  it('restricts anonymous click updates to public bookmarks', async () => {
    let sql = ''
    const db = {
      prepare(query: string) {
        sql = query
        return {
          bind() {
            return this
          },
          async run() {
            return { meta: { changes: 1 } }
          },
        }
      },
    }

    await expect(incrementBookmarkClick(db as unknown as D1Database, 10)).resolves.toBe(true)
    expect(sql).toContain('WHERE id = ? AND is_private = 0')
  })

})
