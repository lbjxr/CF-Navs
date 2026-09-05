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
import { existsSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import WebSocket from 'ws'

const SAFE_PROFILE_PATTERN = /^cf-navs-chrome-profile-[a-z0-9_-]+$/i

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchJson(url, options) {
  const response = await fetch(url, options)
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`)
  return response.json()
}

export class CdpSession {
  constructor(options) {
    this.chromeExe = options.chromeExe
    this.debugPort = String(options.debugPort)
    this.userDataDir = options.userDataDir
    this.noSandbox = Boolean(options.noSandbox)
    this.headless = Boolean(options.headless)
    this.allowExisting = Boolean(options.allowExisting)

    this.ws = null
    this.nextId = 1
    this.pending = new Map()
    this.chromeProcess = null
    this.startedByTest = false
    this.targetId = null
    this.createdTarget = false
    this.sessionId = null

    this.consoleErrors = []
    this.pageExceptions = []
    this.failedRequests = []
    this.responses = []
    this.listeners = new Map()
  }

  get profileIsSafeToDelete() {
    return SAFE_PROFILE_PATTERN.test(path.basename(path.resolve(this.userDataDir)))
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) ?? []
    handlers.push(handler)
    this.listeners.set(method, handlers)
  }

  async isDebugPortReady() {
    try {
      await fetchJson(`http://127.0.0.1:${this.debugPort}/json/version`)
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
      '--disable-features=Translate,MediaRouter',
      '--disable-background-networking',
      'about:blank',
    ]
    if (this.headless) args.unshift('--headless=new', '--disable-gpu')
    if (this.noSandbox) args.unshift('--no-sandbox')

    this.chromeProcess = spawn(this.chromeExe, args, { stdio: 'ignore', detached: false })
    this.startedByTest = true

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (await this.isDebugPortReady()) return
      await sleep(500)
    }
    throw new Error(`Chrome debug port ${this.debugPort} did not become ready`)
  }

  /** 创建专用 target 并 attach。所有权在创建时记录，不在收尾阶段猜测。 */
  async attach() {
    const version = await fetchJson(`http://127.0.0.1:${this.debugPort}/json/version`)
    const browserWs = version.webSocketDebuggerUrl
    if (!browserWs) throw new Error('Browser WebSocket endpoint unavailable')

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
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 })
      socket.on('open', () => {
        this.ws = socket
        resolve()
      })
      socket.on('error', reject)
      socket.on('message', (raw) => this.#handleMessage(raw))
    })
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
    if (!this.ws) return Promise.reject(new Error('CDP socket is not open'))

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
      this.ws.send(JSON.stringify(payload))
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
   * 清理。只关闭本次创建的 target；只有本次启动且 profile 名匹配时才关浏览器。
   * 返回清理结果——清理失败属于测试结果的一部分，不能被静默吞掉。
   */
  async cleanup() {
    const outcome = {
      startedByTest: this.startedByTest,
      targetClosed: false,
      browserClosed: false,
      profileRemoved: false,
      errors: [],
    }

    if (this.createdTarget && this.targetId && this.ws) {
      try {
        await this.send('Target.closeTarget', { targetId: this.targetId }, 10000)
        outcome.targetClosed = true
      } catch (error) {
        outcome.errors.push(`closeTarget: ${error.message}`)
      }
    }

    if (this.startedByTest && this.profileIsSafeToDelete && this.ws) {
      try {
        await this.send('Browser.close', {}, 10000)
        outcome.browserClosed = true
      } catch (error) {
        outcome.errors.push(`Browser.close: ${error.message}`)
      }
    }

    try {
      this.ws?.close()
    } catch {
      // 套接字已断开时无需处理。
    }

    if (this.startedByTest && this.profileIsSafeToDelete) {
      // Browser.close 返回后进程退出仍需要一点时间，等到计数归零再删目录。
      let remaining = this.#countProcessesUsingProfile()
      for (let attempt = 0; attempt < 10 && remaining > 0; attempt += 1) {
        await sleep(500)
        remaining = this.#countProcessesUsingProfile()
      }

      if (remaining > 0) {
        outcome.errors.push(
          `${remaining} Chrome process(es) still using ${this.userDataDir}; profile not deleted`,
        )
      } else {
        // 进程数已归零，但 Chrome 刚退出时文件句柄可能还没释放（常见于词典文件 *.bdic），
        // 直接删会拿到 EBUSY。退避重试，最后一次失败才算清理失败。
        let lastError = null
        for (let attempt = 0; attempt < 6; attempt += 1) {
          try {
            await rm(this.userDataDir, { recursive: true, force: true, maxRetries: 3 })
            outcome.profileRemoved = true
            lastError = null
            break
          } catch (error) {
            lastError = error
            await sleep(750)
          }
        }
        if (lastError) outcome.errors.push(`profile removal: ${lastError.message}`)
      }
    }

    return outcome
  }

  /**
   * 统计命令行里精确包含本次 profile 路径的 chrome 进程数。
   * 只按 profile 路径匹配——绝不按进程名，那会杀掉使用者自己的浏览器。
   */
  #countProcessesUsingProfile() {
    if (process.platform !== 'win32') {
      const result = spawnSync('pgrep', ['-f', this.userDataDir], { encoding: 'utf8' })
      return (result.stdout ?? '').split('\n').filter((line) => line.trim()).length
    }

    const script = [
      `$profileDir = ${JSON.stringify(this.userDataDir)}`,
      "$matched = Get-CimInstance Win32_Process -Filter \"Name = 'chrome.exe'\" |",
      '  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profileDir) }',
      'if ($matched) { @($matched).Count } else { 0 }',
    ].join('\n')

    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
    })
    return Number.parseInt((result.stdout ?? '').trim(), 10) || 0
  }
}

export { sleep, SAFE_PROFILE_PATTERN }
