import { describe, expect, it } from 'vitest'
import {
  applyAuthUIRegion,
  getAuthResetMask,
  logoutRevocationWarning,
  targetAfterLoginClose,
  targetAfterLoginOpen,
  targetAfterLoginSuccess,
  targetAfterLogout,
  targetAfterPasswordChange,
} from '../../src/lib/appAuthController'

describe('targetAfterLoginOpen', () => {
  it('on public site: opens modal without changing view', () => {
    const result = targetAfterLoginOpen(true, 'home')
    expect(result.loginModalOpen).toBe(true)
    expect(result.currentView).toBeNull()
  })

  it('on private site: opens modal and forces login view', () => {
    const result = targetAfterLoginOpen(false, 'home')
    expect(result.loginModalOpen).toBe(true)
    expect(result.currentView).toBe('login')
  })

  it('preserves currentView when canSeeHome is true', () => {
    const result = targetAfterLoginOpen(true, 'admin')
    expect(result.loginModalOpen).toBe(true)
    expect(result.currentView).toBeNull()
  })
})

describe('targetAfterLoginClose', () => {
  it('on public site: closes modal, no view change', () => {
    const result = targetAfterLoginClose(true)
    expect(result.loginModalOpen).toBe(false)
    expect(result.currentView).toBeNull()
  })

  it('on private site: keeps modal open and forces login', () => {
    const result = targetAfterLoginClose(false)
    expect(result.loginModalOpen).toBe(true)
    expect(result.currentView).toBe('login')
  })
})

describe('targetAfterLoginSuccess', () => {
  it('closes modal and navigates to home', () => {
    const result = targetAfterLoginSuccess()
    expect(result.loginModalOpen).toBe(false)
    expect(result.currentView).toBe('home')
  })
})

describe('targetAfterLogout', () => {
  it('public mode enabled: lands on home without login modal', () => {
    const result = targetAfterLogout(true)
    expect(result.loginModalOpen).toBe(false)
    expect(result.currentView).toBe('home')
  })

  it('public mode disabled: lands on login view with modal open', () => {
    const result = targetAfterLogout(false)
    expect(result.loginModalOpen).toBe(true)
    expect(result.currentView).toBe('login')
  })

  it('public mode unknown (undefined): defaults to home (public assumption), no modal', () => {
   const result = targetAfterLogout(undefined)
    expect(result.loginModalOpen).toBe(false)
    expect(result.currentView).toBe('home')
 })
})

describe('logoutRevocationWarning', () => {
  it('says nothing when the server revoked the token', () => {
    expect(logoutRevocationWarning({ revoked: true })).toBeNull()
  })

  it('says nothing when there was no server round trip', () => {
    // 本地没有会话可退，或请求本身失败：无从判断服务端状态，不要凭空警告。
    expect(logoutRevocationWarning(null)).toBeNull()
  })

  it('warns with the cause and the actionable remedy when the store is down', () => {
    const warning = logoutRevocationWarning({ revoked: false, reason: 'store_unavailable' })
    expect(warning).toContain('会话存储暂时不可用')
    expect(warning).toContain('修改密码')
  })

  it('distinguishes a missing binding from a failed write', () => {
    const unavailable = logoutRevocationWarning({ revoked: false, reason: 'store_unavailable' })
    const unconfigured = logoutRevocationWarning({ revoked: false, reason: 'store_unconfigured' })
    expect(unconfigured).toContain('部署缺少 SESSION 绑定')
    expect(unconfigured).not.toBe(unavailable)
  })

  it('still warns when the reason is one this client does not know', () => {
    // reason 来自网络响应。未知取值不能退化成 "undefined" 文案，也不能静默。
    const warning = logoutRevocationWarning({ revoked: false, reason: 'future_reason' } as never)
    expect(warning).toContain('未能作废')
    expect(warning).not.toContain('undefined')
  })
})

describe('targetAfterPasswordChange', () => {
  it('opens login modal and forces login view', () => {
    const result = targetAfterPasswordChange()
    expect(result.loginModalOpen).toBe(true)
    expect(result.currentView).toBe('login')
  })
})

describe('getAuthResetMask', () => {
  it('returns all true — full reset for auth-changing flows', () => {
    const mask = getAuthResetMask()
    expect(mask.resetCategories).toBe(true)
    expect(mask.resetBookmarks).toBe(true)
    expect(mask.resetSettings).toBe(true)
    expect(mask.resetAdminStore).toBe(true)
    expect(mask.clearAdminCache).toBe(true)
  })
})

describe('applyAuthUIRegion', () => {
  it('returns loginModalOpen and currentView when both set', () => {
    const result = applyAuthUIRegion({ loginModalOpen: false, currentView: 'home' })
    expect(result.loginModalOpen).toBe(false)
    expect(result.currentView).toBe('home')
  })

  it('omits currentView when region has null currentView', () => {
    const result = applyAuthUIRegion({ loginModalOpen: true, currentView: null })
    expect(result.loginModalOpen).toBe(true)
    expect(result).not.toHaveProperty('currentView')
  })
})
