// Test-run-owned server cleanup. No page/CDP dependency and no credentials in reports.
// The caller supplies only its isolated run's issued sessions and created record IDs.
export function assertFixtureOwnership(data, fixtures, run) {
  if (!/^[a-f0-9]{8}$/.test(run)) throw new Error('Invalid cleanup run identity')
  for (const kind of ['categories', 'bookmarks']) {
    if (!Array.isArray(data?.[kind]) || !Array.isArray(fixtures?.[kind]) || fixtures[kind].some(id => !Number.isSafeInteger(id) || id < 1) || new Set(fixtures[kind]).size !== fixtures[kind].length) throw new Error('Invalid cleanup manifest')
    for (const id of fixtures[kind]) {
      const row = data[kind].find(item => item.id === id)
      if (!row) continue // Absence is confirmed from authoritative data, not a DELETE status.
      const titles = kind === 'categories' ? ['Browser regression ' + run, 'Browser child ' + run]
        : Array.from({ length: Math.max(3, fixtures.bookmarks.length) }, (_, i) => i).flatMap(i => ['Browser ' + run + ' ' + i, 'Edited ' + run + ' ' + i]).concat('Browser edited ' + run)
      if (!titles.includes(row.title)) throw new Error('Cleanup ownership mismatch: ' + kind + ':' + id)
      if (kind === 'bookmarks' && !fixtures.categories.includes(row.category_id)) throw new Error('Cleanup bookmark left owned categories')
      if (kind === 'categories' && row.parent_id && !fixtures.categories.includes(row.parent_id)) throw new Error('Cleanup category left owned tree')
    }
  }
  // Category deletion can cascade. Refuse if another run/user added a descendant.
  if (data.bookmarks.some(row => fixtures.categories.includes(row.category_id) && !fixtures.bookmarks.includes(row.id)) ||
      data.categories.some(row => fixtures.categories.includes(row.parent_id) && !fixtures.categories.includes(row.id))) throw new Error('Cleanup tree contains unowned records')
}

export function createVerificationCleanup({ baseUrl, run, credentials, fetchImpl = fetch,
  requestTimeoutMs = 15000, revocationWaitMs = 65000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now }) {
  const origin = new URL(baseUrl)
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Cleanup requires an explicit origin')
  if (!/^[a-f0-9]{8}$/.test(run)) throw new Error('Invalid cleanup run identity')
  const sessions = new Map()
  function rememberSession(token) {
    if (typeof token !== 'string' || !token || /\s/.test(token)) throw new Error('Invalid owned session')
    if (!sessions.has(token)) sessions.set(token, sessions.size + 1)
    return sessions.get(token)
  }
  function redact(text) {
    for (const token of sessions.keys()) text = text.split(token).join('[test-session]')
    return text
  }
  async function request(route, method, token, body) {
    const allowed = route === '/admin/data' || route === '/me' || route === '/login' || route === '/logout' || route === '/bookmarks/batch-delete' && method === 'POST' || new RegExp('^/(bookmarks|categories)/[1-9][0-9]*$').test(route)
    if (!allowed) throw new Error('Cleanup route not allowed')
    try {
      const response = await fetchImpl(new URL('/api' + route, origin), { method, redirect: 'error', signal: AbortSignal.timeout(requestTimeoutMs),
        headers: { 'content-type': 'application/json', 'cache-control': 'no-cache', pragma: 'no-cache', ...(token ? { authorization: 'Bearer ' + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
      const envelope = await response.json() // The timeout includes body consumption.
      return { status: response.status, code: envelope?.code, data: envelope?.data }
    } catch { throw new Error('Cleanup transport failed: ' + method + ' ' + route) }
  }
  const ok = response => response.status === 200 && response.code === 0
  async function cleanup(fixtures) {
    const result = { transport: 'host-fetch', serverFixturesRemoved: false, sessionRevoked: false, sessions: [], deletions: [], errors: [] }
    let active = ''
    let recoveryStarted = false
    async function recoverSession() {
      if (recoveryStarted) throw new Error('Cleanup recovery session rejected')
      recoveryStarted = true
      const response = await request('/login', 'POST', '', credentials)
      if (!ok(response) || !response.data?.token) throw new Error('Cleanup login failed')
      active = response.data.token
      rememberSession(active)
    }
    try {
      for (const token of [...sessions.keys()].reverse()) {
        const response = await request('/me', 'GET', token)
        if (ok(response)) { active = token; break }
        if (response.status !== 401) throw new Error('Cleanup session probe failed')
      }
      if (!active && (fixtures.categories.length || fixtures.bookmarks.length)) {
        await recoverSession()
      }
      if (fixtures.categories.length || fixtures.bookmarks.length) {
        const read = async () => {
          let response = await request('/admin/data', 'GET', active)
          // A just-revoked test session can pass /me on one isolate and fail
          // here on another. Reauthenticate once, before any ownership decision.
          if (response.status === 401) {
            await recoverSession()
            response = await request('/admin/data', 'GET', active)
            result.reauthenticatedAfterReadRejection = true
          }
          if (!ok(response)) throw new Error(`Cleanup authoritative read failed: status=${response.status} code=${response.code}`)
          assertFixtureOwnership(response.data, fixtures, run)
          return response.data
        }
        let data = await read()
        const bulkIds = fixtures.bookmarks.filter(id => data.bookmarks.some(row => row.id === id)).reverse()
        if (bulkIds.length > 3) {
          for (let offset = 0; offset < bulkIds.length; offset += 500) {
            const ids = bulkIds.slice(offset, offset + 500).filter(id => data.bookmarks.some(row => row.id === id))
            if (!ids.length) continue
            const batch = { ids, attempts: 1, absent: false }
            ;(result.batches ??= []).push(batch)
            try { batch.lastStatus = (await request('/bookmarks/batch-delete', 'POST', active, { ids })).status }
            catch { batch.transportFailure = true }
            data = await read() // Lost acknowledgement is resolved by absence, never a blind retry.
            for (const id of ids) result.deletions.push({ kind: 'bookmarks', id, attempts: 1, batch: true, absent: !data.bookmarks.some(row => row.id === id), lastStatus: batch.lastStatus })
            batch.absent = ids.every(id => !data.bookmarks.some(row => row.id === id))
            if (!batch.absent) throw new Error('Bulk cleanup left registered bookmarks')
          }
        }
        for (const kind of ['bookmarks', 'categories']) {
          for (const id of [...fixtures[kind]].reverse()) {
            if (kind === 'categories') data = await read() // Recheck cascade ownership just before deletion.
            if (!data[kind].some(row => row.id === id)) continue
            const evidence = { kind, id, attempts: 0, absent: false }
            result.deletions.push(evidence)
            for (let attempt = 0; attempt < 2; attempt++) {
              evidence.attempts++
              try { const response = await request('/' + kind + '/' + id, 'DELETE', active); evidence.lastStatus = response.status }
              catch { evidence.transportFailure = true }
              data = await read() // A timed-out write may have succeeded; never blindly retry it.
              evidence.absent = !data[kind].some(row => row.id === id)
              if (evidence.absent) break
            }
            if (!evidence.absent) throw new Error('Cleanup record remains: ' + kind + ':' + id)
          }
        }
        data = await read()
        result.serverFixturesRemoved = ['categories', 'bookmarks'].every(kind => !data[kind].some(row => fixtures[kind].includes(row.id)))
      } else result.serverFixturesRemoved = true
    } catch (error) { result.errors.push(error.message) }
    finally {
      // Each captured session gets its own proof, even if data deletion failed.
      for (const [token, id] of sessions) {
        const evidence = { id, revoked: false, rejected: false }
        result.sessions.push(evidence)
        try {
          let response = await request('/me', 'GET', token)
          if (response.status === 401) { evidence.rejected = true; evidence.alreadyInvalid = true; continue }
          if (!ok(response)) throw new Error('Session validation unavailable')
          try {
            response = await request('/logout', 'POST', token, {})
            evidence.revoked = ok(response) && response.data?.revoked === true
          } catch { evidence.logoutTransportFailure = true }
          const deadline = now() + revocationWaitMs
          do {
            response = await request('/me', 'GET', token)
            if (response.status === 401) { evidence.rejected = true; break }
            if (!ok(response)) throw new Error('Post-logout validation unavailable')
            if (now() >= deadline) break
            await sleep(1000)
          } while (true)
          if (!evidence.rejected) throw new Error('Session remains valid after cleanup deadline')
        } catch (error) { evidence.error = error.message; result.errors.push('Session ' + id + ': ' + error.message) }
      }
      result.sessionRevoked = result.sessions.length > 0 && result.sessions.every(row => row.rejected)
    }
    return result
  }
  return { rememberSession, redact, cleanup }
}
