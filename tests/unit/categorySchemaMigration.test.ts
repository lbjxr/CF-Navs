import { describe, expect, it } from 'vitest'
import { ensureSchema } from '../../worker/lib/db/schema'

function createSchemaDb(categoryColumns: string[]) {
  const batchedSql: string[] = []
  const db = {
    prepare(sql: string) {
      return {
        sql,
        async all() {
          if (sql === 'PRAGMA table_info(bookmarks)') {
            return { results: [{ name: 'icon_source' }, { name: 'icon_blob' }, { name: 'icon_background_color' }, { name: 'description_mode' }] }
          }
          if (sql === 'PRAGMA table_info(categories)') {
            return { results: categoryColumns.map((name) => ({ name })) }
          }
          return { results: [] }
        },
      }
    },
    async batch(statements: Array<{ sql?: string }>) {
      for (const statement of statements) {
        if (statement.sql) batchedSql.push(statement.sql)
      }
      return []
    },
  }

  return { db: db as unknown as D1Database, batchedSql }
}

describe('category schema migration', () => {
  it('adds parent_id only when the column is missing and always creates the scoped index', async () => {
    const missing = createSchemaDb(['id', 'title', 'icon', 'sort', 'created_at'])
    await ensureSchema(missing.db, true)
    expect(missing.batchedSql).toContain('ALTER TABLE categories ADD COLUMN parent_id INTEGER')
    expect(missing.batchedSql).toContain('CREATE INDEX IF NOT EXISTS idx_categories_parent_sort_id ON categories(parent_id, sort, id)')

    const existing = createSchemaDb(['id', 'parent_id', 'title', 'icon', 'sort', 'created_at'])
    await ensureSchema(existing.db, true)
    expect(existing.batchedSql).not.toContain('ALTER TABLE categories ADD COLUMN parent_id INTEGER')
  })
})
