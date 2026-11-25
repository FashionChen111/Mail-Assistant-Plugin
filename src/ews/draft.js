import { ToolArgsError } from '@deepseek-ai/dsh-tools'
import { ERROR_CODES, ExchangeError, isAbortError, throwIfAborted } from '../errors.js'
import { isFolderAllowed } from '../security/permissions.js'
import { fetchMailFolders, folderMapById } from './folders.js'

function cleanEmailList(list, fieldName, { required = false } = {}) {
  if (list === undefined) {
    if (required) throw new ToolArgsError([`${fieldName} 不能为空，至少需要一个收件人`])
    return undefined
  }
  if (!Array.isArray(list)) {
    throw new ToolArgsError([`${fieldName} 必须为字符串数组`])
  }
  const cleaned = list
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
  if (required && cleaned.length === 0) {
    throw new ToolArgsError([`${fieldName} 不能为空，至少需要一个收件人`])
  }
  return cleaned
}

async function resolveReplyHeaders({ ewsClient, state, inReplyToId, signal }) {
  if (typeof inReplyToId !== 'string' || !inReplyToId.trim()) {
    return {}
  }
  try {
    throwIfAborted(signal)
    const [orig, folders] = await Promise.all([
      ewsClient.getItem(inReplyToId.trim(), signal),
      fetchMailFolders(ewsClient, signal),
    ])
    const folderEntry = folderMapById(folders).get(String(orig.parentFolderId ?? ''))
    if (!folderEntry || !isFolderAllowed(folderEntry.path, state.access).allowed) {
      // Do not leak headers from a forbidden folder; degrade cleanly to an ordinary draft.
      return {}
    }
    const msgId = typeof orig.messageId === 'string' ? orig.messageId.trim() : ''
    if (!msgId) return {}
    const refs = []
    const seen = new Set()
    for (const ref of orig.references ?? []) {
      const clean = String(ref).trim()
      if (clean && !seen.has(clean)) {
        seen.add(clean)
        refs.push(clean)
      }
    }
    if (!seen.has(msgId)) refs.push(msgId)
    return {
      inReplyToMessageId: msgId,
      referencesHeader: refs.join(' '),
    }
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) throw err
    // PRD 3.2.3: degrade gracefully when referenced email cannot be retrieved.
    return {}
  }
}

function assertNotLocked(state) {
  if (state.access.emergencyLock === true) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权操作草稿', {
      reason: 'emergency_lock',
    })
  }
}

export async function saveDraft({ ewsClient, state, args = {}, signal }) {
  throwIfAborted(signal)
  assertNotLocked(state)

  const to = cleanEmailList(args.to, 'to', { required: true })
  const cc = cleanEmailList(args.cc, 'cc') ?? []
  const bcc = cleanEmailList(args.bcc, 'bcc') ?? []

  if (typeof args.subject !== 'string' || !args.subject.trim()) {
    throw new ToolArgsError(['subject 不能为空'])
  }
  if (typeof args.body_text !== 'string') {
    throw new ToolArgsError(['body_text 必须为字符串'])
  }

  const replyHeaders = await resolveReplyHeaders({
    ewsClient,
    state,
    inReplyToId: args.in_reply_to,
    signal,
  })

  throwIfAborted(signal)
  const saved = await ewsClient.saveDraft(
    {
      to,
      cc,
      bcc,
      subject: args.subject.trim(),
      bodyText: args.body_text,
      bodyHtml: typeof args.body_html === 'string' ? args.body_html : undefined,
      ...replyHeaders,
    },
    signal,
  )

  return {
    draft_id: String(saved.draftId ?? saved.draft_id ?? ''),
    saved_time: String(saved.savedTime ?? saved.saved_time ?? new Date().toISOString()),
  }
}

export async function updateDraft({ ewsClient, state, args = {}, signal }) {
  throwIfAborted(signal)
  assertNotLocked(state)

  if (typeof args.draft_id !== 'string' || !args.draft_id.trim()) {
    throw new ToolArgsError(['draft_id 参数必填且不能为空'])
  }

  const patch = {}
  if (args.to !== undefined) patch.to = cleanEmailList(args.to, 'to', { required: true })
  if (args.cc !== undefined) patch.cc = cleanEmailList(args.cc, 'cc')
  if (args.bcc !== undefined) patch.bcc = cleanEmailList(args.bcc, 'bcc')
  if (args.subject !== undefined) {
    if (typeof args.subject !== 'string' || !args.subject.trim()) {
      throw new ToolArgsError(['subject 不能为空'])
    }
    patch.subject = args.subject.trim()
  }
  if (args.body_text !== undefined) {
    if (typeof args.body_text !== 'string') {
      throw new ToolArgsError(['body_text 必须为字符串'])
    }
    patch.bodyText = args.body_text
  }
  if (args.body_html !== undefined) {
    patch.bodyHtml = typeof args.body_html === 'string' ? args.body_html : undefined
  }
  if (args.in_reply_to !== undefined) {
    Object.assign(
      patch,
      await resolveReplyHeaders({ ewsClient, state, inReplyToId: args.in_reply_to, signal }),
    )
  }

  if (Object.keys(patch).length === 0) {
    throw new ToolArgsError(['至少需要传入一个待更新的草稿字段'])
  }

  throwIfAborted(signal)
  const updated = await ewsClient.updateDraft(args.draft_id.trim(), patch, signal)
  return {
    draft_id: String(updated.draftId ?? updated.draft_id ?? args.draft_id.trim()),
    saved_time: String(updated.savedTime ?? updated.saved_time ?? new Date().toISOString()),
  }
}

export async function deleteDraft({ ewsClient, state, args = {}, signal }) {
  throwIfAborted(signal)
  assertNotLocked(state)

  if (typeof args.draft_id !== 'string' || !args.draft_id.trim()) {
    throw new ToolArgsError(['draft_id 参数必填且不能为空'])
  }

  throwIfAborted(signal)
  await ewsClient.deleteDraft(args.draft_id.trim(), signal)
  return { deleted: true }
}
