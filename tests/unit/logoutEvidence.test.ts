import { describe, expect, it } from 'vitest'
import { verifiedLogoutFailures } from '../../scripts/lib/logoutEvidence.mjs'
const logout = { requestId: 'logout', stage: 'logout-case', path: '/api/logout', method: 'POST', status: 200, logoutRevoked: true, authSession: 1, time: 20, responseTime: 22 }
const old = { requestId: 'inflight', stage: 'logout-case', path: '/api/data/version', method: 'GET', status: 401, authSession: 1, time: 19, responseTime: 23 }
describe('proved logout authentication failures', () => {
  it('matches an old-session request crossing confirmed revocation', () => { expect(verifiedLogoutFailures([old, logout])).toEqual(['inflight']) })
  it.each([
    { authSession: 2 }, { authSession: undefined }, { time: 23 }, { responseTime: 19 },
    { responseTime: undefined }, { stage: 'different' }, { path: '/api/icon/1' }, { status: 500 }, { method: 'POST' },
  ])('does not excuse unrelated failures %j', override => { expect(verifiedLogoutFailures([{ ...old, ...override }, logout])).toEqual([]) })
  it.each([{ status: 500 }, { logoutRevoked: false }, { logoutRevoked: undefined }, { authSession: undefined }, { responseTime: undefined }])('requires proof of successful revocation %j', override => { expect(verifiedLogoutFailures([old, { ...logout, ...override }])).toEqual([]) })
  it('allows the old credential only until both tabs confirm local logout', () => {
    const ending = { ...logout, clientClearedAt: 100.2 }
    expect(verifiedLogoutFailures([{ ...old, time: 22.003, wallTime: 100.1 }, ending])).toEqual(['inflight'])
    expect(verifiedLogoutFailures([{ ...old, time: 22.003, wallTime: 100.3 }, ending])).toEqual([])
    expect(verifiedLogoutFailures([{ ...old, time: 22.003, wallTime: 100.1, authSession: 2 }, ending])).toEqual([])
  })
  it('does not excuse failures without a logout', () => { expect(verifiedLogoutFailures([old])).toEqual([]) })
})
