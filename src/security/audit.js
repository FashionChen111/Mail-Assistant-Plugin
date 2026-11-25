import { appendFile, chmod, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

function sanitizeScalar(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  return String(value)
}

export function formatAuditRecord(entry = {}) {
  const record = {
    ts: typeof entry.ts === 'string' ? entry.ts : new Date().toISOString(),
    action: sanitizeScalar(entry.action) ?? 'unknown',
    folder: entry.folder === undefined || entry.folder === null ? null : String(entry.folder),
    emailId: entry.emailId === undefined || entry.emailId === null ? null : String(entry.emailId),
    outcome: entry.outcome === 'ok' || entry.outcome === 'denied' || entry.outcome === 'error'
      ? entry.outcome
      : 'error',
    code: entry.code === undefined || entry.code === null ? null : String(entry.code),
    elapsedMs: Number.isFinite(Number(entry.elapsedMs)) ? Math.max(0, Math.round(Number(entry.elapsedMs))) : 0,
  }
  if (entry.count !== undefined && Number.isFinite(Number(entry.count))) {
    record.count = Math.max(0, Math.trunc(Number(entry.count)))
  }
  return record
}

export function createAuditLogger(auditPath) {
  let dirReady = false

  async function ensureDir() {
    if (dirReady) return
    const dir = dirname(auditPath)
    await mkdir(dir, { recursive: true, mode: 0o700 })
    await chmod(dir, 0o700).catch(() => {})
    dirReady = true
  }

  return {
    path: auditPath,
    async log(entry) {
      await ensureDir()
      const line = `${JSON.stringify(formatAuditRecord(entry))}\n`
      await appendFile(auditPath, line, { encoding: 'utf8', mode: 0o600 })
      await chmod(auditPath, 0o600).catch(() => {})
    },
  }
}
