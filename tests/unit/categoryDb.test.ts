import { describe, expect, it } from 'vitest'
import {
  CategoryConflictError,
  CategoryValidationError,
  batchDeleteCategories,
  createCategory,
  deleteCategory,
  sortCategories,
  updateCategory,
} from '../../worker/lib/db/categories'

type StatementHandler = {
  all?: (params: unknown[]) => unknown[]
  first?: (params: unknown[]) => unknown
}

function createDb(handlerForSql: (sql: string) => StatementHandler) {
  const prepared: Array<{ sql: string; params: unknown[] }> = []
  let batchCalls = 0
  let runCalls = 0

  const db = {
    prepare(sql: string) {
      const entry = { sql, params: [] as unknown[] }
      prepared.push(entry)
      const handler = handlerForSql(sql)
      const statement = {
        sql,
        bind(...params: unknown[]) {
          entry.params = params
          return statement
        },
        async all() {
          if (sql === 'PRAGMA table_info(bookmarks)') {
            return { results: [{ name: 'icon_source' }, { name: 'icon_blob' }, { name: 'icon_background_color' }, { name: 'description_mode' }] }
          }
          if (sql === 'PRAGMA table_info(categories)') {
            return { results: [{ name: 'id' }, { name: 'parent_id' }, { name: 'title' }, { name: 'icon' }, { name: 'sort' }, { name: 'created_at' }] }
          }
          return { results: handler.all?.(entry.params) ?? [] }
        },
        async first() {
          return handler.first?.(entry.params) ?? null
        },
        async run() {
          runCalls += 1
          return { meta: { changes: 1 } }
        },
      }
      return statement
    },
    async batch(statements: Array<{ sql?: string }>) {
      if (!statements.every((statement) => statement.sql?.startsWith('CREATE INDEX'))) batchCalls += 1
      return statements.map(() => ({ meta: { changes: 1 }, results: [] }))
    },
  }

  return {
    db: db as unknown as D1Database,
    prepared,
    get batchCalls() { return batchCalls },
    get runCalls() { return runCalls },
  }
}

describe('category database hierarchy rules', () => {
  it('creates root categories with sort scoped to the root sibling set', async () => {
    const fake = createDb((sql) => ({
      first: () => sql.startsWith('INSERT INTO categories')
        ? { id: 5, parent_id: null, title: 'Root', icon: null, sort: 2, created_at: 100 }
        : null,
    }))

    await createCategory(fake.db, { title: 'Root', parent_id: null })
    const insert = fake.prepared.find((entry) => entry.sql.startsWith('INSERT INTO categories'))!
    expect(insert.sql).toContain('WHERE parent_id IS ?')
    expect(insert.params[0]).toBeNull()
    expect(insert.params.at(-1)).toBeNull()
  })

  it('rejects partial sibling sorting before writing any updates', async () => {
    const fake = createDb((sql) => ({
      all: () => sql.startsWith('SELECT id FROM categories') ? [{ id: 1 }, { id: 2 }] : [],
    }))

    await expect(sortCategories(fake.db, { parent_id: null, ids: [2] }))
      .rejects.toBeInstanceOf(CategoryValidationError)
    expect(fake.batchCalls).toBe(0)
  })

  it('sorts only after the complete sibling set has been validated', async () => {
    const fake = createDb((sql) => ({
      all: () => sql.startsWith('SELECT id FROM categories') ? [{ id: 1 }, { id: 2 }] : [],
    }))

    await sortCategories(fake.db, { parent_id: null, ids: [2, 1] })
    expect(fake.runCalls).toBe(1)
    expect(fake.prepared.some((entry) => entry.sql.startsWith('UPDATE categories SET sort'))).toBe(true)
  })

  it('blocks deletion when the category still owns child categories', async () => {
    const fake = createDb((sql) => ({
      all: () => sql.startsWith('SELECT parent_id, COUNT(*)') ? [{ parent_id: 1, count: 2 }] : [],
    }))

    await expect(deleteCategory(fake.db, 1)).rejects.toBeInstanceOf(CategoryConflictError)
    expect(fake.batchCalls).toBe(0)
  })

  it('preserves the existing parent when legacy update payloads omit parent_id', async () => {
    const fake = createDb((sql) => ({
      first: () => {
        if (sql.startsWith('SELECT id, parent_id')) {
          return { id: 3, parent_id: 1, title: 'Child', icon: null, sort: 0, created_at: 100 }
        }
        if (sql.startsWith('UPDATE categories SET title')) {
          return { id: 3, parent_id: 1, title: 'Updated', icon: null, sort: 0, created_at: 100 }
        }
        return null
      },
    }))

    await expect(updateCategory(fake.db, 3, { title: 'Updated', icon: null })).resolves.toMatchObject({
      id: 3,
      parent_id: 1,
    })
    expect(fake.prepared.find((entry) => entry.sql.startsWith('UPDATE categories SET title'))?.params).toEqual(['Updated', null, 3])
  })

  it('rejects using a second-level category as a parent', async () => {
    const fake = createDb((sql) => ({
      first: () => sql.startsWith('SELECT id, parent_id')
        ? { id: 2, parent_id: 1, title: 'Child', icon: null, sort: 0, created_at: 100 }
        : null,
    }))

    await expect(createCategory(fake.db, { title: 'Grandchild', parent_id: 2 }))
      .rejects.toBeInstanceOf(CategoryValidationError)
    expect(fake.prepared.some((entry) => entry.sql.startsWith('INSERT INTO categories'))).toBe(false)
  })

  it('rejects moving a root category that still has children', async () => {
    const fake = createDb((sql) => ({
      first: (params) => {
        if (sql.startsWith('SELECT id, parent_id')) {
          return Number(params[0]) === 3
            ? { id: 3, parent_id: null, title: 'Root', icon: null, sort: 0, created_at: 100 }
            : { id: 1, parent_id: null, title: 'Target', icon: null, sort: 0, created_at: 100 }
        }
        if (sql.startsWith('SELECT id FROM categories WHERE parent_id')) return { id: 4 }
        return null
      },
    }))

    await expect(updateCategory(fake.db, 3, { title: 'Root', parent_id: 1 }))
      .rejects.toBeInstanceOf(CategoryValidationError)
    expect(fake.prepared.some((entry) => entry.sql.startsWith('UPDATE categories'))).toBe(false)
  })

  it('rejects the entire category batch delete when any selected root has children', async () => {
    const fake = createDb((sql) => ({
      all: () => sql.startsWith('SELECT parent_id, COUNT(*)') ? [{ parent_id: 1, count: 1 }] : [],
    }))

    await expect(batchDeleteCategories(fake.db, [1, 2])).rejects.toBeInstanceOf(CategoryConflictError)
    expect(fake.batchCalls).toBe(0)
  })
})
