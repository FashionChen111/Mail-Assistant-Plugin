import { ToolArgsError } from '@deepseek-ai/dsh-tools'
import { ERROR_CODES, ExchangeError, throwIfAborted } from '../errors.js'
import { assertFolderAllowed } from '../security/permissions.js'
import { fetchMailFolders, folderMapById } from './folders.js'
import { formatEmailDetail } from './search.js'

function emailTimestamp(email) {
  const raw = email.sent_time || email.sentTime || email.received_time || email.receivedTime || ''
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function sortThreadEmails(emails) {
  if (!Array.isArray(emails) || emails.length <= 1) {
    return Array.isArray(emails) ? [...emails] : []
  }

  // Build topological order from References -> Message-ID edges, breaking ties chronologically.
  const indexByMessageId = new Map()
  emails.forEach((email, idx) => {
    const mid = typeof email.message_id === 'string' ? email.message_id.trim() : ''
    if (mid && !indexByMessageId.has(mid)) {
      indexByMessageId.set(mid, idx)
    }
  })

  const indegree = new Array(emails.length).fill(0)
  const edges = Array.from({ length: emails.length }, () => new Set())

  emails.forEach((email, childIdx) => {
    const refs = Array.isArray(email.references) ? email.references : []
    for (const ref of refs) {
      const parentIdx = indexByMessageId.get(String(ref).trim())
      if (parentIdx === undefined || parentIdx === childIdx) continue
      if (!edges[parentIdx].has(childIdx)) {
        edges[parentIdx].add(childIdx)
        indegree[childIdx] += 1
      }
    }
  })

  const compareIdx = (a, b) => {
    const diff = emailTimestamp(emails[a]) - emailTimestamp(emails[b])
    if (diff !== 0) return diff
    return String(emails[a].id ?? '').localeCompare(String(emails[b].id ?? ''))
  }

  const ready = []
  for (let i = 0; i < emails.length; i++) {
    if (indegree[i] === 0) ready.push(i)
  }
  ready.sort(compareIdx)

  const ordered = []
  const visited = new Set()
  while (ready.length > 0) {
    const current = ready.shift()
    if (visited.has(current)) continue
    visited.add(current)
    ordered.push(emails[current])
    for (const next of edges[current]) {
      indegree[next] -= 1
      if (indegree[next] === 0) {
        ready.push(next)
      }
    }
    ready.sort(compareIdx)
  }

  // Fallback for any cycle in malformed headers: append remaining in chronological order.
  if (ordered.length < emails.length) {
    const remaining = []
    for (let i = 0; i < emails.length; i++) {
      if (!visited.has(i)) remaining.push(i)
    }
    remaining.sort(compareIdx)
    for (const idx of remaining) ordered.push(emails[idx])
  }

  return ordered
}

export async function getThread({ ewsClient, state, limits, args = {}, signal }) {
  throwIfAborted(signal)

  if (typeof args.email_id !== 'string' || !args.email_id.trim()) {
    throw new ToolArgsError(['email_id 参数必填且不能为空'])
  }
  if (state.access.emergencyLock === true) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹', {
      reason: 'emergency_lock',
    })
  }

  const [anchor, folders] = await Promise.all([
    ewsClient.getItem(args.email_id.trim(), signal),
    fetchMailFolders(ewsClient, signal),
  ])
  const byId = folderMapById(folders)
  const anchorFolder = byId.get(String(anchor.parentFolderId ?? ''))
  if (!anchorFolder) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '无法确认邮件所在文件夹，已拒绝重建线程', {
      email_id: args.email_id.trim(),
    })
  }
  assertFolderAllowed(anchorFolder.path, state.access)

  let rawMembers = [anchor]
  if (anchor.conversationId) {
    throwIfAborted(signal)
    const found = await ewsClient.findConversationItems(
      anchor.conversationId,
      folders.map((f) => f.id),
      signal,
    )
    if (Array.isArray(found) && found.length > 0) {
      rawMembers = found
      if (!rawMembers.some((item) => item.id === anchor.id)) {
        rawMembers.push(anchor)
      }
    }
  }

  // All-or-nothing security check: if ANY member belongs to a forbidden folder, reject whole thread.
  const deduped = []
  const seenKeys = new Set()
  for (const raw of rawMembers) {
    const folderEntry = byId.get(String(raw.parentFolderId ?? ''))
    if (!folderEntry) {
      throw new ExchangeError(ERROR_CODES.PERM_001, '线程中包含未知或受限目录中的邮件，整条线程拒绝访问', {
        email_id: String(raw.id ?? ''),
      })
    }
    assertFolderAllowed(folderEntry.path, state.access)

    const dedupKey = raw.messageId && String(raw.messageId).trim()
      ? `mid:${String(raw.messageId).trim()}`
      : `id:${String(raw.id ?? '')}`
    if (seenKeys.has(dedupKey)) continue
    seenKeys.add(dedupKey)

    const detail = formatEmailDetail(raw, folderEntry.path, limits.maxBodyChars)
    detail._sent_time = raw.sentTime ?? raw.receivedTime ?? detail.received_time
    deduped.push(detail)
  }

  const sorted = sortThreadEmails(
    deduped.map((d) => ({ ...d, sent_time: d._sent_time })),
  ).map(({ _sent_time, sent_time, ...clean }) => clean)

  return { emails: sorted }
}
