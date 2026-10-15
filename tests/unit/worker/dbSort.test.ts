import { describe, expect, it } from 'vitest'
import { buildColumnUpdateChunks, buildSortUpdateChunks, runUpdateChunks, SORT_UPDATE_CHUNK_SIZE } from '../../../worker/lib/db/sort'

describe('worker db sort helpers', () => {
  it('builds a single sort update chunk with ordered case params', () => {
    const [chunk] = buildSortUpdateChunks('categories', [12, 10, 15])

    expect(chunk.sql).toBe(
      'UPDATE categories SET sort = CASE id WHEN ? THEN ? WHEN ? THEN ? WHEN ? THEN ? ELSE sort END WHERE id IN (?, ?, ?)',
    )
    expect(chunk.params).toEqual([
      12, 0,
      10, 1,
      15, 2,
      12, 10, 15,
    ])
  })

  it('builds safe category_id update chunks with bound values', () => {
    const [chunk] = buildColumnUpdateChunks('bookmarks', 'category_id', [[10, 2], [11, 3]])

    expect(chunk.sql).toBe(
      'UPDATE bookmarks SET category_id = CASE id WHEN ? THEN ? WHEN ? THEN ? ELSE category_id END WHERE id IN (?, ?)',
    )
    expect(chunk.params).toEqual([10, 2, 11, 3, 10, 11])
  })

  it('submits all generated update chunks in one atomic batch', async () => {
    let batchCalls = 0
    let batchSize = 0
    const db = {
      prepare() {
        return {
          bind() {
            return this
          },
          async run() {
            return { success: true }
          },
        }
      },
      async batch(statements: unknown[]) {
        batchCalls += 1
        batchSize = statements.length
        return []
      },
    }
    const chunks = Array.from({ length: 51 }, () => ({ sql: 'UPDATE bookmarks SET sort = 0', params: [] }))

    await runUpdateChunks(db as unknown as D1Database, chunks)

    expect(batchCalls).toBe(1)
    expect(batchSize).toBe(51)
  })

  it('keeps global sort indexes across multiple chunks', () => {
    const ids = Array.from({ length: SORT_UPDATE_CHUNK_SIZE + 2 }, (_, index) => index + 1)
    const chunks = buildSortUpdateChunks('bookmarks', ids)

    expect(chunks).toHaveLength(2)
    expect(chunks[0].params.slice(0, 4)).toEqual([1, 0, 2, 1])
    expect(chunks[0].params.slice(-2)).toEqual([29, 30])
    expect(chunks[1].params).toEqual([
      31, 30,
      32, 31,
      31, 32,
    ])
  })

  it('returns no chunks for empty sort ids', () => {
    expect(buildSortUpdateChunks('categories', [])).toEqual([])
  })
})
