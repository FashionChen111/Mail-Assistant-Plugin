import { ToolArgsError } from '@deepseek-ai/dsh-tools'
import { ERROR_CODES, ExchangeError, throwIfAborted } from '../errors.js'
import { assertFolderAllowed, isFolderAllowed } from '../security/permissions.js'
import { fetchMailFolders, folderMapById, resolveFolder } from './folders.js'

const NAMED_ENTITIES = Object.freeze({
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
})

function decodeHtmlEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (full, entity) => {
    const lower = entity.toLowerCase()
    if (lower in NAMED_ENTITIES) return NAMED_ENTITIES[lower]
    if (lower.startsWith('#x')) {
      const cp = Number.parseInt(lower.slice(2), 16)
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full
    }
    if (lower.startsWith('#')) {
      const cp = Number.parseInt(lower.slice(1), 10)
      return Number.isFinite(cp) && cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : full
    }
    return full
  })
}

export function htmlToText(html) {
  if (typeof html !== 'string' || html.length === 0) return ''
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote|section|article)>/gi, '\n')
    .replace(/<t[dh][^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')

  text = decodeHtmlEntities(text)
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function makeSnippet(text, maxLen = 200) {
  if (typeof text !== 'string' || text.length === 0) return ''
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length <= maxLen ? compact : compact.slice(0, maxLen)
}

export function validateDateString(value, fieldName) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ToolArgsError([`${fieldName} 必须符合 YYYY-MM-DD 格式`])
  }
  const [y, m, d] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(y, m - 1, d))
  if (
    parsed.getUTCFullYear() !== y ||
    parsed.getUTCMonth() !== m - 1 ||
    parsed.getUTCDate() !== d
  ) {
    throw new ToolArgsError([`${fieldName} 不是合法的日期: ${value}`])
  }
  return value
}

export function clampLimit(rawLimit, maxSearchResults, fallback = 20) {
  if (rawLimit === undefined || rawLimit === null) {
    return Math.min(fallback, maxSearchResults)
  }
  const n = Math.trunc(Number(rawLimit))
  if (!Number.isFinite(n) || n < 1) {
    throw new ToolArgsError(['limit 必须为正整数'])
  }
  return Math.min(n, maxSearchResults)
}

function buildEmailSummary(raw, folderPath) {
  const plainSource = raw.bodyText && raw.bodyText.trim().length > 0
    ? raw.bodyText
    : htmlToText(raw.bodyHtml ?? '')
  return {
    id: String(raw.id ?? ''),
    from: String(raw.from ?? ''),
    subject: String(raw.subject ?? ''),
    snippet: makeSnippet(plainSource, 200),
    received_time: String(raw.receivedTime ?? raw.received_time ?? ''),
    is_read: Boolean(raw.isRead ?? raw.is_read),
    has_attachments: Boolean(raw.hasAttachments ?? raw.has_attachments),
    folder: folderPath,
  }
}

export function formatEmailDetail(raw, folderPath, maxBodyChars = 20000) {
  const fullText = raw.bodyText && raw.bodyText.trim().length > 0
    ? String(raw.bodyText)
    : htmlToText(raw.bodyHtml ?? '')
  const bodyChars = fullText.length
  const truncated = bodyChars > maxBodyChars
  const bodyText = truncated ? fullText.slice(0, maxBodyChars) : fullText

  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map((att) => ({
        id: String(att.id ?? ''),
        name: String(att.name ?? ''),
        size: Math.max(0, Math.trunc(Number(att.size ?? 0))),
        content_type: String(att.content_type ?? att.contentType ?? 'application/octet-stream'),
        is_inline: Boolean(att.is_inline ?? att.isInline),
      }))
    : []

  return {
    id: String(raw.id ?? ''),
    conversation_id: String(raw.conversationId ?? raw.conversation_id ?? ''),
    message_id: String(raw.messageId ?? raw.message_id ?? ''),
    references: Array.isArray(raw.references) ? raw.references.map(String) : [],
    from: String(raw.from ?? ''),
    to: Array.isArray(raw.to) ? raw.to.map(String) : [],
    cc: Array.isArray(raw.cc) ? raw.cc.map(String) : [],
    subject: String(raw.subject ?? ''),
    body_text: bodyText,
    body_html: raw.bodyHtml === null || raw.bodyHtml === undefined ? null : String(raw.bodyHtml),
    body_chars: bodyChars,
    body_truncated: truncated,
    received_time: String(raw.receivedTime ?? raw.received_time ?? ''),
    is_read: Boolean(raw.isRead ?? raw.is_read),
    has_attachments: attachments.length > 0 || Boolean(raw.hasAttachments ?? raw.has_attachments),
    attachments,
    folder: folderPath,
  }
}

function compareDescByReceivedTime(a, b) {
  const ta = Date.parse(a.received_time || '') || 0
  const tb = Date.parse(b.received_time || '') || 0
  return tb - ta
}

export async function searchEmails({ ewsClient, state, limits, args = {}, signal, now = new Date() }) {
  throwIfAborted(signal)

  if (typeof args.folder !== 'string' || !args.folder.trim()) {
    throw new ToolArgsError(['folder 参数必填且不能为空'])
  }

  // Permission check strictly BEFORE any EWS call.
  const allowedFolderPath = assertFolderAllowed(args.folder, state.access)

  let sinceIso
  let untilIso
  if (args.days !== undefined && args.days !== null) {
    const days = Math.trunc(Number(args.days))
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      throw new ToolArgsError(['days 必须为 1–3650 之间的整数'])
    }
    sinceIso = new Date(now.getTime() - days * 86400 * 1000).toISOString()
  } else {
    if (args.date_from !== undefined && args.date_from !== '') {
      const df = validateDateString(args.date_from, 'date_from')
      sinceIso = `${df}T00:00:00.000Z`
    }
    if (args.date_to !== undefined && args.date_to !== '') {
      const dt = validateDateString(args.date_to, 'date_to')
      untilIso = `${dt}T23:59:59.999Z`
    }
  }

  const limit = clampLimit(args.limit, limits.maxSearchResults, 20)
  const folders = await fetchMailFolders(ewsClient, signal)
  const targetFolder = resolveFolder({ folders, targetPath: allowedFolderPath })

  throwIfAborted(signal)
  const { items, total } = await ewsClient.findItems(
    targetFolder.id,
    {
      query: args.query,
      from: args.from,
      to: args.to,
      subject: args.subject,
      sinceIso,
      untilIso,
      unreadOnly: Boolean(args.unread_only),
      importantOnly: Boolean(args.important_only),
      limit,
    },
    signal,
  )

  const emails = items
    .map((item) => buildEmailSummary(item, targetFolder.path))
    .sort(compareDescByReceivedTime)
    .slice(0, limit)

  return {
    emails,
    total: Number.isFinite(Number(total)) ? Number(total) : emails.length,
  }
}

export async function listRecentEmails({ ewsClient, state, limits, args = {}, signal, now = new Date() }) {
  throwIfAborted(signal)

  if (state.access.emergencyLock === true) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹', {
      reason: 'emergency_lock',
    })
  }

  const days = args.days === undefined || args.days === null ? 7 : Math.trunc(Number(args.days))
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    throw new ToolArgsError(['days 必须为 1–90 之间的整数'])
  }
  const limit = clampLimit(args.limit, limits.maxSearchResults, 20)
  const sinceIso = new Date(now.getTime() - days * 86400 * 1000).toISOString()

  const folders = await fetchMailFolders(ewsClient, signal)
  const readableFolders = folders.filter((f) => isFolderAllowed(f.path, state.access).allowed)

  const seenIds = new Set()
  const merged = []
  for (const folder of readableFolders) {
    throwIfAborted(signal)
    const { items } = await ewsClient.findItems(
      folder.id,
      {
        sinceIso,
        unreadOnly: Boolean(args.unread_only),
        importantOnly: Boolean(args.important_only),
        limit,
      },
      signal,
    )
    for (const item of items) {
      if (!item.id || seenIds.has(item.id)) continue
      seenIds.add(item.id)
      merged.push(buildEmailSummary(item, folder.path))
    }
  }

  merged.sort(compareDescByReceivedTime)
  return {
    emails: merged.slice(0, limit),
  }
}

export async function readEmail({ ewsClient, state, limits, args = {}, signal }) {
  throwIfAborted(signal)

  if (typeof args.email_id !== 'string' || !args.email_id.trim()) {
    throw new ToolArgsError(['email_id 参数必填且不能为空'])
  }

  if (state.access.emergencyLock === true) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹', {
      reason: 'emergency_lock',
    })
  }

  const [rawItem, folders] = await Promise.all([
    ewsClient.getItem(args.email_id.trim(), signal),
    fetchMailFolders(ewsClient, signal),
  ])

  const byId = folderMapById(folders)
  const folderEntry = byId.get(String(rawItem.parentFolderId ?? ''))
  if (!folderEntry) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '无法确认该邮件当前所属文件夹，出于安全策略已拒绝读取', {
      email_id: args.email_id.trim(),
    })
  }

  // Re-verify live folder authorization BEFORE returning content or marking read.
  assertFolderAllowed(folderEntry.path, state.access)

  let isRead = Boolean(rawItem.isRead)
  if (args.mark_as_read === true && !isRead) {
    throwIfAborted(signal)
    await ewsClient.markItem(args.email_id.trim(), { isRead: true }, signal)
    isRead = true
  }

  return formatEmailDetail({ ...rawItem, isRead }, folderEntry.path, limits.maxBodyChars)
}
