import { ERROR_CODES, ExchangeError } from '../errors.js'

export function normalizeFolderPath(folderPath) {
  if (typeof folderPath !== 'string') return ''
  return folderPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
}

export function isFolderAllowed(folderPath, access) {
  if (!access || typeof access !== 'object') {
    return { allowed: false, reason: 'missing_policy' }
  }
  if (access.emergencyLock === true) {
    return { allowed: false, reason: 'emergency_lock' }
  }
  const normalizedTarget = normalizeFolderPath(folderPath)
  if (!normalizedTarget) {
    return { allowed: false, reason: 'empty_path' }
  }

  const configured = Array.isArray(access.folders)
    ? access.folders.map(normalizeFolderPath).filter(Boolean)
    : []

  if (access.mode === 'whitelist') {
    if (configured.includes(normalizedTarget)) {
      return { allowed: true }
    }
    return { allowed: false, reason: 'not_in_whitelist' }
  }

  // Blacklist mode: listed path and all its descendants are denied.
  for (const denied of configured) {
    if (normalizedTarget === denied || normalizedTarget.startsWith(`${denied}/`)) {
      return { allowed: false, reason: 'in_blacklist' }
    }
  }
  return { allowed: true }
}

export function assertFolderAllowed(folderPath, access) {
  const normalized = normalizeFolderPath(folderPath)
  const decision = isFolderAllowed(normalized, access)
  if (!decision.allowed) {
    const message = decision.reason === 'emergency_lock'
      ? '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹'
      : '该文件夹被设置为隐私保护，Agent 无权访问'
    throw new ExchangeError(ERROR_CODES.PERM_001, message, {
      folder: normalized || String(folderPath ?? ''),
      reason: decision.reason,
    })
  }
  return normalized
}
