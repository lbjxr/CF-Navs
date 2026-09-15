import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// 断言设计令牌的声明与引用文本：`src/app.css` 的 `:root` 是否声明 `--font-size-*`/`--radius-*`/`--transition-*`/
// `--control-padding-*`，各弹窗组件的 `<style>` 是否用 `var(--radius-)`/`var(--font-size-)`/`var(--control-padding-)`
// 而非硬编码，全仓样式是否残留字面时长或 `transition: all`，模态卡片是否统一 `border-radius: var(--radius-xl)`。
// 这是跨文件源码级一致性护栏（要求 offenders 数组为空），断言对象不是单个组件的可观测 DOM 行为；jsdom 不解析
// CSS 变量级联，挂载单组件既无法遍历全仓 `<style>`，也拿不到 token 是否真正被引用的证据。（PROB-18）

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return walk(path)
    return entry.name.endsWith('.svelte') || entry.name.endsWith('.css') ? [path] : []
  })
}

const STYLE_FILES = walk('src')
const APP_CSS = readFileSync('src/app.css', 'utf8')

function styleBlocks(path: string): string {
  const source = readFileSync(path, 'utf8')
  if (path.endsWith('.css')) return source
  return [...source.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n')
}

describe('design tokens', () => {
  it('defines the base scale in :root', () => {
    for (const token of [
      '--font-size-xs',
      '--font-size-sm',
      '--font-size-md',
      '--font-size-base',
      '--font-size-lg',
      '--radius-sm',
      '--radius-md',
      '--radius-lg',
      '--radius-xl',
      '--radius-pill',
      '--transition-fast',
      '--transition-base',
      '--control-padding-sm',
      '--control-padding-md',
      '--control-padding-input',
      '--control-padding-input-sm',
    ]) {
      expect(APP_CSS, token).toContain(`${token}:`)
    }
  })
})

describe('transition consistency', () => {
  it('has no hardcoded durations left', () => {
    // 收敛前是 61 处声明、25 种写法（0.15s / 0.16s / 150ms / 180ms / 0.2s / 0.24s …）
    const offenders: string[] = []

    for (const path of STYLE_FILES) {
      for (const match of styleBlocks(path).matchAll(/transition:\s*([^;]+);/g)) {
        const body = match[1]
        if (body.trim() === 'none') continue
        if (/\d+\s*m?s/.test(body)) offenders.push(`${path}: ${body.trim()}`)
      }
    }

    expect(offenders).toEqual([])
  })

  it('never animates `all`', () => {
    // `all` 会把 width / height / padding 这类布局属性一起卷进动画，
    // 既有性能成本，也容易在无关改动后产生意外动效。
    const offenders = STYLE_FILES.filter((path) => /transition:\s*all\b/.test(styleBlocks(path)))

    expect(offenders).toEqual([])
  })
})

describe('modal control consistency', () => {
  const MODALS = [
    'src/components/BookmarkModalActions.svelte',
    'src/components/CategoryEditModal.svelte',
    'src/components/LoginModal.svelte',
    'src/components/ConfirmDialog.svelte',
    'src/components/PasswordChangePanel.svelte',
    'src/components/BookmarkBaseFields.svelte',
  ]

  it('routes button and input sizing through the tokens', () => {
    // 收敛前：同名的 .primary-button / .ghost-button 在 5 个组件里各写一遍，
    // 圆角 10/12px、内边距 7px12px / 8px14px / 10px16px、字号 13/14px 三套不一致；
    // 输入框圆角更是 9/10/12/14px 四种。
    for (const path of MODALS) {
      const style = styleBlocks(path)

      expect(style, path).toContain('var(--radius-')
      expect(style, path).toContain('var(--font-size-')
      expect(style, path).toContain('var(--control-padding-')
    }
  })

  it('uses one modal card radius', () => {
    for (const path of [
      'src/components/CategoryEditModal.svelte',
      'src/components/LoginModal.svelte',
      'src/components/ConfirmDialog.svelte',
      'src/components/BookmarkEditModal.svelte',
    ]) {
      expect(styleBlocks(path), path).toContain('border-radius: var(--radius-xl)')
    }
  })

  it('keeps the iOS zoom guard able to win', () => {
    // app.css 的 @media (pointer: coarse) 必须能把触摸设备字号抬到 16px，
    // 所以控件字号声明不能自己带 !important。
    for (const path of MODALS) {
      const style = styleBlocks(path)
      expect(style.match(/font-size:[^;]*!important/), path).toBeNull()
    }

    expect(APP_CSS).toContain('@media (pointer: coarse)')
    expect(APP_CSS).toContain('font-size: 16px !important')
  })
})
