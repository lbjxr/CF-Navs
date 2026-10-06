// Expected authentication failures require a proved server revocation and an
// in-flight request from exactly that session. Never exempt all 401 responses.
export function verifiedLogoutFailures(rows) {
  const revocations = rows.filter(row => row.path === '/api/logout' && row.method === 'POST' &&
    row.status === 200 && row.logoutRevoked === true && Number.isInteger(row.authSession) &&
    Number.isFinite(row.time) && Number.isFinite(row.responseTime))
  return rows.filter(row => row.status === 401 && row.method === 'GET' &&
    ['/api/data/version', '/api/admin/data'].includes(row.path) &&
    revocations.some(logout => logout.stage === row.stage && row.authSession === logout.authSession &&
      Number.isFinite(row.time) && Number.isFinite(row.responseTime) &&
      (row.time <= logout.responseTime ||
        (Number.isFinite(row.wallTime) && Number.isFinite(logout.clientClearedAt) && row.wallTime <= logout.clientClearedAt)) && row.responseTime >= logout.time)
  ).map(row => row.requestId)
}
