import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 仓库级一致性：public/icon.png 是唯一事实来源，browser-extension/icon.png
// 是它的自包含副本（见 browser-extension/README.md）。两者必须字节一致，
// 否则就是改了一处忘了一处。改完 public/icon.png 后跑
// `node scripts/sync-extension-icon.mjs` 同步。

describe('repo consistency', () => {
  it('browser-extension/icon.png 与 public/icon.png 字节一致', () => {
    const root = new URL('../../', import.meta.url)
    const a = readFileSync(new URL('public/icon.png', root))
    const b = readFileSync(new URL('browser-extension/icon.png', root))
    expect(a.equals(b)).toBe(true)
  })
})
