import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const importLoader = `import('./scripts/lib/verifyTarget.mjs').then(({ resolveBaseUrl }) => console.log(resolveBaseUrl()))`

function runLoader(baseUrl: string) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', importLoader], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, BASE_URL: baseUrl },
  })
}

describe('verification target configuration', () => {
  it('prefers BASE_URL and strips trailing slashes', () => {
    const result = runLoader('https://verify.example.test///')

    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('https://verify.example.test')
  })

  it('rejects invalid target URLs before running an audit', () => {
    const result = runLoader('not-a-url')

    expect(result.status).toBe(2)
    expect(result.stderr).toContain('Invalid target origin: not-a-url')
  })
})
