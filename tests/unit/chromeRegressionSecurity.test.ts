import { webcrypto } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

// 执行 CLI 实际发送到浏览器的函数，不运行 CLI 启动器或连接真实站点。
const source = readFileSync('scripts/chrome-regression.mjs', 'utf8')
const ast = ts.createSourceFile('chrome-regression.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const declaration = ast.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'runSecurityChecks')!
const securityFunction = source.slice(declaration.getStart(ast), declaration.end)

async function runScenario(allowPasswordRotation: boolean, rejectRestoration = false) {
  const originalPassword = 'Isolated-fixture-Only-2026'
  let password = originalPassword
  let passwordWrites = 0
  let sessionId = 0
  const sessions = new Set<string>()
  const storage = new Map<string, string>()
  const sandbox = {
    TARGET_ORIGIN: 'https://example.test',
    ADMIN_USER: 'fixture-admin',
    ADMIN_PASS: originalPassword,
    ALLOW_PASSWORD_ROTATION: allowPasswordRotation,
    crypto: webcrypto,
    localStorage: { setItem: (key: string, value: string) => storage.set(key, value) },
    pageFunction: (fn: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => fn(...args),
    fetch: async (url: string, options: { headers?: Record<string, string>; body?: string } = {}) => {
      const path = new URL(url).pathname
      const payload = options.body ? JSON.parse(options.body) : {}
      const token = options.headers?.authorization?.replace(/^Bearer /, '') ?? ''
      let status = 401
      let body: { code: number; data?: { token: string } } = { code: 1001 }
      if (path === '/api/login' && payload.username === 'fixture-admin' && payload.password === password) {
        const session = `fixture-session-${++sessionId}`
        sessions.add(session)
        status = 200
        body = { code: 0, data: { token: session } }
      } else if (path === '/api/admin/data' && sessions.has(token)) {
        status = 200
        body = { code: 0 }
      } else if (path === '/api/password') {
        passwordWrites++
        if (sessions.has(token) && payload.current_password === password) {
          if (rejectRestoration && payload.new_password === originalPassword) {
            status = 503
            body = { code: 5000 }
          } else {
            password = payload.new_password
            sessions.clear()
            status = 200
            body = { code: 0 }
          }
        }
      }
      return { status, json: async () => body }
    },
  }
  const result = await runInNewContext(`${securityFunction}\nrunSecurityChecks()`, sandbox, { timeout: 5000 })
  return { result, passwordWrites, passwordRestored: password === originalPassword, sessionRestored: storage.has('cf-navs.auth') }
}

describe('Chrome regression security checks', () => {
  it('keeps password rotation opt-in while checking anonymous and invalid sessions', async () => {
    const scenario = await runScenario(false)

    expect(scenario.result.invalidToken).toMatchObject({ ok: true, status: 401 })
    expect(scenario.result.anonymousAccess).toMatchObject({ ok: true, status: 401 })
    expect(scenario.result.passwordChange.skipped).toBe(true)
    expect(scenario.passwordWrites).toBe(0)
    expect(scenario.passwordRestored).toBe(true)
    expect(scenario.sessionRestored).toBe(true)
  })

  it('verifies revoked sessions and restores the original credentials after opting in', async () => {
    const scenario = await runScenario(true)

    expect(scenario.result.passwordChange).toEqual({ ok: true, cleanupOk: true, skipped: false })
    expect(scenario.passwordRestored).toBe(true)
    expect(scenario.sessionRestored).toBe(true)
  })

  it('reports failed emergency restoration instead of claiming cleanup succeeded', async () => {
    const scenario = await runScenario(true, true)

    expect(scenario.result.passwordChange).toEqual({ ok: true, cleanupOk: false, skipped: false })
    expect(scenario.passwordRestored).toBe(false)
    expect(scenario.sessionRestored).toBe(false)
  })
})
