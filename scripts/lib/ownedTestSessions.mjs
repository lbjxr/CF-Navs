// Only register sessions issued to this verification run. Cleanup survives page/browser loss.
const REQUEST_TIMEOUT_MS = 5000
const REVOCATION_WAIT_MS = 15000
const POLL_INTERVAL_MS = 250

/** @param {{ baseUrl: string, fetchImpl?: typeof fetch }} options */
export function createOwnedTestSessions({ baseUrl, fetchImpl = fetch }) {
  let origin
  try {
    origin = new URL(baseUrl)
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) throw new Error()
  } catch { throw new Error('Owned session cleanup requires an HTTP(S) origin') }
  const sessions = new Set()

  function register(token) {
    if (typeof token !== 'string' || !token || /\s/.test(token)) throw new Error('Invalid owned test session')
    sessions.add(token)
    return sessions.size
  }

  async function request(route, method, token, timeoutMs) {
    const controller = new AbortController()
    let timer
    try {
      return await Promise.race([
        (async () => {
          const response = await fetchImpl(new URL('/api/' + route, origin), {
            method, redirect: 'error', cache: 'no-store', signal: controller.signal,
            headers: { accept: 'application/json', authorization: 'Bearer ' + token },
          })
          const envelope = await response.json()
          return { status: response.status, code: envelope?.code }
        })(),
        new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('Owned request deadline')) }, timeoutMs)
        }),
      ])
    } catch { return null } // Never copy transport errors, URLs or response data into evidence.
    finally { clearTimeout(timer) }
  }

  async function revoke(token) {
    const startedAt = Date.now()
    const deadline = startedAt + REVOCATION_WAIT_MS
    // A lost logout acknowledgement is resolved by the authenticated read below.
    await request('logout', 'POST', token, REQUEST_TIMEOUT_MS)
    let sawValidSession = false
    while (Date.now() < deadline) {
      const response = await request('settings', 'GET', token, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()))
      if (response?.status === 401 && response.code === 1001 && Date.now() <= deadline) {
        return { revoked: true, elapsedMs: Date.now() - startedAt }
      }
      sawValidSession ||= response?.status === 200 && response.code === 0
      const remaining = deadline - Date.now()
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(POLL_INTERVAL_MS, remaining)))
    }
    return { revoked: false, elapsedMs: Date.now() - startedAt,
      safeReason: sawValidSession ? 'session-still-valid-after-deadline' : 'revocation-could-not-be-confirmed' }
  }

  async function cleanup() {
    const startedAt = Date.now()
    const owned = [...sessions]
    const failures = []
    let revoked = 0
    for (const token of owned) {
      const result = await revoke(token)
      if (result.revoked) {
        revoked++
        sessions.delete(token)
      } else failures.push({ safeReason: result.safeReason, elapsedMs: result.elapsedMs })
    }
    return { ok: failures.length === 0, total: owned.length, revoked, failed: failures.length,
      elapsedMs: Date.now() - startedAt, failures }
  }

  return { register, cleanup, clear: cleanup }
}
