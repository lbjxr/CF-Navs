// 真实浏览器验证脚本的管理员凭据解析。
//
// 优先级：环境变量 > verify.local.json > 缺失（由调用方给出可操作提示）。
//
// 凭据允许写在仓库根目录的 verify.local.json 里（该文件已在 .gitignore 中）。
// 早期版本要求「凭据只能来自环境变量」，因为文件比进程环境更容易被误提交；
// 维护者 2026-09-05 明确要求改为可从本地文件读取，避免每次验证都重新设置环境变量。
// 相应的防线改成三条，都在本模块或调用方强制：
//   1. 文件本身被 Git 忽略，且 assertCredentialsNotTracked() 会在运行时复核这一点；
//   2. 本模块只返回值，从不打印；调用方打印任何摘要前必须先经过 redactCredentials()；
//   3. 校验失败时的提示只说键名，不回显任何取到的值。

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CONFIG_FILENAME, resolveSetting } from './verifyTarget.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * 读取管理员凭据。缺失时不退出进程——只读场景不需要登录，
 * 由调用方决定「缺凭据」是致命错误还是跳过登录相关场景。
 */
export function resolveAdminCredentials() {
  const username = resolveSetting('ADMIN_USER', 'adminUser')
  const password = resolveSetting('ADMIN_PASS', 'adminPass')
  return { username, password, present: Boolean(username && password) }
}

/**
 * 校验凭据文件确实没有被 Git 跟踪。
 *
 * `.gitignore` 里有一行不等于文件没被跟踪：如果它曾经被 `git add -f` 或在加入
 * ignore 规则之前提交过，后续所有写入都会进版本库。用 `git ls-files` 直接问索引，
 * 这是唯一可靠的判据。
 */
export function assertCredentialsNotTracked() {
  let tracked = ''
  try {
    tracked = execFileSync('git', ['ls-files', '--error-unmatch', CONFIG_FILENAME], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // 未跟踪时 git 以非零码退出，这正是期望结果。
    return
  }

  if (tracked) {
    console.error(`${CONFIG_FILENAME} is tracked by Git.`)
    console.error('Verification credentials must never enter version control.')
    console.error(`Run: git rm --cached ${CONFIG_FILENAME}`)
    console.error('Then rotate the administrator password, because the old one may already be in history.')
    process.exit(2)
  }
}

export function requireAdminCredentials() {
  assertCredentialsNotTracked()
  const credentials = resolveAdminCredentials()
  if (credentials.present) return credentials

  console.error('Missing administrator credentials.')
  console.error('')
  console.error('Provide them either as environment variables:')
  console.error('  ADMIN_USER=<user> ADMIN_PASS=<password>')
  console.error('')
  console.error(`or as keys in the git-ignored ${CONFIG_FILENAME}:`)
  console.error('  { "adminUser": "<user>", "adminPass": "<password>" }')
  process.exit(2)
}

/**
 * 从任意待打印的字符串里抹掉凭据。
 *
 * 报告里会带上接口响应片段和错误信息，密码可能被服务端回显或出现在 URL 里。
 * 打印前一律先过这一层，而不是靠「记得不要打印」。
 */
export function redactCredentials(text, credentials = resolveAdminCredentials()) {
  if (typeof text !== 'string' || !text) return text

  let output = text
  // 密码一律全局替换。
  if (credentials.password && credentials.password.length >= 3) {
    output = output.split(credentials.password).join('<redacted>')
  }
  // 用户名只在足够长时才挡：常见值就是 "admin"，全局替换会把检查 ID 里的 admin
  // 一起改掉（实测出现过 anonymous-<redacted>-data-denied），让报告难读却没换来保密。
  // 用户名本身不是秘密——密码才是。
  if (credentials.username && credentials.username.length >= 8) {
    output = output.split(credentials.username).join('<redacted-user>')
  }
  return output
}
