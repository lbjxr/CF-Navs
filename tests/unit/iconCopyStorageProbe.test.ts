import { afterEach, describe, expect, it, vi } from 'vitest'
import { pageReadFixtureCopy } from '../../scripts/lib/iconCopyStorageProbe.mjs'
import { iconBytesRevision } from '../../shared/iconLocalCopy'

afterEach(() => vi.unstubAllGlobals())
function database(body?: Blob, entry?: unknown, enabled = true, readError = false) {
  const tx: any = { objectStore: vi.fn((store: string) => ({ get: vi.fn((key: string) => {
    const request: any = {}
    queueMicrotask(() => {
      if (readError) { request.error = new Error('read failed'); request.onerror() }
      else { request.result = store === 'control' ? { enabled, secret: 'do-not-return' } : store === 'entries' ? entry : body; request.onsuccess() }
    })
    return request
  }) })) }
  const db = { close: vi.fn(), transaction: vi.fn(() => { setTimeout(() => { if (readError) { tx.error=new Error('read failed'); tx.onabort() } else tx.oncomplete() }, 0); return tx }) }
  const open = vi.fn(() => { const request: any = {}; queueMicrotask(() => { request.result = db; request.onsuccess() }); return request })
  vi.stubGlobal('indexedDB', { databases: async () => [{name:'cf-navs-object-icons-v1'}], open })
  return {db, tx, open}
}
describe('native fixture copy storage evidence', () => {
  it.each(['image/svg+xml', 'image/png'])('uses the versioned MIME-aware content revision for %s', async mime => {
    const bytes = new Uint8Array([1,2,3,4])
    const revision = await iconBytesRevision(bytes, mime)
    const descriptor = { content_revision: revision }
    const {db,tx} = database(new Blob([bytes], {type:mime}), {descriptor})
    const result = await pageReadFixtureCopy('bookmark:12')
    expect(result).toEqual({available:true,enabled:true,entryPresent:true,bodyPresent:true,descriptor,bodyBytes:4,bodyRevision:revision})
    expect(db.transaction).toHaveBeenCalledWith(['control','entries','bodies'],'readonly')
    expect(tx.objectStore.mock.calls.map(call => call[0])).toEqual(['control','entries','bodies'])
    expect(db.close).toHaveBeenCalledOnce()
    expect(JSON.stringify(result)).not.toContain('do-not-return')
  })
  it('reports actual cold absence without inventing a body', async () => {
    const {db} = database()
    expect(await pageReadFixtureCopy('category:7')).toMatchObject({available:true,enabled:true,entryPresent:false,bodyPresent:false,bodyBytes:0,bodyRevision:null})
    expect(db.close).toHaveBeenCalledOnce()
  })
  it('does not call a disabled or partial copy a cold enabled store', async () => {
    database(undefined, {descriptor:{state:'ready'}}, false)
    expect(await pageReadFixtureCopy('bookmark:12')).toMatchObject({enabled:false,entryPresent:true,bodyPresent:false})
  })
  it('does not create an absent database to manufacture cold evidence', async () => {
    const open=vi.fn();vi.stubGlobal('indexedDB',{databases:async()=>[],open})
    expect(await pageReadFixtureCopy('bookmark:12')).toEqual({available:false})
    expect(open).not.toHaveBeenCalled()
  })
  it('reports read failure and closes the connection', async () => {
    const {db} = database(undefined,undefined,true,true)
    await expect(pageReadFixtureCopy('bookmark:12')).rejects.toThrow('read failed')
    expect(db.close).toHaveBeenCalledOnce()
  })
  it('rejects an unscoped key before opening storage', async () => {
    const open=vi.fn();vi.stubGlobal('indexedDB',{open})
    await expect(pageReadFixtureCopy('active')).rejects.toThrow('Invalid fixture key')
    expect(open).not.toHaveBeenCalled()
  })
})
