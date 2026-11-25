import { ToolArgsError } from '@deepseek-ai/dsh-tools'
import { ERROR_CODES, ExchangeError, throwIfAborted } from '../errors.js'
import { assertFolderAllowed } from '../security/permissions.js'
import { fetchMailFolders, folderMapById, resolveFolder } from './folders.js'

export async function moveEmail({ ewsClient, state, args = {}, signal }) {
  throwIfAborted(signal)

  if (typeof args.email_id !== 'string' || !args.email_id.trim()) {
    throw new ToolArgsError(['email_id 参数必填且不能为空'])
  }
  if (typeof args.target_folder !== 'string' || !args.target_folder.trim()) {
    throw new ToolArgsError(['target_folder 参数必填且不能为空'])
  }

  // Target folder checked BEFORE any EWS call.
  const normalizedTarget = assertFolderAllowed(args.target_folder, state.access)

  const [rawItem, folders] = await Promise.all([
    ewsClient.getItem(args.email_id.trim(), signal),
    fetchMailFolders(ewsClient, signal),
  ])

  const sourceFolder = folderMapById(folders).get(String(rawItem.parentFolderId ?? ''))
  if (!sourceFolder) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '无法确认源邮件所在文件夹，已拒绝移动', {
      email_id: args.email_id.trim(),
    })
  }
  assertFolderAllowed(sourceFolder.path, state.access)

  const targetEntry = resolveFolder({ folders, targetPath: normalizedTarget })
  throwIfAborted(signal)
  await ewsClient.moveItem(args.email_id.trim(), targetEntry.id, signal)
  return { moved: true }
}

export async function markEmail({ ewsClient, state, args = {}, signal }) {
  throwIfAborted(signal)

  if (typeof args.email_id !== 'string' || !args.email_id.trim()) {
    throw new ToolArgsError(['email_id 参数必填且不能为空'])
  }
  const hasRead = typeof args.is_read === 'boolean'
  const hasFlagged = typeof args.is_flagged === 'boolean'
  if (!hasRead && !hasFlagged) {
    throw new ToolArgsError(['is_read 和 is_flagged 至少需要提供一个布尔值'])
  }
  if (state.access.emergencyLock === true) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权标记邮件', {
      reason: 'emergency_lock',
    })
  }

  const [rawItem, folders] = await Promise.all([
    ewsClient.getItem(args.email_id.trim(), signal),
    fetchMailFolders(ewsClient, signal),
  ])
  const folderEntry = folderMapById(folders).get(String(rawItem.parentFolderId ?? ''))
  if (!folderEntry) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '无法确认邮件所在文件夹，已拒绝标记', {
      email_id: args.email_id.trim(),
    })
  }
  assertFolderAllowed(folderEntry.path, state.access)

  throwIfAborted(signal)
  await ewsClient.markItem(
    args.email_id.trim(),
    {
      ...(hasRead ? { isRead: args.is_read } : {}),
      ...(hasFlagged ? { isFlagged: args.is_flagged } : {}),
    },
    signal,
  )
  return { updated: true }
}

export async function deleteEmail({ ewsClient, state, args = {}, signal }) {
  throwIfAborted(signal)

  if (typeof args.email_id !== 'string' || !args.email_id.trim()) {
    throw new ToolArgsError(['email_id 参数必填且不能为空'])
  }

  // Hard security invariant: permanent deletion is ALWAYS denied before any EWS call.
  if (args.permanent === true) {
    throw new ExchangeError(
      ERROR_CODES.PERM_001,
      '不允许永久删除邮件，仅支持移至「已删除项目」以保留可恢复性',
      { email_id: args.email_id.trim(), permanent: true },
    )
  }

  if (state.access.emergencyLock === true) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权删除邮件', {
      reason: 'emergency_lock',
    })
  }

  const [rawItem, folders] = await Promise.all([
    ewsClient.getItem(args.email_id.trim(), signal),
    fetchMailFolders(ewsClient, signal),
  ])
  const folderEntry = folderMapById(folders).get(String(rawItem.parentFolderId ?? ''))
  if (!folderEntry) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '无法确认邮件所在文件夹，已拒绝删除', {
      email_id: args.email_id.trim(),
    })
  }
  assertFolderAllowed(folderEntry.path, state.access)

  throwIfAborted(signal)
  await ewsClient.deleteItem(args.email_id.trim(), signal)
  return { deleted: true }
}
