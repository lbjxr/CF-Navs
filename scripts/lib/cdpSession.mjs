// 真实 Chrome 的 CDP 会话层：启动/连接、发命令、采集证据、精确清理。
//
// 从 chrome-regression.mjs 的同类逻辑独立出来，供生产验收脚本复用。
// chrome-regression.mjs 目前仍用它自己那份内联实现——两份代码同源但尚未合并，
// 等它下次需要改连接层时再迁移过来，不为了去重就动那个已经在用的验证工具。
//
// 安全约束（与 real-chrome-cdp-testing 技能一致，本模块强制而非提醒）：
//   - 默认启动隔离临时 Chrome，profile 目录名必须匹配 cf-navs-chrome-profile-<id>；
//   - 调试端口已被占用时默认拒绝，不静默复用未知浏览器；
//   - 只有 startedByTest 为真且 profile 名匹配时才允许 Browser.close 与进程清理；
//   - 复用现有浏览器时只创建/关闭本次的 target，绝不碰浏览器进程；
//   - 禁止按进程名批量结束 Chrome，只按精确 profile 路径匹配。

import { spawn, spawnSync } from 'node:child_process'
import { get as httpGet } from 'node:http'
import { existsSync } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import WebSocket from 'ws'

const SAFE_PROFILE_PATTERN = /^cf-navs-chrome-profile-[a-z0-9_-]+$/i

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url, options) {
  return await new Promise((resolve, reject) => {
    const request = httpGet(url, { headers: options?.headers }, response => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', chunk => { body += chunk })
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`${url} -> HTTP ${response.statusCode}`))
        try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
      })
    })
    request.setTimeout(3000, () => request.destroy(new Error('Local CDP request timed out')))
    request.on('error', reject)
  })
}

export class CdpSession {
  constructor(options) {
    this.chromeExe = options.chromeExe
    this.debugPort = String(options.debugPort)
    // The exact absolute launch profile is immutable for the whole session, including restarts.
    // Otherwise changing a public option between spawn/count/rm could delete a different directory.
    Object.defineProperty(this, 'userDataDir', {
      value: path.resolve(options.userDataDir), enumerable: true, writable: false, configurable: false,
    })
    this.noSandbox = Boolean(options.noSandbox)
    this.headless = Boolean(options.headless)
    this.disableQuic = Boolean(options.disableQuic)
    this.allowExisting = Boolean(options.allowExisting)

    this.ws = null
    this.nextId = 1
    this.pending = new Map()
    this.chromeProcess = null
    this.startedByTest = false
    this.targetId = null
    this.createdTarget = false
    this.sessionId = null
    this.cancelSocketOpen = null
    this.browserWsUrl = null
    this.restarting = false

    this.consoleErrors = []
    this.pageExceptions = []
    this.failedRequests = []
    this.responses = []
    this.listeners = new Map()
  }

  get profileIsSafeToDelete() {
    return SAFE_PROFILE_PATTERN.test(path.basename(this.userDataDir))
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) ?? []
    handlers.push(handler)
    this.listeners.set(method, handlers)
  }

  async isDebugPortReady() {
    try {
      const version = await fetchJson(`http://127.0.0.1:${this.debugPort}/json/version`)
      if (this.startedByTest && this.chromeProcess?.exitCode === null) {
        this.browserWsUrl = version.webSocketDebuggerUrl ?? null
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * 启动隔离临时 Chrome。
   *
   * 端口已被占用时**默认拒绝**，不静默复用：那个实例可能是使用者自己的浏览器，也可能是
   * 上一次被强杀的测试留下的孤儿（进程收到 SIGKILL 时清理逻辑根本跑不到）。静默复用会让
   * 本次结果建立在未知的浏览器状态上，还会让清理整段跳过，把孤儿一直留在机器上。
   * 确实要连一个专用实例时，构造时传 allowExisting: true。
   */
  async start() {
    if (await this.isDebugPortReady()) {
      if (!this.allowExisting) {
        throw new Error(
          `Debug port ${this.debugPort} is already in use.\n` +
          "Refusing to reuse an unknown browser: it may be the user's own Chrome, or an orphan left by a " +
          'previous run that was killed before cleanup.\n' +
          `Inspect it with: curl http://127.0.0.1:${this.debugPort}/json/version\n` +
          'If it is an orphaned test browser, stop only the processes whose command line contains a ' +
          'cf-navs-chrome-profile-* directory, then delete that directory.\n' +
          'To connect to a dedicated existing instance on purpose, pass allowExisting.',
        )
      }
      this.startedByTest = false
      return
    }

    if (!this.profileIsSafeToDelete) {
      throw new Error(
        `Refusing to launch with profile "${this.userDataDir}": ` +
        'the directory name must match cf-navs-chrome-profile-<id> so cleanup can never target a real profile.',
      )
    }
    if (!existsSync(this.chromeExe)) {
      throw new Error(`Chrome executable not found: ${this.chromeExe}`)
    }

    await mkdir(this.userDataDir, { recursive: true })

    const args = [
      `--remote-debugging-port=${this.debugPort}`,
      `--user-data-dir=${this.userDataDir}`,
      '--remote-allow-origins=*',
      '--no-first-run',
      '--no-default-browser-check',
      // Windows native-window occlusion can suspend a visible test tab when
      // another app covers it. Keep tab visibility/lifecycle unchanged.
      '--disable-features=Translate,MediaRouter,CalculateNativeWinOcclusion',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-networking',
      'about:blank',
    ]
    if (this.headless) args.unshift('--headless=new', '--disable-gpu')
    if (this.disableQuic) args.unshift('--disable-quic')
    if (this.noSandbox) args.unshift('--no-sandbox')

    this.chromeProcess = spawn(this.chromeExe, args, { stdio: 'ignore', detached: false })
    this.startedByTest = true
    let launchError = null
    this.chromeProcess.once('error', (error) => { launchError = error })

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await this.isDebugPortReady()
      if (launchError) throw new Error('Chrome process failed to start', { cause: launchError })
      if (ready) return
      await sleep(500)
    }
    throw new Error(`Chrome debug port ${this.debugPort} did not become ready`)
  }

  /** 创建专用 target 并 attach。所有权在创建时记录，不在收尾阶段猜测。 */
  async attach() {
    const version = await fetchJson(`http://127.0.0.1:${this.debugPort}/json/version`)
    const browserWs = version.webSocketDebuggerUrl
    if (!browserWs) throw new Error('Browser WebSocket endpoint unavailable')

    this.browserWsUrl = browserWs
    await this.#openSocket(browserWs)

    const created = await this.send('Target.createTarget', { url: 'about:blank' })
    this.targetId = created.targetId
    this.createdTarget = true

    const attached = await this.send('Target.attachToTarget', {
      targetId: this.targetId,
      flatten: true,
    })
    this.sessionId = attached.sessionId

    await this.send('Page.enable')
    await this.send('Runtime.enable')
    await this.send('Network.enable')
    await this.send('Log.enable')
  }

  #openSocket(url) {
    if (this.ws) return Promise.reject(new Error('CDP socket already owned'))
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 })
      // Record connecting sockets too, so a partial attach can be cleaned up.
      this.ws = socket
      const finish = (error) => {
        clearTimeout(timer)
        if (this.cancelSocketOpen === cancel) this.cancelSocketOpen = null
        if (error) reject(error)
        else resolve()
      }
      const cancel = (error) => finish(error)
      const timer = setTimeout(() => {
        if (this.ws === socket) {
          try { this.#disconnectSocket('CDP socket open timeout') } catch { /* reject below */ }
        }
        finish(new Error('CDP socket open timeout'))
      }, 10000)
      this.cancelSocketOpen = cancel
      socket.on('open', () => {
        finish(this.ws === socket ? null : new Error('CDP socket no longer owned'))
      })
      socket.on('error', () => {
        finish(new Error('CDP socket error'))
        if (this.ws === socket) this.#rejectPending('CDP socket error')
      })
      socket.on('close', () => {
        finish(new Error('CDP socket closed'))
        if (this.ws === socket) {
          this.ws = null
          this.#rejectPending('CDP socket closed')
        }
      })
      socket.on('message', (raw) => {
        // Buffered events/responses from an old socket must never reach a new connection.
        if (this.ws === socket) this.#handleMessage(raw)
      })
    })
  }

  #rejectPending(reason) {
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error(reason))
    }
    this.pending.clear()
  }

  #disconnectSocket(reason) {
    const socket = this.ws
    this.ws = null
    this.cancelSocketOpen?.(new Error(reason))
    this.cancelSocketOpen = null
    this.#rejectPending(reason)
    socket?.close()
  }

  #handleMessage(raw) {
    let message
    try {
      message = JSON.parse(raw.toString())
    } catch {
      return
    }

    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id)
      clearTimeout(timer)
      this.pending.delete(message.id)
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`))
      else resolve(message.result ?? {})
      return
    }

    this.#captureEvidence(message)

    for (const handler of this.listeners.get(message.method) ?? []) {
      try {
        handler(message.params ?? {})
      } catch {
        // 监听器自身的错误不能中断证据采集。
      }
    }
  }

  #captureEvidence(message) {
    const params = message.params ?? {}

    if (message.method === 'Runtime.consoleAPICalled' && ['error', 'assert'].includes(params.type)) {
      this.consoleErrors.push({
        type: params.type,
        text: (params.args ?? [])
          .map((arg) => arg.value ?? arg.description ?? arg.unserializableValue ?? '')
          .join(' ')
          .slice(0, 500),
      })
    }

    if (message.method === 'Runtime.exceptionThrown') {
      const details = params.exceptionDetails ?? {}
      this.pageExceptions.push({
        text: (details.exception?.description ?? details.text ?? '').slice(0, 500),
        url: details.url ?? '',
      })
    }

    if (message.method === 'Network.loadingFailed') {
      this.failedRequests.push({
        requestId: params.requestId,
        errorText: params.errorText,
        type: params.type,
        canceled: Boolean(params.canceled),
      })
    }

    if (message.method === 'Network.responseReceived') {
      const response = params.response ?? {}
      this.responses.push({
        requestId: params.requestId,
        url: response.url ?? '',
        status: response.status ?? 0,
        fromServiceWorker: Boolean(response.fromServiceWorker),
        fromDiskCache: Boolean(response.fromDiskCache),
        fromPrefetchCache: Boolean(response.fromPrefetchCache),
        type: params.type ?? '',
      })
    }
  }

  send(method, params = {}, timeoutMs = 30000) {
    const socket = this.ws
    if (socket?.readyState !== WebSocket.OPEN) return Promise.reject(new Error('CDP socket is not open'))

    const id = this.nextId++
    const payload = { id, method, params }
    // 浏览器级命令（Target.* / Browser.* / SystemInfo.*）走浏览器会话，带上 sessionId 会被
    // 拒绝为「Session with given id not found」；页面级命令必须带 sessionId 才会路由到本次 target。
    const browserScoped = /^(Target|Browser|SystemInfo)\./.test(method)
    if (this.sessionId && !browserScoped) payload.sessionId = this.sessionId

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      const fail = (error) => {
        if (!error || !this.pending.has(id)) return
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
      try {
        socket.send(JSON.stringify(payload), fail)
      } catch (error) {
        fail(error)
      }
    })
  }

  /** 在页面上下文执行函数并返回其结果。函数不能捕获宿主闭包，参数必须可序列化。 */
  async call(fn, ...args) {
    const expression = `(${fn.toString()})(${args.map((arg) => JSON.stringify(arg)).join(', ')})`
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    if (result.exceptionDetails) {
      const details = result.exceptionDetails
      throw new Error(details.exception?.description ?? details.text ?? 'page evaluation failed')
    }
    return result.result?.value
  }

  async navigate(url, { waitIdleMs = 700, timeoutMs = 30000 } = {}) {
    await this.send('Page.navigate', { url }, timeoutMs)
    await this.#waitForDocument(url, timeoutMs)
    await this.waitForNetworkIdle(waitIdleMs)
  }

  /**
   * 等文档真正换过去。
   *
   * `Page.navigate` 返回只代表导航被受理；此时 document 可能还是 about:blank，
   * 那是个 opaque origin，读 localStorage / caches 会抛 SecurityError。靠 sleep 猜时长
   * 是脆的——网络稍慢就翻车。这里改成轮询真实状态。
   */
  async #waitForDocument(url, timeoutMs) {
    const expectedOrigin = new URL(url).origin
    const started = Date.now()

    while (Date.now() - started < timeoutMs) {
      const state = await this.call(function readDocumentState() {
        return { href: location.href, readyState: document.readyState }
      }).catch(() => null)

      if (
        state &&
        state.href !== 'about:blank' &&
        state.href.startsWith(expectedOrigin) &&
        state.readyState !== 'loading'
      ) {
        return
      }
      await sleep(120)
    }

    throw new Error(`Navigation to ${url} did not settle within ${timeoutMs} ms`)
  }

  /** 简易网络静默等待：没有更好的信号时，按「一段时间内没有新响应」判定。 */
  async waitForNetworkIdle(quietMs = 700, maxWaitMs = 8000) {
    const started = Date.now()
    let lastCount = -1
    let quietSince = Date.now()

    while (Date.now() - started < maxWaitMs) {
      if (this.responses.length !== lastCount) {
        lastCount = this.responses.length
        quietSince = Date.now()
      } else if (Date.now() - quietSince >= quietMs) {
        return
      }
      await sleep(120)
    }
  }

  async setViewport({ width, height, mobile = false, scale = 2 }) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile,
      screenWidth: width,
      screenHeight: height,
    })
    if (mobile) {
      await this.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    }
  }

  async clearViewport() {
    await this.send('Emulation.clearDeviceMetricsOverride')
    await this.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  }

  async screenshotBase64({ fullPage = false } = {}) {
    const result = await this.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: fullPage,
    })
    return result.data ?? ''
  }

  /** 真实鼠标输入。dispatchEvent 不能证明交互，右键/hover/拖拽必须走这里。 */
  async mouse(x, y, { button = 'left', clickCount = 1 } = {}) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' })
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount })
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount })
  }

  async setOffline(offline) {
    await this.send('Network.emulateNetworkConditions', {
      offline,
      latency: 0,
      downloadThroughput: offline ? 0 : -1,
      uploadThroughput: offline ? 0 : -1,
    })
  }

  resetEvidence() {
    this.consoleErrors.length = 0
    this.pageExceptions.length = 0
    this.failedRequests.length = 0
    this.responses.length = 0
  }

  /**
   * Restart only our live, dedicated browser, keeping its on-disk profile.
   * Host listeners/evidence/command IDs survive; page bindings and init scripts do not.
   * A failed restart exposes evidence and leaves new ownership intact for finally cleanup.
   */
  async restart() {
    const snapshot = () => ({
      pid: this.chromeProcess?.pid ?? null,
      targetId: this.targetId,
      profile: this.userDataDir,
    })
    const evidence = {
      previous: { ...snapshot(), remainingProcesses: null }, closed: null, current: null, sameProfile: false,
    }
    if (this.restarting || this.startedByTest !== true || this.allowExisting !== false ||
        !this.profileIsSafeToDelete || this.ws?.readyState !== WebSocket.OPEN ||
        !this.createdTarget || !this.targetId || !this.sessionId || !this.chromeProcess?.pid) {
      const error = new Error('Restart requires a live test-owned target/browser and a safe dedicated profile')
      error.restartEvidence = evidence
      throw error
    }

    this.restarting = true
    try {
      // A probe that always reports zero cannot prove a live browser was actually shut down.
      evidence.previous.remainingProcesses = this.#countProcessesUsingProfile()
      if (evidence.previous.remainingProcesses <= 0) {
        throw new Error('Restart stopped: live browser profile process count must be positive')
      }
      evidence.closed = await this.cleanup({ preserveProfile: true })
      const closed = evidence.closed
      if (closed.errors.length || !closed.targetClosed || !closed.browserClosed ||
          closed.remainingProcesses !== 0 || !closed.profilePreserved || closed.profileRemoved) {
        throw new Error('Restart stopped: previous browser/profile cleanup was not confirmed')
      }

      // Clear connection ownership, not host listeners, evidence arrays or the global ID counter.
      this.ws = null
      this.browserWsUrl = null
      this.sessionId = null
      this.targetId = null
      this.createdTarget = false
      this.chromeProcess = null
      this.startedByTest = false
      await this.start()
      await this.attach()
      evidence.current = snapshot()
      evidence.sameProfile = evidence.current.profile === evidence.previous.profile
      return evidence
    } catch (cause) {
      evidence.current = snapshot()
      const error = new Error(cause.message, { cause })
      error.restartEvidence = evidence
      throw error
    } finally {
      this.restarting = false
    }
  }

  /**
   * Only close owned resources. Unknown process counts are errors, never zero.
   * preserveProfile requires confirmed closure and an existing directory; never removes it.
   * Return diagnostics so a runner's finally block can still write its report.
   */
  async cleanup({ preserveProfile = false } = {}) {
    const outcome = {
      startedByTest: this.startedByTest,
      targetClosed: false,
      browserClosed: false,
      profileRemoved: false,
      profilePreserved: false,
      remainingProcesses: null,
      errors: [],
      warnings: [],
    }
    const ownsProfile = this.startedByTest && this.profileIsSafeToDelete
    const profile = this.userDataDir

    // A partial start/attach can leave an owned process without a usable socket.
    // Reconnect only for our dedicated browser; never discover or borrow another target.
    if (ownsProfile && !this.allowExisting && this.ws?.readyState !== WebSocket.OPEN) {
      try {
        this.#disconnectSocket('CDP cleanup reconnecting')
        // Never rediscover a port that another browser may have acquired after ours exited.
        if (!this.browserWsUrl) throw new Error('Owned browser WebSocket endpoint unavailable')
        await this.#openSocket(this.browserWsUrl)
      } catch {
        outcome.errors.push('Browser.close: owned browser connection unavailable')
      }
    }

    if (this.createdTarget && this.targetId && this.ws?.readyState === WebSocket.OPEN) {
      try {
        const result = await this.send('Target.closeTarget', { targetId: this.targetId }, 10000)
        if (result.success !== true) throw new Error('target closure was not confirmed')
        outcome.targetClosed = true
      } catch (error) {
        outcome.errors.push(`closeTarget: ${error.message}`)
      }
    } else if (this.createdTarget && this.targetId) {
      outcome.errors.push('closeTarget: owned target connection unavailable')
    }

    if (ownsProfile && this.ws?.readyState === WebSocket.OPEN) {
      try {
        await this.send('Browser.close', {}, 10000)
        outcome.browserClosed = true
      } catch (error) {
        outcome.errors.push(`Browser.close: ${error.message}`)
      }
    }

    try {
      this.#disconnectSocket('CDP session cleaned up')
    } catch {
      outcome.errors.push('CDP socket close failed')
    }
    try {
      this.chromeProcess?.unref()
    } catch {
      // An already-exited process needs no unref.
    }

    if (ownsProfile) {
      try {
        let remaining = this.#countProcessesUsingProfile()
        for (let attempt = 0; attempt < 10 && remaining > 0; attempt += 1) {
          await sleep(500)
          remaining = this.#countProcessesUsingProfile()
        }
        outcome.remainingProcesses = remaining
      } catch (error) {
        outcome.errors.push(error.message)
        return outcome // Unknown means preserve, with no deletion or restart.
      }

      if (outcome.remainingProcesses > 0) {
        outcome.errors.push(`${outcome.remainingProcesses} Chrome process(es) still using the test profile; profile not deleted`)
      } else if (preserveProfile) {
        try {
          if (!(await stat(profile)).isDirectory()) throw new Error('not a directory')
          outcome.profilePreserved = true
        } catch {
          outcome.errors.push('preserveProfile: test profile directory could not be confirmed')
        }
      } else {
        // Chrome can release file handles shortly after the process count reaches zero.
        let lastError = null
        for (let attempt = 0; attempt < 12; attempt += 1) {
          try {
            await rm(profile, { recursive: true, force: true, maxRetries: 3 })
            outcome.profileRemoved = true
            lastError = null
            break
          } catch (error) {
            lastError = error
            await sleep(1500)
          }
        }
        if (lastError) {
          outcome.warnings.push(
            `temp profile not deleted after 18s of retries (${lastError.message}). ` +
            'No browser process is left running; this is disk residue only. ' +
            'Remove it with the snippet in docs/guides/PRODUCTION_ACCEPTANCE.md section 7.',
          )
        }
      }
    } else if (preserveProfile) {
      outcome.errors.push('preserveProfile: no safe test-owned profile')
    }

    return outcome
  }

  /** Count exact profile arguments without ever logging process command lines. */
  #countProcessesUsingProfile() {
    const windows = process.platform === 'win32'
    const space = windows ? '\\s' : '[[:space:]]'
    const escaped = this.userDataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = `(^|${space})("--user-data-dir=${escaped}"|--user-data-dir="${escaped}"|--user-data-dir=${escaped})(${space}|$)`
    const options = { encoding: 'utf8', timeout: 10000, windowsHide: true }
    const script = [
      "$ErrorActionPreference = 'Stop'",
      // PowerShell single-quoted literals escape only apostrophes, not Windows backslashes.
      `$profileDir = '${this.userDataDir.replaceAll("'", "''")}'`,
      '$escapedProfile = [regex]::Escape($profileDir)',
      `$profileArgument = '(^|\\s)("--user-data-dir=' + $escapedProfile + '"|--user-data-dir="' + $escapedProfile + '"|--user-data-dir=' + $escapedProfile + ')(\\s|$)'`,
      '$matched = @(Get-CimInstance Win32_Process -Filter "Name = \'chrome.exe\'" -ErrorAction Stop |',
      '  Where-Object { $_.CommandLine -and $_.CommandLine -match $profileArgument })',
      '$matched.Count',
    ].join('\n')
    const unknown = (reason) => { throw new Error(`Profile process count unknown: ${reason}; profile retained`) }
    let result
    try {
      result = windows
        ? spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], options)
        : spawnSync('pgrep', ['-f', '--', pattern], options)
    } catch {
      unknown('query failed') // Do not expose subprocess errors containing command lines.
    }
    if (!result || result.error || result.signal || result.status === null) unknown('query failed')
    if (typeof result.stdout !== 'string') unknown('missing query output')
    const output = result.stdout.trim()
    if (!windows && result.status === 1 && output === '') return 0
    if (result.status !== 0) unknown('query exit status was not successful')
    if (windows) {
      if (!/^(0|[1-9][0-9]*)$/.test(output) || !Number.isSafeInteger(Number(output))) {
        unknown('invalid integer output')
      }
      return Number(output)
    }
    const pids = output.split(/\r?\n/)
    if (pids.some(pid => !/^[1-9][0-9]*$/.test(pid) || !Number.isSafeInteger(Number(pid)))) {
      unknown('invalid PID output')
    }
    return pids.length
  }
}

export { sleep, SAFE_PROFILE_PATTERN }
