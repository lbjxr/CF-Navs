import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 断言 `src/components/BookmarkCard.svelte` 用 `contain: layout style;` 建立包含块，`BookmarkLinkModal.svelte` 靠
// `use:mountToBody`+`document.body.appendChild(node)` 把弹窗移出卡片挂到 body，backdrop 用 `position: fixed`/
// `z-index: 120`/`width: min(1120px, 100%)`。要点是 `contain` 会让 `fixed` 相对卡片而非视口——这是布局合成结果，
// jsdom 不做布局、不解析 `contain`/`min()`，挂载既验证不了 fixed 是否逃出包含块，也拿不到层叠与宽度计算。（PROB-18）

describe('bookmark link modal layout', () => {
  it('mounts the viewport modal outside the contained bookmark card', () => {
    const card = readFileSync('src/components/BookmarkCard.svelte', 'utf8')
    const modal = readFileSync('src/components/BookmarkLinkModal.svelte', 'utf8')

    expect(card).toContain('contain: layout style;')
    expect(modal).toContain('document.body.appendChild(node)')
    expect(modal).toContain('<div use:mountToBody class="link-modal-backdrop"')
    expect(modal).toContain('position: fixed;')
    expect(modal).toContain('z-index: 120;')
    expect(modal).toContain('width: min(1120px, 100%);')
  })
})
