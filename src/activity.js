import { randomBytes } from 'node:crypto'
import { appendFile, chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const MAX_ACTIVITY_ENTRIES = 500
const DEFAULT_COMPACT_EXTRA = 100
const MAX_STRING_LEN = 200
const MAX_ARRAY_LEN = 6
const MAX_ARRAY_ITEM_LEN = 120

export const ACTION_CATEGORIES = Object.freeze({
  list_folders: 'search',
  search_emails: 'search',
  read_email: 'read',
  list_recent_emails: 'search',
  save_draft: 'draft',
  update_draft: 'draft',
  delete_draft: 'draft',
  get_thread: 'read',
  parse_jira_notifications: 'analyze',
  extract_todos: 'analyze',
  summarize_project: 'analyze',
  download_attachment: 'read',
  move_email: 'modify',
  mark_email: 'modify',
  delete_email: 'modify',
})

const SUMMARY_STRING_KEYS = new Set([
  'subject',
  'from',
  'query',
  'toFilter',
  'dateFrom',
  'dateTo',
  'project',
  'fileName',
  'targetFolder',
  'receivedTime',
])

const SUMMARY_BOOLEAN_KEYS = new Set([
  'readableOnly',
  'unreadOnly',
  'importantOnly',
  'markAsRead',
  'hasAttachments',
  'isReply',
  'recoverable',
  'filterByUser',
  'isRead',
  'isFlagged',
  'permanentAttempt',
])

const SUMMARY_INTEGER_KEYS = new Set([
  'folderCount',
  'readableCount',
  'days',
  'total',
  'returnedCount',
  'attachmentCount',
  'toCount',
  'ccCount',
  'bccCount',
  'bodyChars',
  'messageCount',
  'matchedCount',
  'todoCount',
  'urgentCount',
  'relatedCount',
  'blockingCount',
  'nextActionCount',
  'size',
])

const SUMMARY_ARRAY_KEYS = new Set([
  'to',
  'updatedFields',
  'issueKeys',
  'sampleSubjects',
  'sampleTitles',
])

// Shared per-path write queue so logger instances (tools + routes) serialize cleanly.
const pathQueues = new Map()

function enqueuePathWrite(filePath, fn) {
  const key = resolve(filePath)
  const prev = pathQueues.get(key) ?? Promise.resolve()
  const next = prev.then(fn, fn)
  const settled = next.catch(() => {})
  pathQueues.set(key, settled)
  settled.finally(() => {
    if (pathQueues.get(key) === settled) {
      pathQueues.delete(key)
    }
  })
  return next
}

function cleanString(value, maxLen = MAX_STRING_LEN) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/[\r\n\t]+/g, ' ').trim()
  if (!text) return null
  if (text.length <= maxLen) return text
  return `${text.slice(0, Math.max(1, maxLen - 1))}…`
}

function sanitizeSummary(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out = {}
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === null) continue
    if (SUMMARY_STRING_KEYS.has(k)) {
      const cleaned = cleanString(v, MAX_STRING_LEN)
      if (cleaned !== null) out[k] = cleaned
    } else if (SUMMARY_BOOLEAN_KEYS.has(k)) {
      if (typeof v === 'boolean') out[k] = v
    } else if (SUMMARY_INTEGER_KEYS.has(k)) {
      const num = Number(v)
      if (Number.isFinite(num)) out[k] = Math.max(0, Math.trunc(num))
    } else if (SUMMARY_ARRAY_KEYS.has(k) && Array.isArray(v)) {
      const items = []
      for (const elem of v) {
        if (items.length >= MAX_ARRAY_LEN) break
        const cleaned = cleanString(elem, MAX_ARRAY_ITEM_LEN)
        if (cleaned !== null) items.push(cleaned)
      }
      if (items.length > 0) out[k] = items
    }
  }
  return out
}

export function formatActivityRecord(entry = {}) {
  const ts = typeof entry.ts === 'string' && entry.ts ? entry.ts : new Date().toISOString()
  const action = cleanString(entry.action, 64) ?? 'unknown'
  const category = ACTION_CATEGORIES[action] ?? 'search'
  const outcome = entry.outcome === 'ok' || entry.outcome === 'denied' || entry.outcome === 'error'
    ? entry.outcome
    : 'error'
  const record = {
    id: typeof entry.id === 'string' && entry.id
      ? entry.id
      : `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`,
    ts,
    action,
    category,
    outcome,
    code: cleanString(entry.code, 64),
    folder: cleanString(entry.folder, 200),
    emailId: cleanString(entry.emailId, 200),
    elapsedMs: Number.isFinite(Number(entry.elapsedMs)) ? Math.max(0, Math.round(Number(entry.elapsedMs))) : 0,
    source: entry.source === 'audit' ? 'audit' : 'activity',
    summary: sanitizeSummary(entry.summary),
  }
  if (entry.count !== undefined && entry.count !== null && Number.isFinite(Number(entry.count))) {
    record.count = Math.max(0, Math.trunc(Number(entry.count)))
  }
  return record
}

async function ensureParentDir(filePath) {
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await chmod(dir, 0o700).catch(() => {})
}

async function atomicWriteFile0600(filePath, content) {
  await ensureParentDir(filePath)
  const tmpPath = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(tmpPath, content, { encoding: 'utf8', mode: 0o600 })
    await chmod(tmpPath, 0o600).catch(() => {})
    await rename(tmpPath, filePath)
    await chmod(filePath, 0o600).catch(() => {})
  } catch (err) {
    await unlink(tmpPath).catch(() => {})
    throw err
  }
}

function parseJsonlSafe(raw) {
  const rows = []
  if (!raw) return rows
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        rows.push(parsed)
      }
    } catch {
      // Skip truncated/corrupt JSONL lines gracefully.
    }
  }
  return rows
}

async function readTextIfExists(filePath) {
  if (!filePath) return ''
  try {
    return await readFile(filePath, 'utf8')
  } catch (err) {
    if (err && err.code === 'ENOENT') return ''
    throw err
  }
}

function dedupeKey(rec) {
  return `${rec.ts}|${rec.action}|${rec.emailId ?? ''}|${rec.folder ?? ''}`
}

function parseEpoch(ts) {
  const ms = Date.parse(ts)
  return Number.isFinite(ms) ? ms : 0
}

function buildSearchHaystack(rec) {
  const parts = [rec.action, rec.folder, rec.code, rec.emailId]
  const s = rec.summary || {}
  for (const v of Object.values(s)) {
    if (typeof v === 'string') parts.push(v)
    else if (Array.isArray(v)) parts.push(v.join(' '))
  }
  return parts.filter(Boolean).join(' ').toLowerCase()
}

export function createActivityLogger(
  activityPath,
  { auditPath = null, maxEntries = MAX_ACTIVITY_ENTRIES, compactThreshold = maxEntries + DEFAULT_COMPACT_EXTRA } = {},
) {
  const effectiveMax = Math.max(1, Math.trunc(Number(maxEntries) || MAX_ACTIVITY_ENTRIES))
  const effectiveThreshold = Math.max(effectiveMax + 1, Math.trunc(Number(compactThreshold) || effectiveMax + DEFAULT_COMPACT_EXTRA))
  let writesSinceCompactCheck = 0

  async function maybeCompact() {
    const raw = await readTextIfExists(activityPath)
    const rows = parseJsonlSafe(raw)
    let clearedAt = null
    const records = []
    for (const row of rows) {
      if (row._meta === 'cleared' && typeof row.clearedAt === 'string') {
        if (!clearedAt || parseEpoch(row.clearedAt) > parseEpoch(clearedAt)) {
          clearedAt = row.clearedAt
        }
      } else if (typeof row.action === 'string') {
        records.push(row)
      }
    }
    if (records.length <= effectiveMax) return
    const kept = records.slice(-effectiveMax)
    const lines = []
    if (clearedAt) {
      lines.push(JSON.stringify({ _meta: 'cleared', clearedAt }))
    }
    for (const r of kept) {
      lines.push(JSON.stringify(r))
    }
    await atomicWriteFile0600(activityPath, `${lines.join('\n')}\n`)
  }

  return {
    path: activityPath,
    async log(entry) {
      const formatted = formatActivityRecord(entry)
      await enqueuePathWrite(activityPath, async () => {
        await ensureParentDir(activityPath)
        await appendFile(activityPath, `${JSON.stringify(formatted)}\n`, { encoding: 'utf8', mode: 0o600 })
        await chmod(activityPath, 0o600).catch(() => {})
        writesSinceCompactCheck += 1
        if (writesSinceCompactCheck >= Math.min(20, effectiveThreshold - effectiveMax)) {
          writesSinceCompactCheck = 0
          await maybeCompact()
        }
      })
      return formatted
    },
    async clear(nowIso) {
      const explicitNow = typeof nowIso === 'string' && nowIso ? nowIso : null
      let clearedAt = explicitNow ?? new Date().toISOString()
      await enqueuePathWrite(activityPath, async () => {
        if (!explicitNow && auditPath) {
          // Guard against backward system clock skew: ensure watermark covers all existing audit records.
          let maxEpoch = parseEpoch(clearedAt)
          const auditRaw = await readTextIfExists(auditPath)
          for (const row of parseJsonlSafe(auditRaw)) {
            if (typeof row.ts === 'string') {
              const ep = parseEpoch(row.ts)
              if (ep > maxEpoch) maxEpoch = ep
            }
          }
          if (maxEpoch > parseEpoch(clearedAt)) {
            clearedAt = new Date(maxEpoch).toISOString()
          }
        }
        writesSinceCompactCheck = 0
        await atomicWriteFile0600(activityPath, `${JSON.stringify({ _meta: 'cleared', clearedAt })}\n`)
      })
      return { clearedAt }
    },
  }
}

export async function readActivityHistory({
  activityPath,
  auditPath,
  limit = 50,
  offset = 0,
  category = 'all',
  outcome = 'all',
  q = '',
} = {}) {
  const [activityRaw, auditRaw] = await Promise.all([
    readTextIfExists(activityPath),
    readTextIfExists(auditPath),
  ])

  let clearedAt = null
  const activityRecords = []
  for (const row of parseJsonlSafe(activityRaw)) {
    if (row._meta === 'cleared' && typeof row.clearedAt === 'string') {
      if (!clearedAt || parseEpoch(row.clearedAt) > parseEpoch(clearedAt)) {
        clearedAt = row.clearedAt
      }
    } else if (typeof row.action === 'string') {
      activityRecords.push(formatActivityRecord({ ...row, source: 'activity' }))
    }
  }

  const clearedEpoch = clearedAt ? parseEpoch(clearedAt) : null
  const visibleActivity = clearedEpoch === null
    ? activityRecords
    : activityRecords.filter((r) => parseEpoch(r.ts) > clearedEpoch)

  const seenKeys = new Set(visibleActivity.map(dedupeKey))
  const merged = [...visibleActivity]

  for (const row of parseJsonlSafe(auditRaw)) {
    if (typeof row.action !== 'string') continue
    const rec = formatActivityRecord({
      ...row,
      id: `audit-${row.ts ?? ''}-${row.action}-${row.emailId ?? ''}`,
      source: 'audit',
      summary: {},
    })
    if (clearedEpoch !== null && parseEpoch(rec.ts) <= clearedEpoch) {
      continue
    }
    const key = dedupeKey(rec)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    merged.push(rec)
  }

  // Sort newest-first; tie-break preserving later-appended entries first.
  const indexed = merged.map((item, idx) => ({ item, idx, epoch: parseEpoch(item.ts) }))
  indexed.sort((a, b) => {
    if (b.epoch !== a.epoch) return b.epoch - a.epoch
    return b.idx - a.idx
  })
  const allItems = indexed.map((x) => x.item)

  const stats = {
    total: allItems.length,
    read: 0,
    draft: 0,
    search: 0,
    analyze: 0,
    modify: 0,
    denied: 0,
    error: 0,
  }
  for (const item of allItems) {
    if (item.category in stats) stats[item.category] += 1
    if (item.outcome === 'denied') stats.denied += 1
    else if (item.outcome === 'error') stats.error += 1
  }

  const normCategory = String(category || 'all').trim().toLowerCase()
  const normOutcome = String(outcome || 'all').trim().toLowerCase()
  const needle = String(q || '').trim().toLowerCase()

  const filtered = allItems.filter((item) => {
    if (normCategory && normCategory !== 'all') {
      if (normCategory === 'blocked') {
        if (item.outcome !== 'denied' && item.outcome !== 'error') return false
      } else if (item.category !== normCategory) {
        return false
      }
    }
    if (normOutcome && normOutcome !== 'all') {
      if (item.outcome !== normOutcome) return false
    }
    if (needle && !buildSearchHaystack(item).includes(needle)) {
      return false
    }
    return true
  })

  const safeLimit = Math.min(200, Math.max(1, Math.trunc(Number(limit) || 50)))
  const safeOffset = Math.max(0, Math.trunc(Number(offset) || 0))
  const page = filtered.slice(safeOffset, safeOffset + safeLimit)

  return {
    items: page,
    total: filtered.length,
    unfilteredTotal: allItems.length,
    hasMore: safeOffset + page.length < filtered.length,
    stats,
  }
}
