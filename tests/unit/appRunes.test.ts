import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 代码审查三轮第 19 项（APP_SPLIT_PLAN 第 8b 步）：App.svelte 改为 runes 模式的源码护栏。
// 行为等价由 tests/unit/appComponent.test.ts（第 18 项，迁移前写成、迁移时未改）保证。
describe('App.svelte runes mode', () => {
  const app = readFileSync('src/App.svelte', 'utf8')
  const script = app.slice(app.indexOf('<script'), app.indexOf('</script>'))
  const markup = app.slice(app.indexOf('</script>'))

  it('opts into runes and drops the legacy syntax', () => {
    expect(app.startsWith('<svelte:options runes />')).toBe(true)
    expect(script).not.toMatch(/^\s*\$:/m)
    expect(markup).not.toContain('<svelte:component')
    expect(markup).not.toMatch(/\son:[a-z]+=/)
    expect(markup).toContain('<svelte:window onkeydown={handleGlobalKeyDown} />')
  })

  it('keeps controller-pushed objects unproxied with $state.raw', () => {
    for (const name of ['installState', 'confirmDialog', 'viewBookmark', 'customScriptController', 'activeCategory', 'activeBookmark', 'importExportState']) {
      expect(script, name).toMatch(new RegExp(`let ${name}(: [^=]+)? = \\$state\\.raw\\(`))
    }
  })

  it('runs side effects before DOM updates, like the legacy reactive statements', () => {
    expect(script).not.toMatch(/\$effect\(/)
    // PROB-41 新增第七项：登录会话替换/失效时作废旧设置保存，行为由 appComponent 覆盖。
    expect(script.match(/\$effect\.pre\(/g)).toHaveLength(7)
  })
})
