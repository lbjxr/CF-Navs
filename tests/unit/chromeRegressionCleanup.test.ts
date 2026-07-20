import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Chrome regression cleanup', () => {
  it('requires explicit opt-in before attaching to an existing Chrome', () => {
    const source = readFileSync('scripts/chrome-regression.mjs', 'utf8')

    expect(source).toContain("const ALLOW_EXISTING_CHROME = process.env.REGRESSION_ALLOW_EXISTING_CHROME === '1'")
    expect(source).toContain('This regression script starts an isolated browser by default')
    expect(source).toContain('ALLOW_EXISTING_CHROME && !FORCE_TEMP_CHROME')
    expect(source).toContain('ALLOW_EXISTING_CHROME ? await readDevToolsActivePort() : null')
    expect(source).toContain('dedicated-existing-browser')
    expect(source).not.toContain('const activeTarget = FORCE_TEMP_CHROME ? null : await readDevToolsActivePort()')
    expect(source).not.toContain('Google\\Chrome\\User Data\\DevToolsActivePort')
    expect(source).toContain("const candidates = [process.env.CHROME_DEVTOOLS_ACTIVE_PORT_FILE].filter(Boolean)")
  })

  it('gates browser shutdown and process cleanup to browsers started by the test', () => {
    const source = readFileSync('scripts/chrome-regression.mjs', 'utf8')

    expect(source).toContain("await sendBrowserCommand('Target.closeTarget'")
    expect(source).toContain("await send('Page.close'")
    expect(source).toMatch(/if \(browserStartedByTest\) \{\s*try \{\s*await send\('Browser\.close'/s)
    expect(source).toContain('CF_NAVS_TEST_CHROME_PROFILE')
    expect(source).toContain('Refusing to start temporary Chrome with an unsafe profile path')
    expect(source).toContain('Temporary Chrome cleanup failed')
    expect(source).toContain('REGRESSION_CLEAR_ORIGIN_DATA is only allowed for an isolated browser started by this regression run')
    expect(source).toContain("await mkdir(CHROME_USER_DATA_DIR)")
    expect(source).toContain("'--remote-debugging-port=0'")
    expect(source).not.toContain('.Contains($profile')
    expect(source).not.toContain('startedChrome')
    expect(source).not.toContain('chromeProcess')
    expect(source).not.toContain('taskkill /IM chrome.exe')
    expect(source).not.toContain('Stop-Process -Name chrome')
  })

  it('keeps the performance audit scoped to its dedicated test tab', () => {
    const source = readFileSync('scripts/perf-audit.mjs', 'utf8')

    expect(source).toContain('pageTargetCreatedByTest = true')
    expect(source).toContain("await send('Page.close'")
    expect(source).toContain('/json/close/${pageTargetId}')
    expect(source).not.toContain('/json/list')
    expect(source).not.toContain("send('Browser.close'")
    expect(source).not.toContain('Stop-Process')
  })
})
