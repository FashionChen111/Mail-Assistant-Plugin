import { randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { ERROR_CODES, ExchangeError } from './errors.js'

export const STATE_VERSION = '1.1.0'
export const CREDENTIAL_SCOPE = 'dsh-exchange'
export const CREDENTIAL_ID = 'account'
export const CREDENTIAL_KEY = credentialKey(CREDENTIAL_SCOPE, CREDENTIAL_ID)

export function defaultState() {
  return {
    version: STATE_VERSION,
    account: {
      serverUrl: '',
      email: '',
      domain: '',
      username: '',
    },
    access: {
      mode: 'blacklist',
      folders: [],
      emergencyLock: false,
    },
    ui: {
      showSidebarEntry: true,
    },
  }
}

export function validateServerUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new ExchangeError(ERROR_CODES.NET_001, 'EWS 服务器地址不能为空，且必须使用 HTTPS', {
      serverUrl: rawUrl ?? '',
    })
  }
  const trimmed = rawUrl.trim()
  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new ExchangeError(ERROR_CODES.NET_001, 'EWS 服务器地址格式无效，必须为合法的 https:// URL', {
      serverUrl: trimmed,
    })
  }
  if (parsed.protocol !== 'https:') {
    throw new ExchangeError(ERROR_CODES.NET_001, '拒绝非 HTTPS 的 EWS 地址，仅允许使用 https:// 协议', {
      protocol: parsed.protocol,
    })
  }
  if (!parsed.hostname) {
    throw new ExchangeError(ERROR_CODES.NET_001, 'EWS 服务器地址缺少主机名', {
      serverUrl: trimmed,
    })
  }
  return trimmed
}

function normalizeFolderList(rawFolders) {
  if (!Array.isArray(rawFolders)) return []
  const seen = new Set()
  const out = []
  for (const item of rawFolders) {
    if (typeof item !== 'string') continue
    const normalized = item
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/+/g, '/')
      .replace(/^\/+|\/+$/g, '')
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

export function normalizeState(raw = {}, { requireValidHttps = false } = {}) {
  const accountRaw = raw?.account && typeof raw.account === 'object' ? raw.account : {}
  const accessRaw = raw?.access && typeof raw.access === 'object' ? raw.access : {}

  const serverUrlRaw = typeof accountRaw.serverUrl === 'string' ? accountRaw.serverUrl.trim() : ''
  const serverUrl = serverUrlRaw
    ? validateServerUrl(serverUrlRaw)
    : (requireValidHttps ? validateServerUrl('') : '')

  const mode = accessRaw.mode === 'whitelist' ? 'whitelist' : 'blacklist'

  return {
    version: STATE_VERSION,
    account: {
      serverUrl,
      email: typeof accountRaw.email === 'string' ? accountRaw.email.trim() : '',
      domain: typeof accountRaw.domain === 'string' ? accountRaw.domain.trim() : '',
      username: typeof accountRaw.username === 'string' ? accountRaw.username.trim() : '',
    },
    access: {
      mode,
      folders: normalizeFolderList(accessRaw.folders),
      emergencyLock: Boolean(accessRaw.emergencyLock),
    },
    ui: {
      showSidebarEntry: raw?.ui?.showSidebarEntry !== false,
    },
  }
}

export async function readState(statePath) {
  let text
  try {
    text = await readFile(statePath, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return defaultState()
    }
    throw new ExchangeError(ERROR_CODES.NET_001, `无法读取插件状态文件: ${err.message}`, {
      cause: err.code,
    })
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ExchangeError(ERROR_CODES.PERM_001, '插件状态文件已损坏，出于安全策略已拒绝访问，请重新保存配置')
  }

  return normalizeState(parsed)
}

export async function writeState(statePath, nextState) {
  const normalized = normalizeState(nextState)
  const dir = dirname(statePath)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700).catch(() => {})

  const tmpPath = `${statePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  const payload = `${JSON.stringify(normalized, null, 2)}\n`

  try {
    await writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 })
    await chmod(tmpPath, 0o600)
    await rename(tmpPath, statePath)
    await chmod(statePath, 0o600)
  } catch (err) {
    await unlink(tmpPath).catch(() => {})
    throw err
  }

  return normalized
}

function getCredentialsService(ctx) {
  if (!ctx) return undefined
  if (typeof ctx.get === 'function') return ctx.get('credentials')
  return ctx.credentials
}

export async function getPassword(ctx, env = process.env) {
  const envPass = typeof env?.DSH_EXCHANGE_PASSWORD === 'string' ? env.DSH_EXCHANGE_PASSWORD : ''
  if (envPass.length > 0) {
    return envPass
  }
  const credentials = getCredentialsService(ctx)
  if (!credentials?.readRecord) return undefined
  const record = await credentials.readRecord(CREDENTIAL_KEY)
  if (!record) return undefined
  if (record.kind === 'api-key' && typeof record.key === 'string' && record.key.length > 0) {
    return record.key
  }
  if (record.kind === 'grant' && typeof record.payload?.password === 'string' && record.payload.password.length > 0) {
    return record.payload.password
  }
  return undefined
}

export async function describePassword(ctx, env = process.env) {
  const envPass = typeof env?.DSH_EXCHANGE_PASSWORD === 'string' ? env.DSH_EXCHANGE_PASSWORD : ''
  if (envPass.length > 0) {
    return { configured: true, source: 'env' }
  }
  const credentials = getCredentialsService(ctx)
  if (!credentials) {
    return { configured: false, source: 'none' }
  }
  if (typeof credentials.describeRecord === 'function') {
    const desc = await credentials.describeRecord(CREDENTIAL_KEY)
    if (desc?.configured) {
      return { configured: true, source: 'credentials' }
    }
    return { configured: false, source: 'none' }
  }
  const stored = await getPassword(ctx, {})
  return stored ? { configured: true, source: 'credentials' } : { configured: false, source: 'none' }
}

export async function setPassword(ctx, password) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new ExchangeError(ERROR_CODES.AUTH_001, '密码不能为空')
  }
  const credentials = getCredentialsService(ctx)
  if (!credentials?.modifyRecord) {
    throw new ExchangeError(ERROR_CODES.AUTH_001, '宿主凭据服务不可用，无法保存密码')
  }
  await credentials.modifyRecord(CREDENTIAL_KEY, async () => ({
    kind: 'api-key',
    key: password,
  }))
}

export async function clearPassword(ctx) {
  const credentials = getCredentialsService(ctx)
  if (!credentials?.deleteRecord) return
  await credentials.deleteRecord(CREDENTIAL_KEY)
}
