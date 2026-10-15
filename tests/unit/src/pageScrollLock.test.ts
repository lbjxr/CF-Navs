// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { setPageScrollLocked } from '../../../src/lib/pageScrollLock'

// pageScrollLock 是模块级单槽单例：每个用例后解锁并清掉行内 overflow，避免状态串扰。
afterEach(() => {
  setPageScrollLocked(false)
  document.documentElement.style.overflow = ''
  document.body.style.overflow = ''
})

describe('pageScrollLock', () => {
  it('锁定时把 <html>/<body> 置 hidden，解锁时还原原始 overflow', () => {
    document.documentElement.style.overflow = 'auto'
    document.body.style.overflow = 'scroll'

    setPageScrollLocked(true)
    expect(document.documentElement.style.overflow).toBe('hidden')
    expect(document.body.style.overflow).toBe('hidden')

    setPageScrollLocked(false)
    expect(document.documentElement.style.overflow).toBe('auto')
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('重复 lock 不覆盖已存原值（单槽幂等）', () => {
    document.body.style.overflow = 'scroll'

    setPageScrollLocked(true) // 存原值 'scroll'，置 hidden
    document.body.style.overflow = 'visible' // 锁定期间外部改动
    setPageScrollLocked(true) // 已锁，二次 lock 必须是 no-op，不能把 'visible' 当原值存下

    setPageScrollLocked(false)
    expect(document.body.style.overflow).toBe('scroll')
  })

  it('未锁时 unlock 无副作用', () => {
    document.body.style.overflow = 'scroll'
    document.documentElement.style.overflow = 'auto'

    setPageScrollLocked(false)

    expect(document.body.style.overflow).toBe('scroll')
    expect(document.documentElement.style.overflow).toBe('auto')
  })
})
