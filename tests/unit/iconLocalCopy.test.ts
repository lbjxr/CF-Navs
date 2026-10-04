import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../helpers/d1Sqlite'
import { iconFixture } from '../helpers/iconFixture'
import { createBookmark, getBookmarkIconData, updateBookmark } from '../../worker/lib/db/bookmarks'
import { iconLocalCopyRoutes } from '../../worker/routes/iconLocalCopy'
import { cacheValidatedSession, clearAllCachedSessions } from '../../worker/middleware/auth'
import { iconSessionScope, parseIconCopyRequest, type IconCopyRequest } from '../../shared/iconLocalCopy'
import { getAdminData, getPublicDataSource } from '../../worker/lib/db/aggregates'
import publicRoutes from '../../worker/routes/public'
import bookmarksRoutes from '../../worker/routes/bookmarks'
import type { Env } from '../../worker/types'

const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const active: ReturnType<typeof createSqliteD1>[] = []
const token = 'synthetic-session-not-a-production-token'
afterEach(() => { for (const item of active.splice(0)) item.close(); clearAllCachedSessions(); vi.unstubAllGlobals() })
async function fixture(icon = iconFixture().dataUri) {
  const instance = createSqliteD1(schema)
  active.push(instance)
  instance.sqlite.exec("INSERT INTO categories(id,title,sort,created_at) VALUES(1,'Test',0,1)")
  const bookmark = (await createBookmark(instance.db, { category_id: 1, title: 'Private fixture', url: 'https://example.com', icon, is_private: true }))!
  const row = (await getBookmarkIconData(instance.db, bookmark.id))!
  cacheValidatedSession(token, { username: 'fixture-admin', exp: Date.now() + 60000 })
  const request: IconCopyRequest = { protocol: 1, object_type: 'bookmark', object_id: bookmark.id, dataset_epoch: row.dataset_epoch, expected_write_epoch: row.icon_write_epoch, expected_content_revision: row.icon_revision }
  const env = { DB: instance.db } as Env
  const call = (body: unknown = request, auth = true, extraHeaders = {}) => iconLocalCopyRoutes.request('https://example.com/icon-local-copy', { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + token } : {}), ...extraHeaders }, body: JSON.stringify(body) }, env)
  return { ...instance, bookmark, request, env, call }
}

describe('authenticated icon materialization', () => {
  it('authenticates before object lookup and never enters shared response caches', async () => {
    const f = await fixture()
    const before = f.statements.length
    vi.stubGlobal('caches', { get default() { throw new Error('shared cache forbidden') } })
    const denied = await f.call(undefined, false)
    expect(denied.status).toBe(401)
    expect(f.statements.length).toBe(before)
    expect(denied.headers.get('Cache-Control')).toBe('private, no-store')
    expect(denied.headers.get('CDN-Cache-Control')).toBe('no-store')
    const response = await f.call()
    const { data } = await response.json() as any
    expect(response.status).toBe(200)
    expect(data.persistence).toBe('session-scoped')
    expect(data.descriptor.state).toBe('ready')
    expect(data.descriptor.content_revision).toMatch(/^sha256-/)
    expect(data.image.byte_length).toBe(iconFixture().bytes.length)
    expect(atob(data.image.base64)).toBe(new TextDecoder().decode(iconFixture().bytes))
    expect(JSON.stringify(data)).not.toContain(token)
    expect(JSON.stringify(data)).not.toContain('Private fixture')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns current metadata, never old bytes under a new revision, on a conflict', async () => {
    const f = await fixture()
    await updateBookmark(f.db, f.bookmark.id, { category_id: 1, title: 'Changed', url: 'https://example.com', icon: iconFixture('blue').dataUri, is_private: true })
    const response = await f.call()
    expect(response.status).toBe(409)
    const { data } = await response.json() as any
    expect(data.reason).toBe('conflict')
    expect(data.image).toBeUndefined()
    expect(data.descriptor.write_epoch).toBeGreaterThan(f.request.expected_write_epoch)
  })

  it('fails closed for wrong scope, malformed/oversized requests and cross-origin calls', async () => {
    const f = await fixture()
    expect((await f.call({ ...f.request, dataset_epoch: 'b'.repeat(32) })).status).toBe(409)
    expect((await f.call({ ...f.request, object_id: -1 })).status).toBe(400)
    expect((await f.call({ ...f.request, padding: 'x'.repeat(5000) })).status).toBe(400)
    expect((await f.call(f.request, true, { origin: 'https://other.example.com' })).status).toBe(403)
    expect((await f.call({ ...f.request, object_id: 999 })).status).toBe(404)
    const categoryResponse = await f.call({ ...f.request, object_type: 'category' })
    expect(categoryResponse.status).toBe(409)
    expect((await categoryResponse.json() as any).data.descriptor.object_type).toBe('category')
  })

  it.each([429, 503])('does not certify HTTP %i as an image', async (status) => {
    const f = await fixture('https://example.com/icon.svg')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('failure', { status })))
    expect((await f.call()).status).toBe(503)
    expect((await getBookmarkIconData(f.db, f.bookmark.id))!.icon_blob).toBeNull()
  })

  it('rejects successful fallback responses and HTML disguised as images', async () => {
    const f = await fixture('https://example.com/icon.svg')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml', 'X-Icon-Fallback': '1' } })))
    expect((await f.call()).status).toBe(503)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>login</html>', { headers: { 'content-type': 'image/png' } })))
    expect((await f.call()).status).toBe(503)
    expect((await getBookmarkIconData(f.db, f.bookmark.id))!.icon_revision).toBeNull()
  })

  it('returns the current descriptor rather than an old blob after a competing edit', async () => {
    const f = await fixture('https://example.com/slow.svg')
    let finish!: (response: Response) => void
    let started!: () => void
    const fetching = new Promise<void>(resolve => { started = resolve })
    vi.stubGlobal('fetch', vi.fn(() => { started(); return new Promise<Response>(resolve => { finish = resolve }) }))
    const refresh = bookmarksRoutes.request('https://example.com/' + f.bookmark.id + '/icon-cache/refresh', { method: 'POST' }, f.env)
    await fetching
    await updateBookmark(f.db, f.bookmark.id, { category_id: 1, title: 'New source', url: 'https://example.com', icon: iconFixture('blue').dataUri, is_private: true })
    finish(new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } }))
    const response = await refresh
    const { data } = await response.json() as any
    const current = (await getBookmarkIconData(f.db, f.bookmark.id))!
    expect(data.icon_update).toBe('unavailable')
    expect(data.icon_blob).toBe(current.icon_blob)
    expect(data.icon_descriptor.write_epoch).toBe(current.icon_write_epoch)
    expect(current.icon).toBe(iconFixture('blue').dataUri)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  it('returns explicit empty state separately from transient failure', async () => {
    const f = await fixture('')
    const response = await f.call()
    const { data } = await response.json() as any
    expect(response.status).toBe(200)
    expect(data.descriptor.state).toBe('empty')
    expect(data.image).toBeNull()
  })
})

describe('lease metadata and aggregate consistency', () => {
  it('verifies bearer sessions even on a public site, with an isolated scope', async () => {
    const f = await fixture()
    const response = await publicRoutes.request('https://example.com/data/version', { headers: { authorization: 'Bearer ' + token } }, f.env)
    const { data } = await response.json() as any
    expect(data.auth_receipt.cache_scope).toBe(await iconSessionScope(token))
    expect(data.auth_receipt.checked_at).toBeLessThanOrEqual(Date.now())
    expect(data.auth_receipt.expires_at).toBeGreaterThan(Date.now())
    expect(data.icon_local_copy_protocol).toBe(1)
    const anonymous = await publicRoutes.request('https://example.com/data/version', {}, f.env)
    expect((await anonymous.json() as any).data.auth_receipt).toBeUndefined()
    const invalid = await publicRoutes.request('https://example.com/data/version', { headers: { authorization: 'Bearer invalid-fixture-token' } }, f.env)
    expect(invalid.status).toBe(401)
    expect((await invalid.json() as any).data?.auth_receipt).toBeUndefined()
  })

  it('reads aggregate version and dataset in the same database batch without image payloads', async () => {
    const f = await fixture()
    await f.call()
    const admin = await getAdminData(f.db)
    expect(admin.dataset_epoch).toBe(f.request.dataset_epoch)
    expect(admin.bookmarks[0].icon_blob).toBeNull()
    expect(admin.bookmarks[0].icon_revision).toMatch(/^sha256-/)
    const pub = await getPublicDataSource(f.db)
    expect(pub.bookmarks).toHaveLength(0)
    expect(pub.dataset_epoch).toBe(admin.dataset_epoch)
    expect(pub.version).toBe(admin.version)
  })

  it('does not accept capability guesses or malformed revisions', () => {
    expect(parseIconCopyRequest({ protocol: 99 })).toBeNull()
    expect(parseIconCopyRequest({ protocol: 1, object_type: 'bookmark', object_id: 1, dataset_epoch: 'a'.repeat(32), expected_write_epoch: 0, expected_content_revision: 'url-hash' })).toBeNull()
  })
})
