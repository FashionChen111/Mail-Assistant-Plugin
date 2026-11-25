import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { ToolArgsError } from '@deepseek-ai/dsh-tools'
import { ERROR_CODES, ExchangeError, throwIfAborted } from '../errors.js'
import { assertFolderAllowed } from '../security/permissions.js'
import { fetchMailFolders, folderMapById } from './folders.js'

const BASE64_MAX_BYTES = 1024 * 1024 // 1 MiB
const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024 // 25 MiB

export function sanitizeAttachmentName(rawName, fallbackId = 'file') {
  const safeFallback = `attachment-${String(fallbackId || 'file').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16) || 'file'}`
  if (typeof rawName !== 'string' || !rawName.trim()) {
    return safeFallback
  }
  const stripped = rawName
    .replace(/\0/g, '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/^[A-Za-z]:/, '')
    .replace(/\\/g, '/')
  const segments = stripped.split('/').filter((seg) => seg && seg !== '.' && seg !== '..')
  const base = segments.length > 0 ? segments[segments.length - 1].trim() : ''
  if (!base || base === '.' || base === '..') {
    return safeFallback
  }
  return base
}

async function resolveSaveFilePath(savePath, safeFileName) {
  if (savePath === undefined || savePath === null || String(savePath).trim() === '') {
    const dir = await mkdtemp(join(tmpdir(), 'dsh-exchange-att-'))
    return join(dir, safeFileName)
  }

  const rawSave = String(savePath)
  if (rawSave.includes('\0')) {
    throw new ToolArgsError(['save_path 包含非法字符'])
  }
  const resolved = resolve(rawSave)
  try {
    const info = await stat(resolved)
    if (info.isDirectory()) {
      return join(resolved, safeFileName)
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }
  await mkdir(dirname(resolved), { recursive: true })
  return resolved
}

export async function downloadAttachment({ ewsClient, state, limits, args = {}, signal }) {
  throwIfAborted(signal)

  if (typeof args.email_id !== 'string' || !args.email_id.trim()) {
    throw new ToolArgsError(['email_id 参数必填且不能为空'])
  }
  if (typeof args.attachment_id !== 'string' || !args.attachment_id.trim()) {
    throw new ToolArgsError(['attachment_id 参数必填且不能为空'])
  }
  if (state.access.emergencyLock === true) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权下载附件', {
      reason: 'emergency_lock',
    })
  }

  const maxBytes = Number(limits?.maxAttachmentBytes ?? DEFAULT_MAX_ATTACHMENT_BYTES)
  const emailId = args.email_id.trim()
  const attachmentId = args.attachment_id.trim()

  const [rawItem, folders] = await Promise.all([
    ewsClient.getItem(emailId, signal),
    fetchMailFolders(ewsClient, signal),
  ])
  const folderEntry = folderMapById(folders).get(String(rawItem.parentFolderId ?? ''))
  if (!folderEntry) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '无法确认邮件所在文件夹，已拒绝下载附件', { email_id: emailId })
  }
  assertFolderAllowed(folderEntry.path, state.access)

  const meta = (rawItem.attachments ?? []).find((att) => String(att.id) === attachmentId)
  if (!meta) {
    throw new ExchangeError(ERROR_CODES.EMAIL_001, '指定的附件不存在', {
      email_id: emailId,
      attachment_id: attachmentId,
    })
  }

  // Pre-download size gate: exact 25 MiB allowed, +1 byte rejected with ATT_001.
  const declaredSize = Number(meta.size ?? 0)
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw new ExchangeError(
      ERROR_CODES.ATT_001,
      `附件大小 (${declaredSize} 字节) 超过上限 (${maxBytes} 字节)`,
      { attachment_id: attachmentId, size: declaredSize, limit_bytes: maxBytes },
    )
  }

  throwIfAborted(signal)
  const downloaded = await ewsClient.downloadAttachment(emailId, attachmentId, signal)
  const buffer = Buffer.isBuffer(downloaded.buffer)
    ? downloaded.buffer
    : Buffer.from(downloaded.buffer ?? '')

  // Pre-write actual byte length gate in case Exchange metadata under-reported size.
  if (buffer.byteLength > maxBytes) {
    throw new ExchangeError(
      ERROR_CODES.ATT_001,
      `附件实际大小 (${buffer.byteLength} 字节) 超过上限 (${maxBytes} 字节)`,
      { attachment_id: attachmentId, size: buffer.byteLength, limit_bytes: maxBytes },
    )
  }

  throwIfAborted(signal)
  const safeName = sanitizeAttachmentName(downloaded.name || meta.name, attachmentId)
  const filePath = await resolveSaveFilePath(args.save_path, safeName)
  await writeFile(filePath, buffer, { mode: 0o600 })

  const result = {
    file_path: filePath,
    size: buffer.byteLength,
  }
  if (buffer.byteLength <= BASE64_MAX_BYTES) {
    result.content_base64 = buffer.toString('base64')
  }
  return result
}
