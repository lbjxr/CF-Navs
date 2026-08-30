import { describe, expect, it } from 'vitest'
import type { BookmarkBatchMoveReq } from '../../shared/types'
import { batchMoveBookmarks, BookmarkReorganizeError } from '../../worker/lib/db/bookmarks'

type Row = { id: number; category_id: number; sort: number }

type Statement = {
  sql: string
  params: unknown[]
  bind: (...params: unknown[]) => Statement
  first: <T>() => Promise<T | null>
  all: <T>() => Promise<{ results: T[] }>
}

function createDb(categoryIds: number[], rows: Row[]) {
  const writeBatches: Statement[][] = []
  const prepare = (sql: string): Statement => {
    const statement = {
      sql,
      params: [] as unknown[],
      bind(...params: unknown[]) {
        statement.params = params
        return statement
      },
      async first<T>() {
        if (sql.startsWith('SELECT id FROM categories')) {
          return categoryIds.includes(Number(statement.params[0])) ? ({ id: Number(statement.params[0]) } as T) : null
        }
        return null
      },
      async all<T>() {
        return { results: rows as T[] }
      },
    }
    return statement
  }

  const db = {
    prepare,
    async batch(statements: Statement[]) {
      writeBatches.push(statements)
      return statements.map(() => ({ success: true, meta: { changes: 1 } }))
    },
  }

  return { db: db as unknown as D1Database, writeBatches }
}

const request = (overrides: Partial<BookmarkBatchMoveReq> = {}): BookmarkBatchMoveReq => ({
  ids: [1],
  category_id: 2,
  position: 'end',
  expected: [{ id: 1, category_id: 1, sort: 0 }],
  ...overrides,
})

const rows: Row[] = [
  { id: 1, category_id: 1, sort: 0 },
  { id: 2, category_id: 2, sort: 1 },
  { id: 3, category_id: 2, sort: 2 },
]

describe('batchMoveBookmarks', () => {
  it('appends selected bookmarks after the target category', async () => {
    const { db, writeBatches } = createDb([1, 2], rows)

    await expect(batchMoveBookmarks(db, request())).resolves.toBe(1)

    expect(writeBatches).toHaveLength(1)
    expect(writeBatches[0]).toHaveLength(2)
    expect(writeBatches[0][0].sql).toContain('SET category_id = CASE id')
    expect(writeBatches[0][0].params).toEqual([1, 2, 1])
    expect(writeBatches[0][1].params).toEqual([2, 0, 3, 1, 1, 2, 2, 3, 1])
  })

  it('inserts selected bookmarks before the target category', async () => {
    const { db, writeBatches } = createDb([1, 2], rows)

    await batchMoveBookmarks(db, request({ position: 'start' }))

    expect(writeBatches[0][1].params).toEqual([1, 0, 2, 1, 3, 2, 1, 2, 3])
  })

  it('rejects stale selections and missing target categories as conflicts', async () => {
    const stale = createDb([1, 2], rows)
    await expect(batchMoveBookmarks(stale.db, request({ expected: [{ id: 1, category_id: 1, sort: 99 }] })))
      .rejects.toBeInstanceOf(BookmarkReorganizeError)
    expect(stale.writeBatches).toHaveLength(0)

    const missing = createDb([1], rows)
    await expect(batchMoveBookmarks(missing.db, request())).rejects.toThrow('category 2 not found')
    expect(missing.writeBatches).toHaveLength(0)
  })
})
