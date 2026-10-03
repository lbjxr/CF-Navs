import { DatabaseSync } from 'node:sqlite'

/** Executes real SQLite SQL/transactions; Worker-specific behavior is also covered by L1. */
export function createSqliteD1(schema: string) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(schema)
  const statements: string[] = []
  function prepare(sql: string, bindings: unknown[] = []) {
    statements.push(sql)
    const execute = () => sqlite.prepare(sql)
    return {
      sql,
      bindings,
      bind: (...values: unknown[]) => prepare(sql, values),
      async all() {
        return { results: execute().all(...bindings as never[]), success: true, meta: {} }
      },
      async first() {
        return execute().get(...bindings as never[]) ?? null
      },
      async run() {
        const result = execute().run(...bindings as never[])
        return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }
      },
    }
  }
  const db = {
    prepare,
    async batch(items: ReturnType<typeof prepare>[]) {
      sqlite.exec('BEGIN IMMEDIATE')
      try {
        const results = []
        for (const item of items) {
          const stmt = sqlite.prepare(item.sql)
          if (/^\s*(SELECT|PRAGMA|WITH)\b|\bRETURNING\b/i.test(item.sql)) {
            results.push({ success: true, results: stmt.all(...item.bindings as never[]), meta: {} })
          } else {
            const result = stmt.run(...item.bindings as never[])
            results.push({ success: true, results: [], meta: { changes: Number(result.changes) } })
          }
        }
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return { db: db as unknown as D1Database, sqlite, statements, close: () => sqlite.close() }
}
