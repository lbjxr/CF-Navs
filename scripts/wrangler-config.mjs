import { existsSync, readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const localConfig = path.join(rootDir, 'wrangler.local.toml')
const publicConfig = path.join(rootDir, 'wrangler.toml')
const configPath = existsSync(localConfig) ? localConfig : publicConfig

const configText = readFileSync(configPath, 'utf8')
const hasPlaceholder =
  configText.includes('replace-with-your-d1-database-id') ||
  configText.includes('replace-with-your-kv-namespace-id')

if (hasPlaceholder) {
  const relativeConfig = path.relative(rootDir, configPath)
  console.error(
    [
      `Wrangler config ${relativeConfig} still contains placeholder Cloudflare resource IDs.`,
      'Create wrangler.local.toml with your real D1 database_id and KV namespace id, then run this command again.',
      'wrangler.local.toml is ignored by Git and is safe for local/private deployment config.',
    ].join('\n'),
  )
  process.exit(1)
}

const wranglerBin = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const userArgs = process.argv.slice(2)
const shouldAttachConfig = !userArgs.includes('--version') && !userArgs.includes('-v')
const args = shouldAttachConfig ? [...userArgs, '--config', configPath] : userArgs
const child = spawn(process.execPath, [wranglerBin, ...args], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: false,
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
