import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BookmarkEditData } from '../../shared/types'
import { createSqliteD1 } from '../helpers/d1Sqlite'
import { createBookmark, getBookmarkForEdit, setIconBlob, getBookmarkIconData, updateBookmark } from '../../worker/lib/db/bookmarks'
import app from '../../worker/index'
import { cacheValidatedSession, clearAllCachedSessions } from '../../worker/middleware/auth'
import type { Env } from '../../worker/types'
import { api, setApiBaseUrl } from '../../src/lib/api'

vi.mock('../../schema.sql', () => ({ default: '' }))

const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const instances: ReturnType<typeof createSqliteD1>[] = []
afterEach(() => {
  for (const instance of instances.splice(0)) instance.close()
  clearAllCachedSessions()
  vi.unstubAllGlobals()
  setApiBaseUrl('/api')
})

async function seeded() {
  const instance = createSqliteD1(schema)
  instances.push(instance)
  instance.sqlite.exec("INSERT INTO categories(id,title,sort,created_at) VALUES(1,'Fixture',0,1)")
  const icon = 'data:image/svg+xml;base64,PHN2Zy8+'
  const row = await createBookmark(instance.db, { category_id: 1, title: 'Original', url: 'https://example.com/', icon, icon_source: 'custom', description_mode: 'hover', is_private: true, open_method: 3 })
  await setIconBlob(instance.db, row!.id, icon, (await getBookmarkIconData(instance.db, row!.id))!)
  return { ...instance, id: row!.id, icon }
}

describe('authoritative single-bookmark editing', () => {
  it('reads original fields by primary key and leaves caches, other rows and versions out', async () => {
    const instance = await seeded()
    const before = instance.sqlite.prepare("SELECT value FROM settings WHERE key='data_version'").get()?.value
    const original = await getBookmarkForEdit(instance.db, instance.id)
    expect(original).toMatchObject({ id: instance.id, title: 'Original', icon: instance.icon, icon_source: 'custom', is_private: 1, open_method: 3, description_mode: 'hover' })
    expect(Object.keys(original!).sort()).toEqual(['id', 'category_id', 'title', 'url', 'icon', 'icon_source', 'icon_background_color', 'description', 'description_mode', 'open_method', 'is_private'].sort())
    expect(instance.statements.at(-1)).toContain('WHERE id = ?')
    expect(instance.statements.at(-1)).not.toContain('icon_blob')
    expect(await getBookmarkForEdit(instance.db, instance.id + 1)).toBeNull()
    expect(instance.sqlite.prepare("SELECT value FROM settings WHERE key='data_version'").get()?.value).toBe(before)
    await updateBookmark(instance.db, instance.id, { ...original!, title: 'Updated', is_private: true })
    const after = await getBookmarkIconData(instance.db, instance.id)
    expect(after).toMatchObject({ icon: instance.icon, icon_blob: instance.icon, icon_source: 'custom', is_private: 1 })
  })

  it('serves the protected endpoint with no-store and timing without mutation', async () => {
    const instance = await seeded()
    const env = { DB: instance.db } as Env
    cacheValidatedSession('test-session', { username: 'fixture', exp: Date.now() + 60_000 })
    const response = await app.request(`https://navs.example.test/api/bookmarks/${instance.id}`, { headers: { authorization: 'Bearer test-session' } }, env)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    const timing = response.headers.get('Server-Timing')
    expect(timing).toMatch(/auth;dur=\d+\.\d+/)
    expect(timing).toMatch(/db;dur=\d+\.\d+/)
    expect(timing).toMatch(/serialize;dur=\d+\.\d+/)
    expect(timing).not.toContain('test-session')
    expect(await response.json()).toMatchObject({ code: 0, data: { id: instance.id, icon: instance.icon } })
    const missing = await app.request('https://navs.example.test/api/bookmarks/9999', { headers: { authorization: 'Bearer test-session' } }, env)
    expect(await missing.json()).toMatchObject({ code: 1003, data: null })
    const invalid = await app.request('https://navs.example.test/api/bookmarks/invalid', { headers: { authorization: 'Bearer test-session' } }, env)
    expect(await invalid.json()).toMatchObject({ code: 1002 })
    const denied = await app.request(`https://navs.example.test/api/bookmarks/${instance.id}`, {}, env)
    expect(denied.status).toBe(401)
  })

  it('passes cancellation and no-store through the actual request wrapper', async () => {
    const original: BookmarkEditData = { id: 1, category_id: 1, title: 'Fixture', url: 'https://example.com', icon: '⭐', icon_source: 'custom', icon_background_color: null, description: null, open_method: 1, is_private: false }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 0, msg: 'ok', data: original })))
    vi.stubGlobal('fetch', fetchMock)
    const signal = new AbortController().signal
    expect(await api.bookmarks.getForEdit(1, signal)).toEqual(original)
    expect(fetchMock.mock.calls[0]).toMatchObject(['/api/bookmarks/1', { cache: 'no-store', signal }])
  })
})
