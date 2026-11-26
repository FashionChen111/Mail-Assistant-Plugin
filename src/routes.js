import { dirname, join } from 'node:path'
import { createActivityLogger, readActivityHistory } from './activity.js'
import { ERROR_CODES, ExchangeError } from './errors.js'
import { createEwsClient, mapEwsError } from './ews/connection.js'
import { fetchMailFolders } from './ews/folders.js'
import {
  clearPassword,
  defaultState,
  describePassword,
  getPassword,
  readState,
  setPassword,
  validateServerUrl,
  writeState,
} from './state.js'

export const ROUTE_PATHS = Object.freeze({
  status: '/dsh-exchange/api/status',
  probe: '/dsh-exchange/api/probe',
  save: '/dsh-exchange/api/save',
  history: '/dsh-exchange/api/history',
  historyClear: '/dsh-exchange/api/history/clear',
})

const MAX_BODY_BYTES = 64 * 1024

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.setHeader('cache-control', 'no-store')
  res.end()
}

async function readBoundedJsonBody(req, res) {
  const ct = String(req.headers?.['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
  if (ct !== 'application/json') {
    sendJson(res, 415, {
      ok: false,
      error: 'UNSUPPORTED_MEDIA_TYPE',
      message: 'content-type must be application/json',
    })
    return null
  }

  const chunks = []
  let size = 0
  try {
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buf.byteLength
      if (size > MAX_BODY_BYTES) {
        req.resume?.()
        sendJson(res, 413, {
          ok: false,
          error: 'PAYLOAD_TOO_LARGE',
          message: 'request body exceeds 64 KiB limit',
        })
        return null
      }
      chunks.push(buf)
    }
  } catch {
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'request body unreadable' })
    return null
  }

  const text = Buffer.concat(chunks, size).toString('utf8')
  try {
    const parsed = JSON.parse(text || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      sendJson(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'JSON body must be an object' })
      return null
    }
    return parsed
  } catch {
    sendJson(res, 400, { ok: false, error: 'BAD_REQUEST', message: 'invalid JSON body' })
    return null
  }
}

function getService(ctx, name) {
  if (!ctx) return undefined
  if (typeof ctx.get === 'function') return ctx.get(name)
  return ctx[name]
}

function checkTrustFence(ctx, req, res) {
  const conn = getService(ctx, 'connection')
  if (!conn || typeof conn.requestRejection !== 'function') {
    res.statusCode = 403
    res.setHeader('cache-control', 'no-store')
    res.end()
    return true
  }
  const rejection = conn.requestRejection(req)
  if (rejection === undefined) return false
  res.statusCode = rejection
  res.setHeader('cache-control', 'no-store')
  res.end()
  return true
}

function httpStatusForError(err) {
  if (err instanceof ExchangeError) {
    if (err.code === ERROR_CODES.AUTH_001) return 401
    if (err.code === ERROR_CODES.PERM_001) return 403
    if (err.code === ERROR_CODES.RATE_001) return 429
    if (err.code === ERROR_CODES.NET_001) {
      if (err.details?.protocol || err.details?.serverUrl !== undefined) return 400
      return 502
    }
  }
  return 500
}

export function registerExchangeRoutes(
  ctx,
  {
    statePath,
    auditPath = join(dirname(statePath), 'audit.jsonl'),
    activityPath = join(dirname(statePath), 'activity.jsonl'),
    config,
    env = process.env,
    clientFactory = createEwsClient,
  },
) {
  const webServer = getService(ctx, 'webServer')
  if (!webServer || typeof webServer.register !== 'function') {
    return () => {}
  }

  const activityLogger = createActivityLogger(activityPath, { auditPath })
  const disposers = []

  const registerRoute = (label, route) => {
    const register = () => webServer.register(route)
    if (typeof ctx.effect === 'function') {
      const dispose = ctx.effect(register, label)
      if (typeof dispose === 'function') disposers.push(dispose)
    } else {
      const dispose = register()
      if (typeof dispose === 'function') disposers.push(dispose)
    }
  }

  // 1. GET /dsh-exchange/api/status
  registerRoute('dsh-exchange: GET /dsh-exchange/api/status', {
    kind: 'exact',
    path: ROUTE_PATHS.status,
    async handler(req, res) {
      if (checkTrustFence(ctx, req, res)) return
      if (req.method !== 'GET') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      try {
        const [state, passDesc] = await Promise.all([
          readState(statePath),
          describePassword(ctx, env),
        ])
        sendJson(res, 200, {
          ok: true,
          version: state.version,
          account: state.account,
          access: state.access,
          ui: state.ui,
          passwordSet: passDesc.configured,
          passwordSource: passDesc.source,
          limits: {
            max_search_results: config.maxSearchResults,
            max_attachment_mb: config.maxAttachmentMb,
            max_body_chars: config.maxBodyChars,
            request_timeout_seconds: config.requestTimeoutSeconds,
            explicit_prefix: config.explicitPrefix,
          },
        })
      } catch (err) {
        const mapped = err instanceof ExchangeError ? err : mapEwsError(err)
        sendJson(res, httpStatusForError(mapped), {
          ok: false,
          error: mapped.code,
          message: mapped.message,
          details: mapped.details,
        })
      }
    },
  })

  // 2. POST /dsh-exchange/api/probe
  registerRoute('dsh-exchange: POST /dsh-exchange/api/probe', {
    kind: 'exact',
    path: ROUTE_PATHS.probe,
    async handler(req, res) {
      if (checkTrustFence(ctx, req, res)) return
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST')
        return
      }
      const body = await readBoundedJsonBody(req, res)
      if (!body) return

      try {
        const current = await readState(statePath)
        const serverUrl = validateServerUrl(
          typeof body.serverUrl === 'string' && body.serverUrl.trim()
            ? body.serverUrl
            : current.account.serverUrl,
        )
        const email = typeof body.email === 'string' ? body.email.trim() : current.account.email
        const domain = typeof body.domain === 'string' ? body.domain.trim() : current.account.domain
        const username = typeof body.username === 'string' ? body.username.trim() : current.account.username

        const submittedPassword = typeof body.password === 'string' && body.password.length > 0
          ? body.password
          : undefined
        const password = submittedPassword ?? (await getPassword(ctx, env))

        if (!password) {
          throw new ExchangeError(ERROR_CODES.AUTH_001, '请输入 Exchange 密码或先保存密码后再连接')
        }

        const client = clientFactory({
          serverUrl,
          email,
          domain,
          username,
          password,
          timeoutMs: config.requestTimeoutMs,
        })
        const tree = await fetchMailFolders(client)
        sendJson(res, 200, {
          ok: true,
          folders: tree.map((f) => ({ path: f.path, name: f.name })),
        })
      } catch (err) {
        const mapped = err instanceof ExchangeError ? err : mapEwsError(err)
        sendJson(res, httpStatusForError(mapped), {
          ok: false,
          error: mapped.code,
          message: mapped.message,
          details: mapped.details,
        })
      }
    },
  })

  // 3. POST /dsh-exchange/api/save
  registerRoute('dsh-exchange: POST /dsh-exchange/api/save', {
    kind: 'exact',
    path: ROUTE_PATHS.save,
    async handler(req, res) {
      if (checkTrustFence(ctx, req, res)) return
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST')
        return
      }
      const body = await readBoundedJsonBody(req, res)
      if (!body) return

      try {
        const current = await readState(statePath)
        let nextState
        if (body.reset === true) {
          const def = defaultState()
          nextState = {
            version: def.version,
            account: current.account,
            access: def.access,
            ui: current.ui,
          }
        } else {
          const nextAccount = {
            serverUrl: typeof body.account?.serverUrl === 'string'
              ? body.account.serverUrl.trim()
              : current.account.serverUrl,
            email: typeof body.account?.email === 'string'
              ? body.account.email.trim()
              : current.account.email,
            domain: typeof body.account?.domain === 'string'
              ? body.account.domain.trim()
              : current.account.domain,
            username: typeof body.account?.username === 'string'
              ? body.account.username.trim()
              : current.account.username,
          }
          if (nextAccount.serverUrl) {
            validateServerUrl(nextAccount.serverUrl)
          }

          const nextAccess = {
            mode: body.access?.mode === 'whitelist' || body.access?.mode === 'blacklist'
              ? body.access.mode
              : current.access.mode,
            folders: Array.isArray(body.access?.folders)
              ? body.access.folders
              : current.access.folders,
            emergencyLock: typeof body.access?.emergencyLock === 'boolean'
              ? body.access.emergencyLock
              : current.access.emergencyLock,
          }

          const nextUi = {
            showSidebarEntry: typeof body.ui?.showSidebarEntry === 'boolean'
              ? body.ui.showSidebarEntry
              : current.ui.showSidebarEntry,
          }

          nextState = {
            version: current.version,
            account: nextAccount,
            access: nextAccess,
            ui: nextUi,
          }
        }

        if (body.clearPassword === true) {
          await clearPassword(ctx)
        } else if (typeof body.password === 'string' && body.password.length > 0) {
          await setPassword(ctx, body.password)
        }

        const saved = await writeState(statePath, nextState)
        const passDesc = await describePassword(ctx, env)
        sendJson(res, 200, {
          ok: true,
          state: saved,
          passwordSet: passDesc.configured,
          passwordSource: passDesc.source,
        })
      } catch (err) {
        const mapped = err instanceof ExchangeError ? err : mapEwsError(err)
        sendJson(res, httpStatusForError(mapped), {
          ok: false,
          error: mapped.code,
          message: mapped.message,
          details: mapped.details,
        })
      }
    },
  })

  // 4. GET /dsh-exchange/api/history
  registerRoute('dsh-exchange: GET /dsh-exchange/api/history', {
    kind: 'exact',
    path: ROUTE_PATHS.history,
    async handler(req, res) {
      if (checkTrustFence(ctx, req, res)) return
      if (req.method !== 'GET') {
        sendMethodNotAllowed(res, 'GET')
        return
      }
      let parsedUrl
      try {
        parsedUrl = new URL(req.url || ROUTE_PATHS.history, 'http://localhost')
      } catch {
        sendJson(res, 400, {
          ok: false,
          error: 'BAD_REQUEST',
          message: 'invalid history query URL',
        })
        return
      }
      try {
        const sp = parsedUrl.searchParams
        const result = await readActivityHistory({
          activityPath,
          auditPath,
          limit: sp.get('limit') ?? 50,
          offset: sp.get('offset') ?? 0,
          category: sp.get('category') ?? 'all',
          outcome: sp.get('outcome') ?? 'all',
          q: sp.get('q') ?? '',
        })
        sendJson(res, 200, {
          ok: true,
          ...result,
        })
      } catch {
        sendJson(res, 500, {
          ok: false,
          error: 'INTERNAL_ERROR',
          message: 'Failed to read local activity history',
        })
      }
    },
  })

  // 5. POST /dsh-exchange/api/history/clear
  registerRoute('dsh-exchange: POST /dsh-exchange/api/history/clear', {
    kind: 'exact',
    path: ROUTE_PATHS.historyClear,
    async handler(req, res) {
      if (checkTrustFence(ctx, req, res)) return
      if (req.method !== 'POST') {
        sendMethodNotAllowed(res, 'POST')
        return
      }
      const body = await readBoundedJsonBody(req, res)
      if (!body) return
      try {
        const { clearedAt } = await activityLogger.clear()
        sendJson(res, 200, {
          ok: true,
          clearedAt,
        })
      } catch {
        sendJson(res, 500, {
          ok: false,
          error: 'INTERNAL_ERROR',
          message: 'Failed to clear local activity history',
        })
      }
    },
  })

  return () => {
    for (const dispose of disposers.splice(0)) {
      try { dispose() } catch {}
    }
  }
}
