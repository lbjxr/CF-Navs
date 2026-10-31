import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createResponseCache } from '../../server/responseCache'
import { createSqliteKv } from '../../server/sqliteKv'

const closers: Array<() => void> = []
const dirs: string[] = []
afterEach(() => {
  while (closers.length) closers.pop()!()
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
  vi.useRealTimers()
})

function tmpKvPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cf-navs-kv-'))
  dirs.push(dir)
  return join(dir, 'kv.db')
}

describe('sqliteKv（阶段 3）', () => {
  it('put/get/delete 往返；无 TTL 的值不过期', async () => {
    const handle = createSqliteKv(tmpKvPath())
    closers.push(handle.close)
    await handle.kv.put('rl:login:1.2.3.4', '{"count":3}')
    expect(await handle.kv.get('rl:login:1.2.3.4')).toBe('{"count":3}')
    await handle.kv.delete('rl:login:1.2.3.4')
    expect(await handle.kv.get('rl:login:1.2.3.4')).toBeNull()
  })

  it('expirationTtl 到期后读不到，且键被顺手清理', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000_000)
    const handle = createSqliteKv(tmpKvPath())
    closers.push(handle.close)
    await handle.kv.put('revoked:abc', '1', { expirationTtl: 60 })
    expect(await handle.kv.get('revoked:abc')).toBe('1')
    vi.setSystemTime(1_000_000 + 61_000)
    expect(await handle.kv.get('revoked:abc')).toBeNull()
    expect(handle.purgeExpired()).toBe(0) // get 已懒删除，purge 无残留
  })

  it('重启（关开同一文件）后值仍在', async () => {
    const path = tmpKvPath()
    const first = createSqliteKv(path)
    await first.kv.put('revoked:persist', '1', { expirationTtl: 3600 })
    first.close()
    const second = createSqliteKv(path)
    closers.push(second.close)
    expect(await second.kv.get('revoked:persist')).toBe('1')
  })

  it('purgeExpired 批量清过期键', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(5_000_000)
    const handle = createSqliteKv(tmpKvPath())
    closers.push(handle.close)
    await handle.kv.put('a', '1', { expirationTtl: 10 })
    await handle.kv.put('b', '2', { expirationTtl: 10 })
    await handle.kv.put('c', '3')
    vi.setSystemTime(5_000_000 + 11_000)
    expect(handle.purgeExpired()).toBe(2)
    expect(await handle.kv.get('c')).toBe('3')
  })
})

describe('responseCache（阶段 3）', () => {
  const req = (path: string) => new Request(`https://navs.example.test${path}`)
  const res = (body: string, cc?: string) =>
    new Response(body, {
      status: 200,
      headers: cc ? { 'cache-control': cc, 'content-type': 'text/plain' } : { 'content-type': 'text/plain' },
    })

  it('put/match 往返，body 与状态一致', async () => {
    const { cache, stats } = createResponseCache({ maxEntries: 10, maxBytes: 1024 * 1024 })
    await cache.put(req('/api/public/data'), res('hello'))
    const hit = await cache.match(req('/api/public/data'))
    expect(hit?.status).toBe(200)
    expect(await hit?.text()).toBe('hello')
    expect(stats().entries).toBe(1)
    expect(await cache.match(req('/nope'))).toBeUndefined()
  })

  it('no-store / private 响应不入缓存', async () => {
    const { cache, stats } = createResponseCache({ maxEntries: 10, maxBytes: 1024 * 1024 })
    await cache.put(req('/a'), res('x', 'no-store'))
    await cache.put(req('/b'), res('y', 'private, max-age=60'))
    expect(stats().entries).toBe(0)
  })

  it('max-age 到期后不再命中', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(9_000_000)
    const { cache } = createResponseCache({ maxEntries: 10, maxBytes: 1024 * 1024 })
    await cache.put(req('/api/config'), res('cfg', 'max-age=30'))
    expect(await cache.match(req('/api/config'))).toBeDefined()
    vi.setSystemTime(9_000_000 + 31_000)
    expect(await cache.match(req('/api/config'))).toBeUndefined()
  })

  it('条目数上限触发 LRU 淘汰；命中刷新顺序', async () => {
    const { cache, stats } = createResponseCache({ maxEntries: 2, maxBytes: 1024 * 1024 })
    await cache.put(req('/1'), res('one'))
    await cache.put(req('/2'), res('two'))
    await cache.match(req('/1')) // /1 变最新
    await cache.put(req('/3'), res('three')) // 应淘汰 /2
    expect(await cache.match(req('/2'))).toBeUndefined()
    expect(await cache.match(req('/1'))).toBeDefined()
    expect(await cache.match(req('/3'))).toBeDefined()
    expect(stats().entries).toBe(2)
  })

  it('字节上限触发淘汰', async () => {
    const { cache, stats } = createResponseCache({ maxEntries: 100, maxBytes: 10 })
    await cache.put(req('/big1'), res('123456'))
    await cache.put(req('/big2'), res('123456'))
    expect(stats().bytes).toBeLessThanOrEqual(10)
    expect(stats().entries).toBe(1)
  })

  it('delete 移除条目', async () => {
    const { cache } = createResponseCache({ maxEntries: 10, maxBytes: 1024 })
    await cache.put(req('/d'), res('gone'))
    expect(await cache.delete(req('/d'))).toBe(true)
    expect(await cache.match(req('/d'))).toBeUndefined()
  })
})
