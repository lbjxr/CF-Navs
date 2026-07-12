import type { Env } from '../types'
import { hashPassword, verifyPassword } from './crypto'
import { getSettingValues, setSettingValue } from './db'

const ADMIN_USERNAME_KEY = 'admin_username'
const ADMIN_PASSWORD_KEY = 'admin_password'
const BOOTSTRAP_USERNAME_KEY = 'admin_bootstrap_username'
const BOOTSTRAP_PASSWORD_KEY = 'admin_bootstrap_password'
const RESET_MARKER_KEY = 'admin_reset_marker'

export interface AdminCredentials {
  username: string
  passwordHash: string
  resetApplied?: boolean
}

export interface AdminBootstrapOptions {
  applyCredentialReset?: boolean
}

export async function ensureAdminBootstrap(
  env: Env,
  options: AdminBootstrapOptions = {},
): Promise<AdminCredentials> {
  const applyCredentialReset = options.applyCredentialReset ?? true
  const credentials = await getSettingValues<string>(env.DB, [
    ADMIN_USERNAME_KEY,
    ADMIN_PASSWORD_KEY,
    BOOTSTRAP_USERNAME_KEY,
    BOOTSTRAP_PASSWORD_KEY,
    RESET_MARKER_KEY,
  ])
  const adminUsername = credentials.get(ADMIN_USERNAME_KEY) ?? null
  const adminPassword = credentials.get(ADMIN_PASSWORD_KEY) ?? null
  const bootstrapUsername = credentials.get(BOOTSTRAP_USERNAME_KEY) ?? null
  const bootstrapPassword = credentials.get(BOOTSTRAP_PASSWORD_KEY) ?? null
  const appliedResetMarker = credentials.get(RESET_MARKER_KEY) ?? null
  const initUsername = env.INIT_ADMIN_USER?.trim()
  const initPassword = env.INIT_ADMIN_PASSWORD?.trim()
  const resetMarker = env.RESET_ADMIN_CREDENTIALS?.trim()

  const hasInitCredentials = Boolean(initUsername && initPassword)
  const hasBootstrapMarker = Boolean(bootstrapUsername && bootstrapPassword)
  const resetRequested =
    Boolean(resetMarker) && resetMarker !== appliedResetMarker
  let initCredentialsChanged = false
  if (applyCredentialReset && hasInitCredentials && hasBootstrapMarker) {
    initCredentialsChanged =
      bootstrapUsername !== initUsername ||
      !(await verifyPassword(initPassword, bootstrapPassword!))
  }

  if (
    applyCredentialReset &&
    hasInitCredentials &&
    (resetRequested || initCredentialsChanged)
  ) {
    const nextPasswordHash = await hashPassword(initPassword)
    const writes: Promise<unknown>[] = [
      setSettingValue(env.DB, ADMIN_USERNAME_KEY, initUsername),
      setSettingValue(env.DB, ADMIN_PASSWORD_KEY, nextPasswordHash),
      setSettingValue(env.DB, BOOTSTRAP_USERNAME_KEY, initUsername),
      setSettingValue(env.DB, BOOTSTRAP_PASSWORD_KEY, nextPasswordHash),
    ]

    if (resetMarker) {
      writes.push(setSettingValue(env.DB, RESET_MARKER_KEY, resetMarker))
    }

    await Promise.all(writes)

    return {
      username: initUsername,
      passwordHash: nextPasswordHash,
      resetApplied: true,
    }
  }

  if (adminUsername && adminPassword) {
    // Existing installations created before bootstrap markers were added keep
    // their current credentials on the first request after the upgrade.
    if (!hasBootstrapMarker && hasInitCredentials) {
      const bootstrapPasswordHash = await hashPassword(initPassword)
      await Promise.all([
        setSettingValue(env.DB, BOOTSTRAP_USERNAME_KEY, initUsername),
        setSettingValue(env.DB, BOOTSTRAP_PASSWORD_KEY, bootstrapPasswordHash),
      ])
    }

    return {
      username: adminUsername,
      passwordHash: adminPassword,
    }
  }

  if (!initUsername || !initPassword) {
    throw new Error('Missing INIT_ADMIN_USER or INIT_ADMIN_PASSWORD for admin bootstrap')
  }

  const initPasswordHash = await hashPassword(initPassword)
  const nextPasswordHash = adminPassword ?? initPasswordHash
  const writes: Promise<unknown>[] = []

  if (!adminUsername) {
    writes.push(setSettingValue(env.DB, ADMIN_USERNAME_KEY, initUsername))
  }

  if (!adminPassword) {
    writes.push(setSettingValue(env.DB, ADMIN_PASSWORD_KEY, initPasswordHash))
  }

  if (!bootstrapUsername || !bootstrapPassword) {
    writes.push(setSettingValue(env.DB, BOOTSTRAP_USERNAME_KEY, initUsername))
    writes.push(setSettingValue(env.DB, BOOTSTRAP_PASSWORD_KEY, initPasswordHash))
  }

  await Promise.all(writes)

  return {
    username: adminUsername ?? initUsername,
    passwordHash: nextPasswordHash,
  }
}
