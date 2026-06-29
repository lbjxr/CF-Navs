import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const publicConfig = path.join(rootDir, 'wrangler.toml')
const localConfig = path.join(rootDir, 'wrangler.local.toml')
const wranglerBin = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
  })

  if (result.status !== 0) {
    const message = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
    throw new Error(message || `wrangler ${args.join(' ')} failed`)
  }

  return result.stdout.trim()
}

function parseJsonOutput(output, label) {
  try {
    return JSON.parse(output)
  } catch {
    throw new Error(`Unable to parse ${label} output from Wrangler.`)
  }
}

function findD1Id(databases) {
  const match = databases.find((item) => item?.name === 'cf-navs-db' || item?.database_name === 'cf-navs-db')
  return match?.uuid ?? match?.id ?? match?.database_id ?? ''
}

function findKvId(namespaces) {
  const match = namespaces.find((item) => item?.title === 'SESSION' || item?.binding === 'SESSION' || item?.name === 'SESSION')
  return match?.id ?? ''
}

const d1Output = runWrangler(['d1', 'list', '--json'])
const kvOutput = runWrangler(['kv', 'namespace', 'list'])
const d1Id = findD1Id(parseJsonOutput(d1Output, 'D1 database list'))
const kvId = findKvId(parseJsonOutput(kvOutput, 'KV namespace list'))

if (!d1Id) {
  throw new Error('Could not find a D1 database named cf-navs-db in the current Cloudflare account.')
}

if (!kvId) {
  throw new Error('Could not find a KV namespace named SESSION in the current Cloudflare account.')
}

const config = readFileSync(publicConfig, 'utf8')
  .replace('replace-with-your-d1-database-id', d1Id)
  .replace('replace-with-your-kv-namespace-id', kvId)

writeFileSync(localConfig, config, 'utf8')
console.log('Created wrangler.local.toml with Cloudflare resource IDs from your current Wrangler account.')
console.log('This file is ignored by Git and will be used automatically by npm run deploy/dev/db:init.')
