import { describe, expect, it } from 'vitest'
import type { AdminBookmarkSummary } from '../../src/lib/appData'
import { buildBookmarkBatchMoveRequest } from '../../src/lib/batchMove'

const bookmark = (id: number, category_id: number, sort?: number): AdminBookmarkSummary => ({
  id,
  category_id,
  title: `Bookmark ${id}`,
  url: `https://example.com/${id}`,
  sort,
})

describe('batch move payload builder', () => {
  it('preserves cross-page selection order and snapshot values', () => {
    expect(buildBookmarkBatchMoveRequest([
      bookmark(11, 1, 10),
      bookmark(21, 2, 20),
    ], 3, 'end')).toEqual({
      ids: [11, 21],
      category_id: 3,
      position: 'end',
      expected: [
        { id: 11, category_id: 1, sort: 10 },
        { id: 21, category_id: 2, sort: 20 },
      ],
    })
  })

  it('rejects an invalid target or missing sort snapshot', () => {
    expect(buildBookmarkBatchMoveRequest([bookmark(1, 1)], 0, 'start')).toBeNull()
    expect(buildBookmarkBatchMoveRequest([bookmark(1, 1)], 2, 'start')).toBeNull()
  })
})
