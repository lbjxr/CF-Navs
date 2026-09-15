import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ErrCode } from '../../shared/types'
import {
  canUseInstalledFallback,
  getInstallRoute,
  getInstallViewState,
  hasInstalledHint,
  installationCommittedAfterFailure,
  isInstallPath,
  normalizeInstallError,
  setInstalledHint,
  shouldProbeInstallStatus,
  shouldRecheckInstallAfterDataError,
  toInstallScreenState,
} from '../../src/lib/appInstall'

describe('install status probing', () => {
  // 这个探测过去无条件串行阻塞在所有数据加载之前，每次打开页面都白白多一个
  // 完整网络往返加两次 D1 查询。浏览器记住装过之后就没必要再问。
  it('skips the probe once the browser knows the site is installed', () => {
    expect(shouldProbeInstallStatus({ installedHint: true, pathname: '/' })).toBe(false)
    expect(shouldProbeInstallStatus({ installedHint: true, pathname: '/admin' })).toBe(false)
  })

  it('still probes without a local hint', () => {
    expect(shouldProbeInstallStatus({ installedHint: false, pathname: '/' })).toBe(true)
    expect(shouldProbeInstallStatus({ installedHint: false, pathname: '/admin' })).toBe(true)
  })

  it('always probes on the install route regardless of the hint', () => {
    // 用户主动进安装页时必须拿真实状态，不能用本地猜测糊弄过去
    expect(shouldProbeInstallStatus({ installedHint: true, pathname: '/install' })).toBe(true)
    expect(shouldProbeInstallStatus({ installedHint: true, pathname: '/install/' })).toBe(true)
  })

  it('probes when the caller forces a recheck', () => {
    expect(shouldProbeInstallStatus({ installedHint: true, pathname: '/', forceProbe: true })).toBe(true)
  })
})

describe('install recheck after a data load failure', () => {
  it('rechecks on server errors, which is how a wiped database surfaces', () => {
    // Worker 的 onError 走 HTTP 200 + code=1500，所以两种形态都要认
    expect(shouldRecheckInstallAfterDataError({ status: 200, code: ErrCode.SERVER_ERROR })).toBe(true)
    expect(shouldRecheckInstallAfterDataError({ status: 500 })).toBe(true)
    expect(shouldRecheckInstallAfterDataError({ status: 503 })).toBe(true)
  })

  it('does not recheck on normal business branches', () => {
    // 未登录和公开模式关闭都是正常状态，再发一个探测请求毫无意义
    expect(shouldRecheckInstallAfterDataError({ code: ErrCode.UNAUTHORIZED, status: 401 })).toBe(false)
    expect(shouldRecheckInstallAfterDataError({ code: ErrCode.FORBIDDEN })).toBe(false)
    expect(shouldRecheckInstallAfterDataError({ code: ErrCode.BAD_REQUEST })).toBe(false)
    expect(shouldRecheckInstallAfterDataError({ code: ErrCode.NOT_FOUND })).toBe(false)
  })

  it('does not recheck when the request never reached the server', () => {
    // api.ts 的网络失败是 status=0 且 code=SERVER_ERROR，光看 code 会误判成服务端挂了。
    // 弱网时再补一个请求只会雪上加霜。
    expect(shouldRecheckInstallAfterDataError({ status: 0, code: ErrCode.SERVER_ERROR })).toBe(false)
    expect(shouldRecheckInstallAfterDataError(null)).toBe(false)
    expect(shouldRecheckInstallAfterDataError(undefined)).toBe(false)
    expect(shouldRecheckInstallAfterDataError(new Error('boom'))).toBe(false)
  })
})

// 下面这一组是**接线断言**，不迁移到组件层（PROB-18）：本文件其余用例已经用纯函数覆盖了
// `shouldProbeInstallStatus` / `shouldRecheckInstallAfterDataError` 的全部判定分支，这里要证明的
// 只有一件事——App 编排层真的调用了它们，而不是把判定逻辑另抄一份。要用真 DOM 证明就得挂载
// `src/App.svelte`（约 1100 行，同时编排认证、CRUD、弹窗、Admin 懒加载与备份接线），需要预先
// mock 整个 `src/lib/api` 与浏览器存储；那属于 PROB-24 的编排拆分前置工作。在拆分完成前，
// 源码断言是这条接线唯一可及的证据。

describe('app boot wiring', () => {
  it('gates the install probe and keeps the recheck fallback', () => {
    const source = readFileSync('src/App.svelte', 'utf8')

    expect(source).toContain('shouldProbeInstallStatus(')
    expect(source).toContain('shouldRecheckInstallAfterDataError(')
    // 跳过探测的代价是本地标记可能过期，兜底路径不能被顺手删掉
    expect(source).toContain('recheckInstallAfterDataError')
  })
})

describe('app installation helpers', () => {
  it('routes only installed deployments to the application', () => {
    expect(getInstallRoute({ state: 'installed', schema_version: 1 })).toBe('app')
    expect(getInstallRoute({
      state: 'needs_install',
      schema_version: null,
      setup_token_configured: true,
    })).toBe('install')
  })

  it('maps every incomplete status to actionable install guidance', () => {
    expect(getInstallViewState(toInstallScreenState({
      state: 'configuration_required',
      reason: 'setup_token_missing',
      schema_version: null,
    }))?.mode).toBe('setup_token_missing')
    expect(getInstallViewState(toInstallScreenState({
      state: 'bindings_missing',
      missing: ['DB', 'SESSION'],
    }))).toMatchObject({
      mode: 'bindings_missing',
      missingBindings: ['DB', 'SESSION'],
    })
    expect(getInstallViewState(toInstallScreenState({
      state: 'unavailable',
      reason: 'database_unreachable',
    }))?.mode).toBe('database_unreachable')
    expect(getInstallViewState(toInstallScreenState({
      state: 'needs_install',
      schema_version: 1,
      setup_token_configured: true,
    }))).toMatchObject({ mode: 'needs_install', schemaVersion: 1 })
  })

  it('recognizes the dedicated install path without matching similarly named paths', () => {
    expect(isInstallPath('/install')).toBe(true)
    expect(isInstallPath('/install/')).toBe(true)
    expect(isInstallPath('/install/retry')).toBe(true)
    expect(isInstallPath('/installation')).toBe(false)
    expect(isInstallPath('/')).toBe(false)
  })

  it('persists only a confirmed installed hint and uses it for transient outages', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    }

    expect(hasInstalledHint(storage)).toBe(false)
    setInstalledHint(storage, true)
    expect(hasInstalledHint(storage)).toBe(true)
    expect(canUseInstalledFallback({
      state: 'unavailable',
      reason: 'session_store_unreachable',
    }, true)).toBe(true)
    expect(canUseInstalledFallback({
      state: 'needs_install',
      schema_version: null,
      setup_token_configured: true,
    }, true)).toBe(false)
    setInstalledHint(storage, false)
    expect(hasInstalledHint(storage)).toBe(false)
  })

  it('detects credentials committed before session creation failed', async () => {
    await expect(installationCommittedAfterFailure(async () => ({
      state: 'installed',
      schema_version: 1,
    }))).resolves.toBe(true)
    await expect(installationCommittedAfterFailure(async () => ({
      state: 'needs_install',
      schema_version: null,
      setup_token_configured: true,
    }))).resolves.toBe(false)
    await expect(installationCommittedAfterFailure(async () => {
      throw new Error('status unavailable')
    })).resolves.toBe(false)
  })

  it('tolerates unavailable browser storage for the installed hint', () => {
    const storage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    }

    expect(hasInstalledHint(storage)).toBe(false)
    expect(() => setInstalledHint(storage, true)).not.toThrow()
  })

  it('normalizes installation failures into actionable text', () => {
    expect(normalizeInstallError(new Error('status unavailable'))).toBe('status unavailable')
    expect(normalizeInstallError(null)).toContain('重试')
  })
})
