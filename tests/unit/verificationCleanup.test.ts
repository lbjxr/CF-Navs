import { describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { shouldBypassRequestCache } from '../../worker/lib/requestCache'
import { assertFixtureOwnership, createVerificationCleanup } from '../../scripts/lib/verificationCleanup.mjs'

const run = '1234abcd'
const fixtures = { categories: [10, 11], bookmarks: [20] }
function setup(options: Record<string, any> = {}) {
  const data = { categories: [{ id: 10, title: 'Browser regression ' + run, parent_id: null }, { id: 11, title: 'Browser child ' + run, parent_id: 10 }], bookmarks: [{ id: 20, title: 'Browser ' + run + ' 0', category_id: 10 }] }
  const live = new Set(['owned-A', 'owned-B', 'user-unrelated'])
  const calls: any[] = []
  let failDelete = false
  let revokedProbes = 0
  const fetchImpl = vi.fn(async (url: URL, init: RequestInit) => {
    const route = url.pathname.slice(4), token = String((init.headers as any)?.authorization ?? '').replace('Bearer ', '')
    calls.push({ route, method: init.method, token, signal: init.signal, redirect: init.redirect, bypass: shouldBypassRequestCache((init.headers as any)['cache-control'], (init.headers as any).pragma) })
    const respond = (status: number, data: any, code = 0) => new Response(JSON.stringify({ code, data }), { status })
    if (options.readFails && route === '/admin/data') throw Error('private network details')
    if (route === '/login') { live.add('recovery'); return respond(200, { token: 'recovery' }) }
    if (route === '/me') {
      if (!live.has(token) && options.delayedRevoke && revokedProbes++ < 2) return respond(200, { username: 'synthetic' })
      return live.has(token) ? respond(200, { username: 'synthetic' }) : respond(401, null, 1001)
    }
    if (!live.has(token)) return respond(401, null, 1001)
    if (route === '/admin/data') return respond(200, data)
    if (route === '/logout') {
      if (!options.revocationFails) live.delete(token)
      if (options.lostLogout) throw Error('lost response')
      return respond(200, { revoked: !options.revocationFails })
    }
    const [kind, id] = route.slice(1).split('/') as ['categories' | 'bookmarks', string]
    if (init.method === 'DELETE') {
      if (options.deleteNeverSucceeds) return respond(503, null, 500)
      if (options.deleteFailsOnce && !failDelete) { failDelete = true; throw Error('timeout') }
      data[kind] = data[kind].filter(row => row.id !== Number(id)) as any
      if (options.lostDelete) throw Error('lost response after write')
      return respond(200, null)
    }
    throw Error('Unexpected request')
  })
  let time = 0
  const owner = createVerificationCleanup({ baseUrl: 'https://example.test', run, credentials: { username: 'synthetic', password: 'not-real' }, fetchImpl,
    revocationWaitMs: 3000, sleep: async () => { time += 1000 }, now: () => time })
  return { data, live, calls, owner, fetchImpl }
}

describe('test-owned host cleanup', () => {
  it('deletes children first, verifies absence and invalidates every owned session without a page', async () => {
    const f = setup(); expect(f.owner.rememberSession('owned-A')).toBe(f.owner.rememberSession('owned-A')); f.owner.rememberSession('owned-B')
    const result = await f.owner.cleanup(fixtures)
    expect(result).toMatchObject({ serverFixturesRemoved: true, sessionRevoked: true, errors: [] })
    expect(result.sessions).toHaveLength(2)
    expect(f.calls.filter(c => c.method === 'DELETE').map(c => c.route)).toEqual(['/bookmarks/20', '/categories/11', '/categories/10'])
    expect(f.live).toEqual(new Set(['user-unrelated']))
    expect(f.calls.every(c => c.signal instanceof AbortSignal && c.redirect === 'error' && c.bypass)).toBe(true)
    expect(JSON.stringify(result)).not.toContain('owned-A')
  })
  it('already removed records are accepted only after an authoritative read', async () => {
    const f = setup(); f.data.bookmarks = []; f.owner.rememberSession('owned-A')
    const result = await f.owner.cleanup(fixtures)
    expect(result.serverFixturesRemoved).toBe(true)
    expect(f.calls.filter(c => c.method === 'DELETE')).toHaveLength(2)
  })
  it('lost delete acknowledgements do not cause blind repeats', async () => {
    const f = setup({ lostDelete: true }); f.owner.rememberSession('owned-A')
    const result = await f.owner.cleanup(fixtures)
    expect(result.serverFixturesRemoved).toBe(true); expect(result.deletions.every(e => e.attempts === 1 && e.absent)).toBe(true)
  })
  it('a still-present record gets at most one retry', async () => {
    const f = setup({ deleteFailsOnce: true }); f.owner.rememberSession('owned-A')
    expect((await f.owner.cleanup(fixtures)).deletions[0].attempts).toBe(2)
  })
  it('permanent delete failure stays failed but does not prevent revocation', async () => {
    const f = setup({ deleteNeverSucceeds: true }); f.owner.rememberSession('owned-A')
    const result = await f.owner.cleanup(fixtures)
    expect(result.serverFixturesRemoved).toBe(false); expect(result.sessionRevoked).toBe(true)
    expect(f.calls.filter(c => c.method === 'DELETE')).toHaveLength(2)
  })
  it('read failure does not delete blind or leak transport details, but still revokes', async () => {
    const f = setup({ readFails: true }); f.owner.rememberSession('owned-A')
    const result = await f.owner.cleanup(fixtures)
    expect(result.sessionRevoked).toBe(true); expect(result.serverFixturesRemoved).toBe(false)
    expect(f.calls.some(c => c.method === 'DELETE')).toBe(false)
    expect(JSON.stringify(result)).not.toContain('private network details')
  })
  it('records already-invalid sessions and creates/revokes recovery login only if necessary', async () => {
    const f = setup(); f.owner.rememberSession('expired')
    const result = await f.owner.cleanup(fixtures)
    expect(result).toMatchObject({ serverFixturesRemoved: true, sessionRevoked: true, errors: [] })
    expect(result.sessions[0]).toMatchObject({ alreadyInvalid: true, rejected: true })
    expect(f.calls.filter(c => c.route === '/login')).toHaveLength(1)
    expect(f.live.has('recovery')).toBe(false)
  })
  it('does not report no captured sessions as successful revocation', async () => {
    const f = setup(); const result = await f.owner.cleanup({ categories: [], bookmarks: [] })
    expect(result.sessionRevoked).toBe(false); expect(f.calls).toHaveLength(0)
  })
  it('waits for actual rejection, not just logout HTTP 200', async () => {
    const f = setup({ revocationFails: true }); f.owner.rememberSession('owned-A')
    const result = await f.owner.cleanup(fixtures)
    expect(result.sessionRevoked).toBe(false); expect(result.sessions[0].error).toContain('remains valid')
  })
  it('accepts a lost logout response only when the same token is actually rejected', async () => {
    const f = setup({ lostLogout: true }); f.owner.rememberSession('owned-A')
    expect((await f.owner.cleanup(fixtures)).sessions[0]).toMatchObject({ logoutTransportFailure: true, rejected: true })
  })
  it('handles bounded propagation delay', async () => {
    const f = setup({ delayedRevoke: true }); f.owner.rememberSession('owned-A')
    expect((await f.owner.cleanup(fixtures)).sessionRevoked).toBe(true)
  })
  it('redacts all owned tokens including older sessions', () => {
    const f = setup(); f.owner.rememberSession('owned-A'); f.owner.rememberSession('owned-B')
    expect(f.owner.redact('owned-A owned-B')).toBe('[test-session] [test-session]')
  })
  it.each(['https://user:pass@example.test', 'https://example.test/nested', 'https://example.test/?x=1', 'file:///a'])('rejects unsafe target %s', baseUrl => {
    expect(() => createVerificationCleanup({ baseUrl, run, credentials: {} })).toThrow()
  })
  it.each(['', 'has whitespace', null])('rejects invalid session identity %s', token => {
    expect(() => setup().owner.rememberSession(token)).toThrow()
  })
  it.each(['renamed', 'moved-bookmark', 'moved-category', 'unowned-bookmark', 'unowned-child'])('never deletes an unsafe tree: %s', async kind => {
    const f = setup(); f.owner.rememberSession('owned-A')
    if (kind === 'renamed') f.data.categories[0].title = 'User data'
    if (kind === 'moved-bookmark') f.data.bookmarks[0].category_id = 99
    if (kind === 'moved-category') f.data.categories[1].parent_id = 99
    if (kind === 'unowned-bookmark') f.data.bookmarks.push({ id: 99, title: 'User data', category_id: 10 })
    if (kind === 'unowned-child') f.data.categories.push({ id: 99, title: 'User data', parent_id: 11 })
    const result = await f.owner.cleanup(fixtures)
    expect(result.serverFixturesRemoved).toBe(false); expect(result.sessionRevoked).toBe(true)
    expect(f.calls.some(c => c.method === 'DELETE')).toBe(false)
  })
  it('rejects malformed manifests before deletion', () => {
    expect(() => assertFixtureOwnership({}, fixtures, run)).toThrow()
    expect(() => assertFixtureOwnership(setup().data, { ...fixtures, categories: [-1] }, run)).toThrow()
    expect(() => assertFixtureOwnership(setup().data, fixtures, 'wrong')).toThrow()
  })
  it('times out real stalled response bodies and still attempts other sessions', async () => {
    const sockets = new Set<any>()
    const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write('{') })
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const port = (server.address() as any).port
      const owner = createVerificationCleanup({ baseUrl: 'http://127.0.0.1:' + port, run, credentials: {}, requestTimeoutMs: 50 })
      owner.rememberSession('owned-A'); owner.rememberSession('owned-B')
      const result = await owner.cleanup({ categories: [], bookmarks: [] })
      expect(result.sessionRevoked).toBe(false); expect(result.sessions).toHaveLength(2)
      expect(result.sessions.every(e => e.error?.includes('transport failed'))).toBe(true)
    } finally { sockets.forEach(socket => socket.destroy()); await new Promise<void>(resolve => server.close(() => resolve())) }
  })
})
