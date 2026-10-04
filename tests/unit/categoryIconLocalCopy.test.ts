import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSqliteD1 } from '../helpers/d1Sqlite'
import { iconFixture } from '../helpers/iconFixture'
import { iconLocalCopyRoutes } from '../../worker/routes/iconLocalCopy'
import { cacheValidatedSession, clearAllCachedSessions } from '../../worker/middleware/auth'
import { getCategoryIconData, updateCategory } from '../../worker/lib/db/categories'
import { getAdminData, getPublicDataSource } from '../../worker/lib/db/aggregates'
import { iconSessionScope } from '../../shared/iconLocalCopy'
import type { Env } from '../../worker/types'

const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const active: ReturnType<typeof createSqliteD1>[] = []
const token = 'synthetic-category-icon-session'
afterEach(() => { for (const db of active.splice(0)) db.close(); clearAllCachedSessions(); vi.unstubAllGlobals() })

async function fixture(icon: string = iconFixture().dataUri) {
  const instance = createSqliteD1(schema)
  active.push(instance)
  instance.sqlite.prepare('INSERT INTO categories(id,title,icon,sort,created_at) VALUES(1,?,?,0,1)').run('Synthetic', icon)
  const row = (await getCategoryIconData(instance.db, 1))!
  cacheValidatedSession(token, { username: 'synthetic-admin', exp: Date.now() + 60000 })
  const body = { protocol: 1, object_type: 'category', object_id: 1, dataset_epoch: row.dataset_epoch,
    expected_write_epoch: row.icon_write_epoch, expected_content_revision: row.icon_revision }
  const env = { DB: instance.db } as Env
  const call = (payload = body, authenticated = true) => iconLocalCopyRoutes.request('https://example.test/icon-local-copy', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(payload),
  }, env)
  return { ...instance, body, call, env }
}

describe('category icon materialization', () => {
  it('persists only a validated image under the category object key and returns private no-store headers', async () => {
    const f = await fixture()
    vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => undefined } })
    const denied = await f.call(f.body, false)
    expect(denied.status).toBe(401)
    const response = await f.call()
    const { data } = await response.json() as any
    expect(response.status).toBe(200)
    expect(data.descriptor).toMatchObject({ object_type: 'category', object_id: 1, state: 'ready' })
    expect(data.image.byte_length).toBe(iconFixture().bytes.length)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store')
    expect(response.headers.get('Cloudflare-CDN-Cache-Control')).toBe('no-store')
    const category = (await getCategoryIconData(f.db, 1))!
    expect(category.icon_blob).toMatch(/^data:image\//)
    expect(category.icon_revision).toBe(data.descriptor.content_revision)
    expect(category.icon_write_epoch).toBeGreaterThan(0)
    expect(iconSessionScope(token)).resolves.toMatch(/^[a-f0-9]{64}$/)
  })

  it('fences stale generations and clears cached bytes when the source changes', async () => {
    const f = await fixture()
    const response = await f.call()
    expect(response.status).toBe(200)
    await updateCategory(f.db, 1, { title: 'Changed', icon: 'https://example.test/new.svg' })
    const current = (await getCategoryIconData(f.db, 1))!
    expect(current.icon_blob).toBeNull()
    expect(current.icon_revision).toBeNull()
    expect(current.icon_write_epoch).toBeGreaterThan(0)
    expect((await f.call()).status).toBe(409)
    const wrongDataset = await f.call({ ...f.body, dataset_epoch: 'b'.repeat(32) })
    expect(wrongDataset.status).toBe(409)
  })

  it('keeps icon bodies out of both public and admin aggregate payloads', async () => {
    const f = await fixture()
    await f.call()
    const admin = await getAdminData(f.db)
    const publicData = await getPublicDataSource(f.db)
    expect(admin.categories[0].icon_blob).toBeNull()
    expect(admin.categories[0].icon_cached).toBe(1)
    expect(admin.categories[0].icon_revision).toMatch(/^sha256-/)
    expect(publicData.categories[0].icon_blob).toBeNull()
    expect(publicData.categories[0].icon).toBeNull()
    expect(publicData.categories[0].icon_display).toBe('image')
    expect(publicData.categories[0].icon_revision).toMatch(/^sha256-/)
    expect(JSON.stringify(publicData)).not.toContain(iconFixture().dataUri)
    expect(admin.categories[0].icon).toBe(iconFixture().dataUri)
  })
})
