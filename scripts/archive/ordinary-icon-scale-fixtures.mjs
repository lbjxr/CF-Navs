// Local-only ordinary object-icon scale fixtures for IP-P1 (docs/plans/ICON_REQUEST_PERFORMANCE_*).
//
// Boots an isolated wrangler dev Worker on a free port backed by a dedicated, disposable local D1
// (.wrangler/state-iconscale-<id>), installs the schema + a random in-process administrator, logs
// in, then seeds one or more repeatable scale tiers (report150 / home355 / aggregate583) through
// POST /api/import. Each tier is a replace import, so tiers are seeded one at a time; the three
// tier payloads are deterministic (scripts/lib/scaleFixturePlan.mjs). It verifies every seeded tier
// against GET /api/data (admin) and GET /api/public/data (anonymous), then tears the Worker down and
// deletes the owned state directory.
//
// This tool is strictly local and read-only toward any real site: it never contacts a production
// host and never performs git operations. It does NOT change product source, perf-audit.mjs or
// smoke-local.mjs; it reuses their isolation pattern (dedicated state dir, random credentials,
// --var bootstrap, auto port, exact teardown).
//
// Usage:
//   node scripts/ordinary-icon-scale-fixtures.mjs                 # seed + verify all three tiers
//   node scripts/ordinary-icon-scale-fixtures.mjs --tier report150
//   node scripts/ordinary-icon-scale-fixtures.mjs --tier report150 --tier home355
//
// Env (all optional):
//   ICONSCALE_PORT             fixed port, default auto free port
//   ICONSCALE_PERSIST_TO       state dir, default unique .wrangler/state-iconscale-<id>
//   ICONSCALE_READY_TIMEOUT    seconds to wait for /api/health, default 120
//   ICONSCALE_WRANGLER_CONFIG  wrangler config, default wrangler.local.toml then wrangler.toml
//   ICONSCALE_REPORT           report JSON path, default <tmp>/ordinary-icon-scale-fixtures-<id>.json

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { TIER_NAMES, buildTier, computeColdHomeMount, publicCategoryIdSet } from './lib/scaleFixturePlan.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wranglerBin = path.join(rootDir, 'node_modules', 'wrangler', 'bin', 'wrangler.js')
const localConfig = path.join(rootDir, 'wrangler.local.toml')
const publicConfig = path.join(rootDir, 'wrangler.toml')
const configPath =
  process.env.ICONSCALE_WRANGLER_CONFIG || (existsSync(localConfig) ? localConfig : publicConfig)
const persistParent = path.join(rootDir, '.wrangler')
const persistTo = path.resolve(process.env.ICONSCALE_PERSIST_TO || path.join(persistParent, 'state-iconscale-' + randomBytes(6).toString('hex')))
const readyTimeoutMs = Number.parseInt(process.env.ICONSCALE_READY_TIMEOUT || '120', 10) * 1000
const reportPath = process.env.ICONSCALE_REPORT || path.join(os.tmpdir(), 'ordinary-icon-scale-fixtures-' + randomBytes(4).toString('hex') + '.json')

// Random, in-process-only administrator credentials. Password must be >= 12 chars for /api/install.
const ADMIN_USER = 'admin'
const ADMIN_PASS = `iconscale-${randomBytes(18).toString('base64url')}`
const SETUP_TOKEN = `iconscale-setup-${randomBytes(18).toString('base64url')}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function parseTiers() {
  const args = process.argv.slice(2)
  const tiers = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--tier' && args[index + 1]) {
      tiers.push(args[index + 1])
      index += 1
    }
  }
  const selected = tiers.length > 0 ? tiers : [...TIER_NAMES]
  const unknown = selected.filter((name) => !TIER_NAMES.includes(name))
  if (unknown.length > 0) throw new Error(`unknown tier(s): ${unknown.join(', ')}; valid: ${TIER_NAMES.join(', ')}`)
  return selected
}

function verifyOwnedPersistPath() {
  mkdirSync(persistParent, { recursive: true })
  if (lstatSync(persistParent).isSymbolicLink() || realpathSync(persistParent).toLowerCase() !== path.resolve(persistParent).toLowerCase() ||
      path.dirname(persistTo).toLowerCase() !== persistParent.toLowerCase() || !/^state-iconscale(?:-[a-z0-9]+)*$/i.test(path.basename(persistTo))) {
    throw new Error('iconscale state must be a dedicated state-iconscale-* child of the workspace .wrangler directory')
  }
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function runWrangler(args, label) {
  const result = spawnSync(process.execPath, [wranglerBin, ...args, '--config', configPath], {
    cwd: rootDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
}

// End the whole process tree. wrangler spawns workerd; killing only the parent orphans the port
// holder. Kills by exact PID tree, never by process name.
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
}

async function waitForHealth(baseUrl, child) {
  const deadline = Date.now() + readyTimeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`wrangler dev exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(2000) })
      if (response.ok) {
        const body = await response.json()
        if (body?.data?.status === 'ok') return
      }
    } catch {
      // not ready yet
    }
    await sleep(300)
  }
  throw new Error(`local worker was not ready within ${readyTimeoutMs / 1000}s`)
}

async function apiFetch(baseUrl, route, { method = 'GET', body, token, headers } = {}) {
  const response = await fetch(baseUrl + route, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  })
  const text = await response.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return { status: response.status, ok: response.ok, json, text }
}

// Schema is initialized out-of-band via `wrangler d1 execute --file=./schema.sql` (the sanctioned
// smoke-local pattern). The administrator + session come from /api/login's INIT_ADMIN bootstrap,
// which is exactly how scripts/smoke-test.mjs bootstraps a fresh local instance.
//
// /api/install is attempted first for task fidelity and so this keeps working if the installer is
// fixed, but the shipped worker/lib/installSchema.ts splitSqlStatements does NOT keep
// `CREATE TRIGGER ... BEGIN ... END;` blocks whole, so initializeSchema's batch currently fails
// (code 1500) against the trigger-bearing schema.sql. That is a pre-existing product bug this tool
// must not fix; its result is recorded, not treated as fatal.
async function attemptInstall(baseUrl) {
  const result = await apiFetch(baseUrl, '/api/install', {
    method: 'POST',
    headers: { 'X-Setup-Token': SETUP_TOKEN },
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  })
  return {
    attempted: true,
    ok: result.ok && result.json?.code === 0,
    status: result.status,
    code: result.json?.code ?? null,
    message: result.json?.message ?? result.text.slice(0, 160),
    token: result.json?.data?.token ?? null,
  }
}

async function login(baseUrl) {
  const result = await apiFetch(baseUrl, '/api/login', {
    method: 'POST',
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  })
  const token = result.json?.data?.token
  if (!result.ok || result.json?.code !== 0 || !token) {
    throw new Error(`login failed: status=${result.status} code=${result.json?.code} message=${result.json?.message ?? result.text.slice(0, 120)}`)
  }
  return token
}

async function bootstrapAdmin(baseUrl) {
  const install = await attemptInstall(baseUrl)
  if (install.ok && install.token) {
    return { token: install.token, install, path: 'install' }
  }
  // Fall back to the sanctioned INIT_ADMIN bootstrap via /api/login (schema already initialized).
  const token = await login(baseUrl)
  return { token, install, path: 'login-bootstrap' }
}

async function seedTier(baseUrl, token, tier) {
  const result = await apiFetch(baseUrl, '/api/import', {
    method: 'POST',
    token,
    body: { mode: 'replace', categories: tier.categories, bookmarks: tier.bookmarks, settings: { public_mode: true } },
  })
  if (!result.ok || result.json?.code !== 0) {
    throw new Error(`import failed for ${tier.name}: status=${result.status} code=${result.json?.code} message=${result.json?.message ?? result.text.slice(0, 120)}`)
  }
  return result.json.data
}

async function verifyTier(baseUrl, token, tier) {
  const admin = await apiFetch(baseUrl, '/api/admin/data', { token })
  if (!admin.ok || admin.json?.code !== 0) {
    throw new Error(`admin /api/admin/data failed for ${tier.name}: status=${admin.status} code=${admin.json?.code}`)
  }
  const adminCategories = admin.json.data.categories ?? []
  const adminBookmarks = admin.json.data.bookmarks ?? []

  const pub = await apiFetch(baseUrl, '/api/public/data', {})
  if (!pub.ok || pub.json?.code !== 0) {
    throw new Error(`anonymous /api/public/data failed for ${tier.name}: status=${pub.status} code=${pub.json?.code}`)
  }
  const publicCategories = pub.json.data.categories ?? []
  const publicBookmarks = pub.json.data.bookmarks ?? []

  const objectIconMeasured = adminBookmarks.filter((bookmark) => bookmark.icon_cached === 1 || bookmark.icon_cached === true).length
  const visibleIds = publicCategoryIdSet(adminCategories)

  const measured = {
    adminTotalBookmarks: adminBookmarks.length,
    adminTotalCategories: adminCategories.length,
    publicBookmarks: publicBookmarks.length,
    privateBookmarks: adminBookmarks.filter((bookmark) => bookmark.is_private === 1 || bookmark.is_private === true).length,
    objectIconBookmarks: objectIconMeasured,
    inlineIconBookmarks: adminBookmarks.length - objectIconMeasured,
    objectIconRatio: adminBookmarks.length ? Number((objectIconMeasured / adminBookmarks.length).toFixed(4)) : 0,
    coldHomeMountAdmin: computeColdHomeMount(adminCategories, adminBookmarks),
    coldHomeMountPublic: computeColdHomeMount(publicCategories, publicBookmarks),
  }

  // Cross-check that no stray private bookmark leaked into the anonymous payload.
  const privateLeakInPublic = publicBookmarks.filter((bookmark) => !visibleIds.has(bookmark.category_id) || bookmark.is_private === 1 || bookmark.is_private === true).length

  const mismatches = []
  for (const key of Object.keys(tier.expected)) {
    if (measured[key] !== tier.expected[key]) {
      mismatches.push({ field: key, expected: tier.expected[key], measured: measured[key] })
    }
  }
  if (privateLeakInPublic !== 0) {
    mismatches.push({ field: 'privateLeakInPublic', expected: 0, measured: privateLeakInPublic })
  }

  return { expected: tier.expected, measured, mismatches, passed: mismatches.length === 0 }
}

async function main() {
  const selectedTiers = parseTiers()
  const report = {
    tool: 'ordinary-icon-scale-fixtures',
    startedAt: new Date().toISOString(),
    config: path.basename(configPath),
    stateDir: path.relative(rootDir, persistTo),
    adminUser: ADMIN_USER,
    requestedTiers: selectedTiers,
    port: null,
    baseUrl: null,
    startupCommand: null,
    bootstrap: null,
    tiers: [],
    cleanup: { wranglerKilled: false, stateRemoved: false, errors: [] },
    errors: [],
    passed: false,
  }

  if (!existsSync(path.join(rootDir, 'dist', 'index.html'))) {
    throw new Error('dist/index.html is missing; run "npm run build" first (the ASSETS binding serves ./dist)')
  }

  verifyOwnedPersistPath()
  if (existsSync(persistTo)) {
    throw new Error('Refusing to reuse a pre-existing iconscale state directory; choose a fresh ICONSCALE_PERSIST_TO')
  }
  runWrangler(['d1', 'execute', 'DB', '--local', '--file=./schema.sql', '--persist-to', persistTo], 'db:init')

  const port = process.env.ICONSCALE_PORT || String(await findFreePort())
  const baseUrl = `http://127.0.0.1:${port}`
  report.port = Number(port)
  report.baseUrl = baseUrl
  report.startupCommand = [
    'node', 'node_modules/wrangler/bin/wrangler.js', 'dev',
    '--config', path.basename(configPath),
    '--ip', '127.0.0.1', '--port', String(port),
    '--persist-to', report.stateDir,
    '--var', 'INIT_ADMIN_USER:admin',
    '--var', 'INIT_ADMIN_PASSWORD:<random>',
    '--var', 'SETUP_TOKEN:<random>',
  ].join(' ')

  const child = spawn(
    process.execPath,
    [
      wranglerBin, 'dev',
      '--config', configPath,
      '--ip', '127.0.0.1',
      '--port', port,
      '--persist-to', persistTo,
      '--var', `INIT_ADMIN_USER:${ADMIN_USER}`,
      '--var', `INIT_ADMIN_PASSWORD:${ADMIN_PASS}`,
      '--var', `SETUP_TOKEN:${SETUP_TOKEN}`,
    ],
    { cwd: rootDir, stdio: ['ignore', 'ignore', 'inherit'], detached: process.platform !== 'win32' },
  )

  try {
    await waitForHealth(baseUrl, child)
    const bootstrap = await bootstrapAdmin(baseUrl)
    const token = bootstrap.token
    report.bootstrap = {
      path: bootstrap.path,
      install: bootstrap.install,
      adminDataEndpoint: '/api/admin/data',
      note: bootstrap.path === 'login-bootstrap'
        ? '/api/install failed (pre-existing worker/lib/installSchema.ts trigger-splitting bug); schema initialized by wrangler d1 execute and admin bootstrapped via /api/login INIT_ADMIN, matching scripts/smoke-test.mjs.'
        : 'admin created via /api/install.',
    }

    for (const name of selectedTiers) {
      const tier = buildTier(name)
      const importResp = await seedTier(baseUrl, token, tier)
      const verification = await verifyTier(baseUrl, token, tier)
      report.tiers.push({
        name: tier.name,
        note: tier.note,
        importResp: { categories: importResp?.categories ?? null, bookmarks: importResp?.bookmarks ?? null },
        ...verification,
      })
    }
    report.passed = report.tiers.length > 0 && report.tiers.every((tier) => tier.passed)
  } catch (error) {
    report.errors.push(String(error?.stack ?? error))
    report.passed = false
  } finally {
    killTree(child)
    for (let attempt = 0; attempt < 40 && child.exitCode === null && child.signalCode === null; attempt += 1) {
      await sleep(100)
    }
    report.cleanup.wranglerKilled = child.exitCode !== null || child.signalCode !== null
    if (!report.cleanup.wranglerKilled) {
      report.cleanup.errors.push('wrangler child did not exit after kill signal')
    }
    try {
      verifyOwnedPersistPath()
      rmSync(persistTo, { recursive: true, force: true })
      report.cleanup.stateRemoved = !existsSync(persistTo)
      if (!report.cleanup.stateRemoved) report.cleanup.errors.push('state directory still present after removal')
    } catch (error) {
      report.cleanup.errors.push(String(error?.message ?? error))
    }
  }

  report.finishedAt = new Date().toISOString()
  const succeeded = report.passed && report.cleanup.wranglerKilled && report.cleanup.stateRemoved && report.cleanup.errors.length === 0 && report.errors.length === 0
  report.ok = succeeded
  await writeFile(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
  process.exit(succeeded ? 0 : 1)
}

main().catch(async (error) => {
  console.error('iconscale: unexpected failure', error)
  process.exit(2)
})
