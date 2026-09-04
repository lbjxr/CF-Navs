import type { LogoutResp, LogoutRevocationFailure } from '../../shared/types'
import { createHomeGateState, type AppView } from './appNavigation'

export interface AuthUIRegion {
  loginModalOpen: boolean
  currentView: AppView | null
}

/**
 * Target UI state after clicking "open login" button.
 * Always opens the modal; changes view to 'login' only when the home is not visible.
 */
// currentView 保留在签名里是为了让调用点读起来完整，但结果只取决于 canSeeHome。
export function targetAfterLoginOpen(canSeeHome: boolean, _currentView: AppView): AuthUIRegion {
  return {
    loginModalOpen: true,
    currentView: canSeeHome ? null : 'login',
  }
}

/**
 * Target UI state after closing the login modal.
 * On a private site the modal must stay open and force 'login' view.
 * On a public site the modal closes without changing the current view.
 */
export function targetAfterLoginClose(canSeeHome: boolean): AuthUIRegion {
  if (!canSeeHome) {
    return { loginModalOpen: true, currentView: 'login' }
  }
  return { loginModalOpen: false, currentView: null }
}

/**
 * Target UI state after a successful login.
 */
export function targetAfterLoginSuccess(): AuthUIRegion {
  return { loginModalOpen: false, currentView: 'home' }
}

/**
 * Target UI state after logout completes.
 * Delegates home-gate resolution (public vs private) to appNavigation.
 */
export function targetAfterLogout(publicMode: boolean | undefined): AuthUIRegion {
  const homeGate = createHomeGateState({
    publicMode,
    authenticated: false,
  })
  return { loginModalOpen: homeGate.loginModalOpen, currentView: homeGate.view }
}

const LOGOUT_REVOCATION_CAUSE: Record<LogoutRevocationFailure, string> = {
  store_unavailable: '会话存储暂时不可用',
  store_unconfigured: '部署缺少 SESSION 绑定',
}

/**
 * Warning to surface when logout cleared the local session but the server could
 * not revoke the token. Returns null when nothing needs saying.
 *
 * 会话是无状态 JWT：撤销名单没写进去，旧 token 就一直有效到 exp（部署默认 30 天）。
 * 本地登录态照常清除，所以这不是失败，但共享设备上必须让用户知道。
 */
export function logoutRevocationWarning(result: LogoutResp | null): string | null {
  if (!result || result.revoked) return null

  // reason 来自网络响应，可能是本客户端还不认识的取值，因此不硬取索引。
  const cause: string | undefined = LOGOUT_REVOCATION_CAUSE[result.reason]
  return `已退出登录，但服务端未能作废旧的登录令牌${cause ? `（${cause}）` : ''}。这台设备上的登录态已清除；如果担心令牌被别人复用，请修改密码——改密码会立即作废全部会话。`
}

/**
 * Target UI state after a password change.
 */
export function targetAfterPasswordChange(): AuthUIRegion {
  return { loginModalOpen: true, currentView: 'login' }
}

/**
 * Which modal/state regions should be reset when auth changes
 * (logout / password change).
 */
export interface AuthResetMask {
  resetCategories: boolean
  resetBookmarks: boolean
  resetSettings: boolean
  resetAdminStore: boolean
  clearAdminCache: boolean
}

export function getAuthResetMask(): AuthResetMask {
  return {
    resetCategories: true,
    resetBookmarks: true,
    resetSettings: true,
    resetAdminStore: true,
    clearAdminCache: true,
  }
}

/**
 * Applies an AuthUIRegion to mutable primitives.
 * Returns a partial with non-null fields so the caller can assign only what changed.
 */
export function applyAuthUIRegion(
  region: AuthUIRegion,
): { loginModalOpen: boolean; currentView?: AppView } {
  const result: { loginModalOpen: boolean; currentView?: AppView } = {
    loginModalOpen: region.loginModalOpen,
  }
  if (region.currentView !== null) {
    result.currentView = region.currentView
  }
  return result
}
