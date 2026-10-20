import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createFileAssets, loadHeaderRules, parseHeaderRules } from '../../server/fileAssets'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

function makeDist(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cf-navs-dist-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'index.html'), '<html>shell</html>')
  writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("fetch",()=>{})')
  mkdirSync(join(dir, 'assets'), { recursive: true })
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)')
  mkdirSync(join(dir, 'guide'), { recursive: true })
  writeFileSync(join(dir, 'guide', 'index.html'), '<html>guide</html>')
  writeFileSync(join(dir, '_headers'), '/sw.js\n  Cache-Control: no-cache, max-age=0, must-revalidate\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n')
  return dir
}

async function makeAssets() {
  const dir = makeDist()
  const rules = await loadHeaderRules(dir)
  return createFileAssets(dir, rules)
}

const req = (path: string, init?: RequestInit) => new Request(`https://navs.example.test${path}`, init)

describe('fileAssets（阶段 4）', () => {
  it('serve 静态文件并给出正确 MIME', async () => {
    const assets = await makeAssets()
    const res = await assets.fetch(req('/assets/app-abc123.js'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('javascript')
    expect(await res.text()).toBe('console.log(1)')
  })

  it('/ 与目录路径返回 index.html', async () => {
    const assets = await makeAssets()
    expect((await assets.fetch(req('/'))).status).toBe(200)
    expect(await (await assets.fetch(req('/'))).text()).toContain('shell')
    expect(await (await assets.fetch(req('/guide/'))).text()).toContain('guide')
  })

  it('缺失文件 404；不支持的方法 404', async () => {
    const assets = await makeAssets()
    expect((await assets.fetch(req('/assets/missing.js'))).status).toBe(404)
    expect((await assets.fetch(req('/nope.txt'))).status).toBe(404)
    expect((await assets.fetch(req('/index.html', { method: 'POST' }))).status).toBe(404)
  })

  it('路径穿越被拒绝', async () => {
    const assets = await makeAssets()
    expect((await assets.fetch(req('/..%2f..%2fetc/passwd'))).status).toBe(404)
    expect((await assets.fetch(req('/assets/../../server/index.ts'))).status).toBe(404)
  })

  it('应用 dist/_headers 规则', async () => {
    const assets = await makeAssets()
    const sw = await assets.fetch(req('/sw.js'))
    expect(sw.headers.get('Cache-Control')).toBe('no-cache, max-age=0, must-revalidate')
    const js = await assets.fetch(req('/assets/app-abc123.js'))
    expect(js.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
  })

  it('HEAD 返回头不返回体', async () => {
    const assets = await makeAssets()
    const res = await assets.fetch(req('/index.html', { method: 'HEAD' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/html')
    expect(await res.text()).toBe('')
  })

  it('ETag 协商：If-None-Match 命中 → 304', async () => {
    const assets = await makeAssets()
    const first = await assets.fetch(req('/sw.js'))
    const etag = first.headers.get('ETag')
    expect(etag).toBeTruthy()
    const second = await assets.fetch(req('/sw.js', { headers: { 'if-none-match': etag! } }))
    expect(second.status).toBe(304)
  })

  it('_headers 文本解析：路径块 + 缩进行', () => {
    const rules = parseHeaderRules('/a\n  X-A: 1\n\n/b/*\n  X-B: 2\n')
    expect(rules).toHaveLength(2)
    expect(rules[0].headers).toEqual([['X-A', '1']])
    expect(rules[1].pattern).toBe('/b/*')
  })
})
