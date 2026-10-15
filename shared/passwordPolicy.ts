// 管理员密码统一策略：/install 与 /recover 共用同一套长度边界（12–256）。
// 历史上 /recover 用 8–12，恢复后用户仍可改密码，但三处口径（install 12–256、
// recover 8–12、改密码 8–256）割裂容易误导；统一为 12–256，recover 额外保留
// 的复杂度要求（见 isValidRecoverPassword）不受影响。
export const ADMIN_PASSWORD_MIN_LENGTH = 12
export const ADMIN_PASSWORD_MAX_LENGTH = 256

export function isValidAdminPasswordLength(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= ADMIN_PASSWORD_MIN_LENGTH &&
    value.length <= ADMIN_PASSWORD_MAX_LENGTH
  )
}
