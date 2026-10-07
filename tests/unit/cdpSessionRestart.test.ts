// @vitest-environment node
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const io = vi.hoisted(() => ({
  spawn: vi.fn(), count: vi.fn(), exists: vi.fn(), mkdir: vi.fn(), rm: vi.fn(), stat: vi.fn(),
  http: vi.fn(), socket: vi.fn(),
}))
vi.mock('node:child_process', () => ({ spawn: io.spawn, spawnSync: io.count }))
vi.mock('node:fs', () => ({ existsSync: io.exists }))
vi.mock('node:fs/promises', () => ({ mkdir: io.mkdir, rm: io.rm, stat: io.stat }))
vi.mock('node:http', () => ({ get: io.http }))
vi.mock('ws', () => {
  class WebSocket {
    static OPEN = 1
    constructor(url: string) { return io.socket(url) }
  }
  return { default: WebSocket }
})
import { CdpSession } from '../../scripts/lib/cdpSession.mjs'

type Command = { id: number; method: string; params: Record<string, unknown>; sessionId?: string }
type Reply = { result?: Record<string, unknown>; error?: { message: string; code: number } }
type Process = EventEmitter & { pid: number; exitCode: number | null; unref: ReturnType<typeof vi.fn> }
type Socket = EventEmitter & {
  readyState: number; send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>;
  commands: Command[]; url: string;
}
const profile = path.resolve('unit-fixtures', 'cf-navs-chrome-profile-restart')
const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
let trace: string[]
let processes: Process[]
let sockets: Socket[]
let portReady: boolean
let replies: Map<string, Reply | 'hold'>
let socketFailure: boolean
let sessions: InstanceType<typeof CdpSession>[]

function countResult(status = 0, stdout = '0\n') {
  return { status, stdout, stderr: '', signal: null, error: undefined }
}
function usePlatform(value: string) {
  Object.defineProperty(process, 'platform', { ...platform, value })
}
function session(options = {}) {
  const value = new CdpSession({ chromeExe: 'chrome-for-unit-tests', debugPort: 9456, userDataDir: profile, ...options })
  sessions.push(value)
  return value
}
async function live(options = {}) {
  const value = session(options)
  await value.start()
  await value.attach()
  trace.length = 0
  return value
}
function event(socket: Socket, method: string, params: unknown = {}) {
  socket.emit('message', Buffer.from(JSON.stringify({ method, params })))
}
async function restartError(value: InstanceType<typeof CdpSession>) {
  return value.restart().then(() => { throw new Error('Expected restart to reject') }, error => error)
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  vi.resetAllMocks()
  usePlatform('win32')
  trace = []; processes = []; sockets = []; sessions = []
  replies = new Map(); portReady = false; socketFailure = false
  io.exists.mockReturnValue(true)
  io.mkdir.mockImplementation(async () => { trace.push('mkdir') })
  io.rm.mockImplementation(async () => { trace.push('remove-profile') })
  io.stat.mockImplementation(async () => { trace.push('check-profile'); return { isDirectory: () => true } })
  io.count.mockImplementation(() => { trace.push('count'); return countResult(0, processes.at(-1)?.exitCode === null ? '1' : '0') })
  io.spawn.mockImplementation(() => {
    trace.push('spawn')
    const child = Object.assign(new EventEmitter(), { pid: 100 + processes.length, exitCode: null, unref: vi.fn() }) as Process
    processes.push(child)
    portReady = true
    return child
  })
  io.http.mockImplementation((_url, _options, callback) => {
    const request = Object.assign(new EventEmitter(), { setTimeout: vi.fn(), destroy: vi.fn() })
    queueMicrotask(() => {
      if (!portReady) { request.emit('error', new Error('port unavailable')); return }
      const response = Object.assign(new EventEmitter(), { statusCode: 200, setEncoding: vi.fn() })
      callback(response)
      response.emit('data', JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:9456/devtools/browser/unit-${processes.length}` }))
      response.emit('end')
    })
    return request
  })
  io.socket.mockImplementation((url: string) => {
    const socket = Object.assign(new EventEmitter(), { readyState: 0, commands: [] as Command[], url, send: vi.fn(), close: vi.fn() }) as Socket
    const number = sockets.push(socket)
    socket.send.mockImplementation((raw: string, callback) => {
      const command: Command = JSON.parse(raw)
      socket.commands.push(command)
      trace.push(command.method)
      const override = replies.get(command.method)
      if (override === 'hold') return
      let result: Record<string, unknown> = {}
      if (command.method === 'Target.createTarget') result = { targetId: `target-${number}` }
      if (command.method === 'Target.attachToTarget') result = { sessionId: `session-${number}` }
      if (command.method === 'Target.closeTarget') result = { success: true }
      if (command.method === 'Browser.close' && !override?.error) {
        portReady = false
        processes.at(-1)!.exitCode = 0
      }
      queueMicrotask(() => {
        callback?.(undefined)
        socket.emit('message', Buffer.from(JSON.stringify({ id: command.id, ...(override ?? { result }) })))
      })
    })
    socket.close.mockImplementation(() => {
      trace.push('socket-close')
      socket.readyState = 3
      socket.emit('close')
    })
    queueMicrotask(() => {
      if (socketFailure) {
        socketFailure = false; socket.readyState = 3; socket.emit('error', new Error('connect failed'))
      } else { socket.readyState = 1; socket.emit('open') }
    })
    return socket
  })
})

afterEach(() => {
  // No real processes/files/sockets were created; fail on leaked command/open timers.
  expect(sessions.every(value => value.pending.size === 0)).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
  Object.defineProperty(process, 'platform', platform)
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('CdpSession cleanup ownership and profile policy', () => {
  it('deletes the default profile only after closing the exact target/browser and counting zero', async () => {
    const value = await live()
    const result = await value.cleanup()
    expect(result).toMatchObject({ targetClosed: true, browserClosed: true, profileRemoved: true, profilePreserved: false, remainingProcesses: 0, errors: [] })
    expect(trace).toEqual(['Target.closeTarget', 'Browser.close', 'socket-close', 'count', 'remove-profile'])
    expect(sockets[0].commands.find(command => command.method === 'Target.closeTarget')?.params).toEqual({ targetId: 'target-1' })
    expect(io.rm).toHaveBeenCalledExactlyOnceWith(profile, { recursive: true, force: true, maxRetries: 3 })
    expect(processes[0].unref).toHaveBeenCalledOnce()
  })

  it('preserves the profile, verifies it is a directory, and never deletes it', async () => {
    const value = await live()
    const result = await value.cleanup({ preserveProfile: true })
    expect(result).toMatchObject({ targetClosed: true, browserClosed: true, profileRemoved: false, profilePreserved: true, remainingProcesses: 0, errors: [] })
    expect(trace).toEqual(['Target.closeTarget', 'Browser.close', 'socket-close', 'count', 'check-profile'])
    expect(io.stat).toHaveBeenCalledWith(profile)
    expect(io.rm).not.toHaveBeenCalled()
  })

  it('only closes its created target in a reused browser, never the browser or profile', async () => {
    portReady = true
    const value = await live({ allowExisting: true })
    const result = await value.cleanup()
    expect(result).toMatchObject({ startedByTest: false, targetClosed: true, browserClosed: false, remainingProcesses: null })
    expect(trace).toEqual(['Target.closeTarget', 'socket-close'])
    expect(io.spawn).not.toHaveBeenCalled()
    expect(io.count).not.toHaveBeenCalled()
    expect(io.rm).not.toHaveBeenCalled()
  })

  it('does not close an unowned target or operate on an unsafe profile', async () => {
    portReady = true
    const value = await live({ allowExisting: true, userDataDir: path.resolve('unit-fixtures', 'Default') })
    value.createdTarget = false
    const result = await value.cleanup({ preserveProfile: true })
    expect(trace).toEqual(['socket-close'])
    expect(result.errors).toContain('preserveProfile: no safe test-owned profile')
    expect(io.count).not.toHaveBeenCalled()
    expect(io.rm).not.toHaveBeenCalled()
  })

  it('locks the resolved launch profile against reassignment/redefinition across cleanup and restart', async () => {
    const relative = path.join('unit-fixtures', '..', 'unit-fixtures', 'cf-navs-chrome-profile-locked')
    const absolute = path.resolve(relative)
    const options = { userDataDir: relative }
    const value = await live(options)
    options.userDataDir = path.resolve('unit-fixtures', 'cf-navs-chrome-profile-other')
    expect(() => { value.userDataDir = options.userDataDir }).toThrow(TypeError)
    expect(() => Object.defineProperty(value, 'userDataDir', { value: options.userDataDir })).toThrow(TypeError)
    expect(value.userDataDir).toBe(absolute)
    const result = await value.restart()
    expect(result.previous.profile).toBe(absolute)
    expect(result.current.profile).toBe(absolute)
    for (const [, args] of io.spawn.mock.calls) expect(args).toContain(`--user-data-dir=${absolute}`)
    expect(io.stat).toHaveBeenCalledWith(absolute)
    await value.cleanup()
    expect(io.rm).toHaveBeenCalledExactlyOnceWith(absolute, { recursive: true, force: true, maxRetries: 3 })
  })

  it('rejects unsafe profile startup and restart even if a caller falsely asserts process ownership', async () => {
    const value = session({ userDataDir: path.resolve('Default') })
    await expect(value.start()).rejects.toThrow('Refusing to launch')
    value.startedByTest = true
    value.ws = { readyState: 1 }
    value.createdTarget = true
    value.targetId = 'claimed-target'
    value.sessionId = 'claimed-session'
    value.chromeProcess = { pid: 123 }
    const error = await restartError(value)
    expect(error.restartEvidence.closed).toBeNull()
    expect(io.spawn).not.toHaveBeenCalled()
    expect(io.count).not.toHaveBeenCalled()
    expect(io.rm).not.toHaveBeenCalled()
  })

  it('retains a profile and reports deletion failure as a warning rather than throwing in finally', async () => {
    const value = await live()
    io.rm.mockRejectedValue(new Error('locked'))
    const operation = value.cleanup()
    await vi.runAllTimersAsync()
    const result = await operation
    expect(result).toMatchObject({ remainingProcesses: 0, profileRemoved: false, errors: [] })
    expect(result.warnings).toHaveLength(1)
    expect(io.rm).toHaveBeenCalledTimes(12)
  })
})

describe('strict profile process counting', () => {
  it.each([
    ['exit failure', { status: 1, stdout: '0' }],
    ['missing exit status', { status: null, stdout: '0' }],
    ['spawn error', { error: new Error('private command line'), stdout: '0' }],
    ['signal', { signal: 'SIGTERM', stdout: '0' }],
    ['empty output', { stdout: '' }],
    ['missing output', { stdout: undefined }],
    ['negative', { stdout: '-1' }],
    ['decimal', { stdout: '0.5' }],
    ['numeric prefix', { stdout: '0 invalid' }],
    ['multiple counts', { stdout: '0\n1' }],
    ['unsafe integer', { stdout: '9007199254740992' }],
  ])('returns unknown/errors for Windows %s, preserving the profile and preventing restart', async (_label, override) => {
    const value = await live()
    io.count.mockReturnValue({ ...countResult(), ...override, stderr: 'private command line' })
    const result = await value.cleanup()
    expect(result).toMatchObject({ remainingProcesses: null, profileRemoved: false })
    expect(result.errors).toEqual([expect.stringContaining('count unknown')])
    expect(JSON.stringify(result)).not.toContain('private command line')
    expect(io.rm).not.toHaveBeenCalled()
    // Exercise the same counting gate on a fresh live session through restart().
    const restarting = await live()
    const error = await restartError(restarting)
    expect(error.restartEvidence.closed).toBeNull()
    expect(error.restartEvidence.previous.remainingProcesses).toBeNull()
    expect(trace).toEqual([])
    expect(io.spawn).toHaveBeenCalledTimes(2)
  })

  it('treats a synchronous query exception as unknown and preserves finally diagnostics', async () => {
    const value = await live()
    io.count.mockImplementation(() => { throw new Error('private command line') })
    const result = await value.cleanup()
    expect(result.remainingProcesses).toBeNull()
    expect(result.errors).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('private command line')
    expect(io.rm).not.toHaveBeenCalled()
  })

  it.each(['win32', 'linux'])('polls positive %s counts, but does not restart while processes remain', async platformName => {
    const value = await live()
    usePlatform(platformName)
    io.count.mockReturnValue(countResult(0, platformName === 'win32' ? '2' : '321\n654\n'))
    const operation = restartError(value)
    await vi.runAllTimersAsync()
    const error = await operation
    expect(error.restartEvidence.closed).toMatchObject({ remainingProcesses: 2, profilePreserved: false })
    expect(io.count).toHaveBeenCalledTimes(12)
    expect(io.spawn).toHaveBeenCalledTimes(1)
    expect(io.rm).not.toHaveBeenCalled()
    expect(io.stat).not.toHaveBeenCalled()
  })

  it('forgets the last known positive count if a later poll fails', async () => {
    const value = await live()
    io.count.mockReturnValueOnce(countResult(0, '1')).mockReturnValue(countResult(3, ''))
    const operation = value.cleanup()
    await vi.runAllTimersAsync()
    expect(await operation).toMatchObject({ remainingProcesses: null, profileRemoved: false, errors: [expect.stringContaining('count unknown')] })
    expect(io.rm).not.toHaveBeenCalled()
  })

  it('waits for a positive count to reach zero before preserving', async () => {
    const value = await live()
    io.count.mockReturnValueOnce(countResult(0, '1')).mockReturnValue(countResult())
    const operation = value.cleanup({ preserveProfile: true })
    await vi.runAllTimersAsync()
    expect(await operation).toMatchObject({ remainingProcesses: 0, profilePreserved: true, errors: [] })
  })

  it.each([
    [1, '', true], [0, '', false], [2, '', false], [127, '', false],
    [1, '321', false], [0, 'not-a-pid', false], [0, '-1', false], [0, '0', false],
  ])('Unix pgrep status=%s output=%s permits deletion=%s', async (status, stdout, deleted) => {
    const value = await live()
    usePlatform('linux')
    io.count.mockReturnValue(countResult(status, stdout))
    const result = await value.cleanup()
    expect(result.profileRemoved).toBe(deleted)
    expect(result.remainingProcesses).toBe(deleted ? 0 : null)
    expect(result.errors.length).toBe(deleted ? 0 : 1)
    expect(io.count.mock.calls[0][0]).toBe('pgrep')
  })

  it('passes a Windows backslash/space/apostrophe path literally and uses the same absolute path throughout', async () => {
    const windowsProfile = String.raw`C:\unit fixtures\someone's [cache]\cf-navs-chrome-profile-restart`
    // Keep this Windows-specific fixture meaningful when Vitest runs on Unix CI too.
    const resolve = path.resolve.bind(path)
    const basename = path.basename.bind(path)
    vi.spyOn(path, 'resolve').mockImplementation((...parts) =>
      parts.length === 1 && parts[0] === windowsProfile ? windowsProfile : resolve(...parts))
    vi.spyOn(path, 'basename').mockImplementation((input, suffix) =>
      input === windowsProfile ? 'cf-navs-chrome-profile-restart' : basename(input, suffix))
    const value = await live({ userDataDir: windowsProfile })
    const result = await value.restart()
    expect(result.previous).toMatchObject({ profile: windowsProfile, remainingProcesses: 1 })
    expect(result.current.profile).toBe(windowsProfile)
    for (const [, args] of io.spawn.mock.calls) expect(args).toContain(`--user-data-dir=${windowsProfile}`)
    for (const [, args] of io.count.mock.calls) {
      const literalLine = args.at(-1).split('\n').find((line: string) => line.startsWith('$profileDir = '))
      expect(literalLine).toBe(`$profileDir = '${windowsProfile.replaceAll("'", "''")}'`)
      expect(literalLine.slice("$profileDir = '".length, -1).replaceAll("''", "'")).toBe(windowsProfile)
    }
    expect(io.stat).toHaveBeenCalledWith(windowsProfile)
    await value.cleanup()
    expect(io.rm).toHaveBeenCalledExactlyOnceWith(windowsProfile, { recursive: true, force: true, maxRetries: 3 })
  })

  it.each(['win32', 'linux'])('matches exact profile arguments, not sibling paths or regex wildcards (%s)', async platformName => {
    const tricky = path.resolve("unit-fixtures space's [x]", 'cf-navs-chrome-profile-restart')
    const value = await live({ userDataDir: tricky })
    usePlatform(platformName)
    io.count.mockReturnValue(platformName === 'win32' ? countResult() : countResult(1, ''))
    await value.cleanup()
    const [command, args, options] = io.count.mock.calls[0]
    let pattern: string
    if (platformName === 'win32') {
      expect(command).toBe('powershell.exe')
      const script = args.at(-1)
      expect(script).toContain('-ErrorAction Stop')
      expect(script).toContain("$ErrorActionPreference = 'Stop'")
      const literal = script.match(/^\$profileDir = '(.*)'$/m)[1].replaceAll("''", "'")
      // This is the actual argument passed to PowerShell, not a second hand-written query.
      expect(literal).toBe(tricky)
      expect(literal).toBe(io.spawn.mock.calls[0][1].find((arg: string) => arg.startsWith('--user-data-dir=')).slice('--user-data-dir='.length))
      const escaped = literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const expression = script.match(/^\$profileArgument = (.*)$/m)[1]
      pattern = expression.split(' + $escapedProfile + ').map((part: string) => {
        expect(part.startsWith("'") && part.endsWith("'")).toBe(true)
        return part.slice(1, -1).replaceAll("''", "'")
      }).join(escaped)
    } else {
      pattern = args.at(-1).replaceAll('[[:space:]]', '\\s')
    }
    const match = new RegExp(pattern)
    expect(match.test(`chrome --user-data-dir=${tricky} --headless`)).toBe(true)
    expect(match.test(`chrome "--user-data-dir=${tricky}" --headless`)).toBe(true)
    expect(match.test(`chrome --user-data-dir="${tricky}" --headless`)).toBe(true)
    expect(match.test(`chrome --user-data-dir=${tricky}-other --headless`)).toBe(false)
    expect(match.test(`chrome --user-data-dir=${tricky}/child --headless`)).toBe(false)
    expect(match.test(`chrome --other=${tricky} --headless`)).toBe(false)
    expect(match.test(`chrome --user-data-dir=${tricky.replace('[x]', 'x')} --headless`)).toBe(false)
    expect(options).toMatchObject({ timeout: 10000, windowsHide: true })
  })
})

describe('CdpSession restart lifecycle', () => {
  it.each([
    ['reused browser', (value: any) => { value.startedByTest = false }],
    ['reuse allowed', (value: any) => { value.allowExisting = true }],
    ['missing socket', (value: any) => { value.ws = null }],
    ['closed socket', (value: any) => { value.ws.readyState = 3 }],
    ['unowned target', (value: any) => { value.createdTarget = false }],
    ['missing target', (value: any) => { value.targetId = null }],
    ['missing session', (value: any) => { value.sessionId = null }],
    ['missing process', (value: any) => { value.chromeProcess = null }],
  ])('refuses %s before any shutdown/start side effect', async (_label, change) => {
    const value = await live()
    change(value)
    const error = await restartError(value)
    expect(error.restartEvidence.closed).toBeNull()
    expect(trace).toEqual([])
    expect(io.spawn).toHaveBeenCalledTimes(1)
    expect(io.count).not.toHaveBeenCalled()
    expect(io.rm).not.toHaveBeenCalled()
  })

  it.each([
    ['zero', countResult(), 0],
    ['empty', countResult(0, ''), null],
    ['failed', countResult(1, '0'), null],
  ])('rejects a %s before-close probe without closing anything or calling start', async (_label, probe, expectedCount) => {
    const value = await live()
    io.count.mockReturnValue(probe)
    const error = await restartError(value)
    expect(error.restartEvidence.previous.remainingProcesses).toBe(expectedCount)
    expect(error.restartEvidence.closed).toBeNull()
    expect(value.ws).toBe(sockets[0])
    expect(trace).toEqual([])
    expect(io.spawn).toHaveBeenCalledTimes(1)
    expect(io.rm).not.toHaveBeenCalled()
    expect(io.stat).not.toHaveBeenCalled()
    expect(sockets[0].close).not.toHaveBeenCalled()
  })

  it('blocks restart if counting fails after a positive before-close probe', async () => {
    const value = await live()
    io.count.mockReturnValueOnce(countResult(0, '3')).mockReturnValue(countResult(0, ''))
    const error = await restartError(value)
    expect(error.restartEvidence.previous.remainingProcesses).toBe(3)
    expect(error.restartEvidence.closed).toMatchObject({ remainingProcesses: null, profileRemoved: false, profilePreserved: false })
    expect(io.spawn).toHaveBeenCalledTimes(1)
    expect(io.rm).not.toHaveBeenCalled()
  })

  it.each(['Target.closeTarget', 'Browser.close'])('does not restart when %s fails', async method => {
    const value = await live()
    replies.set(method, { error: { message: 'close rejected', code: -1 } })
    // A CDP close can fail even if the process subsequently exits; the error still blocks restart.
    io.count.mockReturnValueOnce(countResult(0, '1')).mockReturnValue(countResult())
    const error = await restartError(value)
    expect(error.restartEvidence.closed.errors).toEqual([expect.stringContaining('close rejected')])
    expect(io.spawn).toHaveBeenCalledTimes(1)
    expect(io.rm).not.toHaveBeenCalled()
    expect(value.chromeProcess).toBe(processes[0])
  })

  it('times out an unanswered browser close without restarting or leaving pending timers', async () => {
    const value = await live()
    replies.set('Browser.close', 'hold')
    const operation = restartError(value)
    await vi.runAllTimersAsync()
    const error = await operation
    expect(error.restartEvidence.closed.errors).toContainEqual(expect.stringContaining('CDP timeout: Browser.close'))
    expect(value.pending.size).toBe(0)
    expect(io.spawn).toHaveBeenCalledTimes(1)
    expect(io.rm).not.toHaveBeenCalled()
  })

  it('rejects an unconfirmed target closure (success:false)', async () => {
    const value = await live()
    replies.set('Target.closeTarget', { result: { success: false } })
    const error = await restartError(value)
    expect(error.restartEvidence.closed.targetClosed).toBe(false)
    expect(io.spawn).toHaveBeenCalledTimes(1)
  })

  it('rejects socket close failures and does not start another browser', async () => {
    const value = await live()
    sockets[0].close.mockImplementation(() => { throw new Error('close failed') })
    const error = await restartError(value)
    expect(error.restartEvidence.closed.errors).toContain('CDP socket close failed')
    expect(value.ws).toBeNull()
    expect(io.spawn).toHaveBeenCalledTimes(1)
  })

  it.each(['missing', 'file'])('rejects restart if the preserved profile is %s', async kind => {
    const value = await live()
    if (kind === 'missing') io.stat.mockRejectedValue(new Error('ENOENT'))
    else io.stat.mockResolvedValue({ isDirectory: () => false })
    const error = await restartError(value)
    expect(error.restartEvidence.closed).toMatchObject({ profilePreserved: false, remainingProcesses: 0 })
    expect(error.restartEvidence.closed.errors).toContain('preserveProfile: test profile directory could not be confirmed')
    expect(io.spawn).toHaveBeenCalledTimes(1)
    expect(io.rm).not.toHaveBeenCalled()
  })

  it('closes, checks, preserves, resets ownership, starts and attaches in order using the same profile', async () => {
    const value = await live()
    const realStart = value.start.bind(value)
    const start = vi.spyOn(value, 'start').mockImplementation(async () => {
      expect(value).toMatchObject({ ws: null, sessionId: null, targetId: null, createdTarget: false, chromeProcess: null, startedByTest: false, browserWsUrl: null })
      expect(value.pending.size).toBe(0)
      await realStart()
    })
    const result = await value.restart()
    expect(result).toEqual({
      previous: { pid: 100, targetId: 'target-1', profile, remainingProcesses: 1 },
      closed: { startedByTest: true, targetClosed: true, browserClosed: true, profileRemoved: false, profilePreserved: true, remainingProcesses: 0, errors: [], warnings: [] },
      current: { pid: 101, targetId: 'target-2', profile }, sameProfile: true,
    })
    expect(start).toHaveBeenCalledOnce()
    expect(trace).toEqual(['count', 'Target.closeTarget', 'Browser.close', 'socket-close', 'count', 'check-profile', 'mkdir', 'spawn', 'Target.createTarget', 'Target.attachToTarget', 'Page.enable', 'Runtime.enable', 'Network.enable', 'Log.enable'])
    for (const [, args] of io.spawn.mock.calls) expect(args).toContain(`--user-data-dir=${profile}`)
    expect(io.rm).not.toHaveBeenCalled()
    expect(await value.cleanup()).toMatchObject({ profileRemoved: true, errors: [] })
    expect(sockets[1].commands.find(command => command.method === 'Target.closeTarget')?.params).toEqual({ targetId: 'target-2' })
  })

  it('preserves listener identity, evidence arrays and global IDs while rejecting old pending and stale messages', async () => {
    const value = await live()
    const old = sockets[0]
    const handler = vi.fn()
    value.on('Runtime.bindingCalled', handler)
    const listeners = value.listeners
    const evidence = [value.consoleErrors, value.pageExceptions, value.failedRequests, value.responses]
    event(old, 'Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'before' }] })
    event(old, 'Runtime.exceptionThrown', { exceptionDetails: { text: 'before' } })
    event(old, 'Network.loadingFailed', { requestId: 'before' })
    event(old, 'Network.responseReceived', { requestId: 'before', response: { status: 200 } })
    replies.set('Runtime.evaluate', 'hold')
    const oldId = value.nextId
    const pending = value.send('Runtime.evaluate').catch(error => error)
    await value.restart()
    expect((await pending).message).toContain('cleaned up')
    expect(value.pending.size).toBe(0)
    expect(value.nextId).toBeGreaterThan(oldId)
    expect(value.listeners).toBe(listeners)
    expect(value.listeners.get('Runtime.bindingCalled')).toEqual([handler])
    evidence.forEach((array, index) => {
      expect([value.consoleErrors, value.pageExceptions, value.failedRequests, value.responses][index]).toBe(array)
      expect(array).toHaveLength(1)
    })
    event(old, 'Runtime.consoleAPICalled', { type: 'error', args: [{ value: 'stale' }] })
    event(old, 'Runtime.bindingCalled')
    event(sockets[1], 'Runtime.bindingCalled')
    expect(value.consoleErrors).toHaveLength(1)
    expect(handler).toHaveBeenCalledTimes(1)
    const nextId = value.nextId
    const next = value.send('Runtime.evaluate')
    old.emit('message', Buffer.from(JSON.stringify({ id: nextId, result: { stale: true } })))
    old.emit('close')
    expect(value.pending.has(nextId)).toBe(true)
    expect(value.ws).toBe(sockets[1])
    sockets[1].emit('message', Buffer.from(JSON.stringify({ id: nextId, result: { fresh: true } })))
    expect(await next).toEqual({ fresh: true })
    await value.cleanup()
  })

  it('rejects concurrent restart attempts without starting a third browser', async () => {
    const value = await live()
    const first = value.restart()
    const second = await restartError(value)
    expect(second.restartEvidence.closed).toBeNull()
    expect((await first).current.pid).toBe(101)
    expect(io.spawn).toHaveBeenCalledTimes(2)
    await value.cleanup()
  })

  it('retains no old ownership when start fails before spawn, leaving the preserved profile untouched', async () => {
    const value = await live()
    io.exists.mockReturnValue(false)
    const error = await restartError(value)
    expect(error.restartEvidence).toMatchObject({ closed: { profilePreserved: true }, current: { pid: null, targetId: null, profile } })
    expect(value.startedByTest).toBe(false)
    expect(await value.cleanup()).toMatchObject({ profileRemoved: false, errors: [] })
    expect(io.rm).not.toHaveBeenCalled()
  })

  it('keeps ownership on a subprocess startup error so finally can remove the new process profile', async () => {
    const value = await live()
    const spawn = io.spawn.getMockImplementation()!
    io.spawn.mockImplementation((...args) => {
      const child = spawn(...args)
      queueMicrotask(() => { child.exitCode = 1; child.emit('error', new Error('spawn failed')); portReady = false })
      return child
    })
    const error = await restartError(value)
    expect(error.restartEvidence.current).toEqual({ pid: 101, targetId: null, profile })
    expect(value.startedByTest).toBe(true)
    expect(value.chromeProcess).toBe(processes[1])
    expect(await value.cleanup()).toMatchObject({ remainingProcesses: 0, profileRemoved: true })
    expect(processes[1].unref).toHaveBeenCalledOnce()
  })

  it.each(['Target.createTarget', 'Target.attachToTarget', 'Runtime.enable'])('retains new ownership on %s failure for final cleanup', async method => {
    const value = await live()
    replies.set(method, { error: { message: 'attach failed', code: -1 } })
    const error = await restartError(value)
    expect(error.restartEvidence.current).toEqual({ pid: 101, targetId: method === 'Target.createTarget' ? null : 'target-2', profile })
    expect(value.chromeProcess).toBe(processes[1])
    replies.delete(method)
    expect(await value.cleanup()).toMatchObject({ browserClosed: true, profileRemoved: true, remainingProcesses: 0, errors: [] })
    const closed = sockets[1].commands.filter(command => command.method === 'Target.closeTarget')
    expect(closed.map(command => command.params.targetId)).toEqual(method === 'Target.createTarget' ? [] : ['target-2'])
  })

  it('cleans up the new browser if attach discovery fails, using only the endpoint recorded during start', async () => {
    const value = await live()
    const http = io.http.getMockImplementation()!
    let calls = 0
    io.http.mockImplementation((...args) => {
      calls += 1
      if (calls !== 3) return http(...args)
      const request = Object.assign(new EventEmitter(), { setTimeout: vi.fn(), destroy: vi.fn() })
      queueMicrotask(() => request.emit('error', new Error('attach discovery failed')))
      return request
    })
    const error = await restartError(value)
    expect(error.restartEvidence.current).toEqual({ pid: 101, targetId: null, profile })
    const ownedEndpoint = value.browserWsUrl
    expect(await value.cleanup()).toMatchObject({ browserClosed: true, profileRemoved: true, errors: [] })
    expect(calls).toBe(3)
    expect(sockets[1].url).toBe(ownedEndpoint)
    expect(sockets[1].commands.map(command => command.method)).toEqual(['Browser.close'])
  })

  it('keeps diagnostics/profile when the owned endpoint cannot be recovered and processes remain', async () => {
    const value = await live()
    socketFailure = true
    await restartError(value)
    socketFailure = true
    io.count.mockReturnValue(countResult(0, '1'))
    const httpCalls = io.http.mock.calls.length
    const operation = value.cleanup()
    await vi.runAllTimersAsync()
    const result = await operation
    expect(result).toMatchObject({ browserClosed: false, remainingProcesses: 1, profileRemoved: false })
    expect(result.errors).toContain('Browser.close: owned browser connection unavailable')
    expect(io.http.mock.calls).toHaveLength(httpCalls)
    expect(io.rm).not.toHaveBeenCalled()
  })

  it('reconnects only the recorded owned browser endpoint after socket attach failure, without creating a target', async () => {
    const value = await live()
    socketFailure = true
    const error = await restartError(value)
    expect(error.restartEvidence.current).toMatchObject({ pid: 101, targetId: null })
    const ownedEndpoint = value.browserWsUrl
    const httpCalls = io.http.mock.calls.length
    expect(await value.cleanup()).toMatchObject({ browserClosed: true, profileRemoved: true, errors: [] })
    expect(sockets[2].url).toBe(ownedEndpoint)
    expect(io.http.mock.calls).toHaveLength(httpCalls)
    expect(sockets[2].commands.map(command => command.method)).toEqual(['Browser.close'])
  })

  it('times out a connecting socket, ignores its late open, and leaves the new process recoverable', async () => {
    const value = await live()
    const makeSocket = io.socket.getMockImplementation()!
    io.socket.mockImplementationOnce((url) => {
      const socket = makeSocket(url)
      const emit = socket.emit.bind(socket)
      socket.emit = (eventName: string, ...args: unknown[]) => eventName === 'open' ? false : emit(eventName, ...args)
      return socket
    })
    const operation = restartError(value)
    await vi.runAllTimersAsync()
    expect((await operation).restartEvidence.current).toMatchObject({ pid: 101, targetId: null })
    expect(value.ws).toBeNull()
    EventEmitter.prototype.emit.call(sockets[1], 'open')
    expect(value.ws).toBeNull()
    expect(await value.cleanup()).toMatchObject({ browserClosed: true, profileRemoved: true, errors: [] })
  })

  it('rejects and clears pending timers on spontaneous socket closure and send failure', async () => {
    const value = await live()
    replies.set('Runtime.evaluate', 'hold')
    const operation = value.send('Runtime.evaluate').catch(error => error)
    sockets[0].emit('close')
    expect((await operation).message).toContain('socket closed')
    expect(value.pending.size).toBe(0)
    await value.attach()
    sockets[1].send.mockImplementation(() => { throw new Error('send failed') })
    await expect(value.send('Runtime.evaluate')).rejects.toThrow('send failed')
    expect(value.pending.size).toBe(0)
    sockets[1].close()
  })
})
