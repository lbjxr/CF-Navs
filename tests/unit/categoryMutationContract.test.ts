import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteD1 } from '../helpers/d1Sqlite'
import { iconFixture } from '../helpers/iconFixture'
import { createCategory, getCategoryIconData, setCategoryIconBlob, updateCategory } from '../../worker/lib/db/categories'
import { upsertPublicCategory } from '../../src/lib/appLocalData'

const schema = readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8')
const active: ReturnType<typeof createSqliteD1>[] = []
afterEach(() => { for (const db of active.splice(0)) db.close() })
function database() { const db = createSqliteD1(schema); active.push(db); return db }

describe('category mutation response through the local view projection', () => {
  it('keeps the real persisted version and privacy when a newly created category enters the view', async () => {
    const { db } = database()
    const saved = await createCategory(db, { title: 'Synthetic', icon: iconFixture().dataUri, is_private: true })
    const stored = (await getCategoryIconData(db, saved.id))!
    expect(saved.icon_revision).toBe(stored.icon_revision)
    expect(saved.icon_revision).toMatch(/^sha256-/)
    expect(saved.icon_write_epoch).toBe(stored.icon_write_epoch)
    expect(saved.icon_cached).toBe(0)
    const projected = upsertPublicCategory([], saved)[0]
    expect(projected).toMatchObject({ icon_revision: stored.icon_revision, icon_write_epoch: 0, icon_cached: 0, is_private: 1 })
    expect(projected).not.toHaveProperty('created_at')
    expect(saved).not.toHaveProperty('icon_blob')
  })

  it('replaces the previous version atomically instead of reverting an edited icon to unknown epoch zero', async () => {
    const { db } = database()
    const first = await createCategory(db, { title: 'Synthetic', icon: iconFixture().dataUri })
    const icon = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/></svg>').toString('base64')
    const changed = (await updateCategory(db, first.id, { title: first.title, icon, is_private: true }))!
    const stored = (await getCategoryIconData(db, first.id))!
    expect(changed.icon_revision).toBe(stored.icon_revision)
    expect(changed.icon_revision).not.toBe(first.icon_revision)
    expect(changed.icon_write_epoch).toBe(1)
    const projected = upsertPublicCategory(upsertPublicCategory([], first), changed)[0]
    expect(projected).toMatchObject({ icon_revision: stored.icon_revision, icon_write_epoch: 1, is_private: 1 })
  })

  it('preserves metadata across legacy rename, privacy and parent branches and clears it with the source', async () => {
    const { db } = database()
    const root = await createCategory(db, { title: 'Parent' })
    const first = await createCategory(db, { title: 'Child', parent_id: root.id, icon: iconFixture().dataUri })
    for (const patch of [{ title: 'Renamed', icon: first.icon }, { title: 'Private', icon: first.icon, is_private: true }, { title: 'Moved', icon: first.icon, parent_id: null }]) {
      const saved = (await updateCategory(db, first.id, patch))!
      expect(saved.icon_revision).toMatch(/^sha256-/)
      expect(saved.icon_write_epoch).toBe(0)
      expect(saved.icon_revision).toBe((await getCategoryIconData(db, first.id))!.icon_revision)
    }
    const cleared = (await updateCategory(db, first.id, { title: 'Empty', icon: null }))!
    expect(cleared).toMatchObject({ icon_revision: null, icon_write_epoch: 1, icon_cached: 0 })
    expect(upsertPublicCategory(upsertPublicCategory([], first), cleared)[0]).toMatchObject({ icon: null, icon_revision: null, icon_write_epoch: 1 })
  })

  it('reports an existing cached body without duplicating it in the mutation response', async () => {
    const { db } = database(), icon = iconFixture().dataUri
    const first = await createCategory(db, { title: 'Cached', icon })
    expect(await setCategoryIconBlob(db, first.id, icon, (await getCategoryIconData(db, first.id))!)).toBe(true)
    const saved = (await updateCategory(db, first.id, { title: 'Renamed', icon }))!
    expect(saved).toMatchObject({ icon_cached: 1, icon_write_epoch: 1 })
    expect(saved).not.toHaveProperty('icon_blob')
    expect(upsertPublicCategory([], saved)[0]).toMatchObject({ icon_cached: 1, icon_write_epoch: 1, icon_revision: saved.icon_revision })
  })
})
