import { ERROR_CODES, ExchangeError, throwIfAborted } from '../errors.js'
import { isFolderAllowed, normalizeFolderPath } from '../security/permissions.js'

const NON_MAIL_CLASS_PREFIXES = [
  'IPF.Appointment',
  'IPF.Contact',
  'IPF.Task',
  'IPF.Journal',
  'IPF.StickyNote',
  'IPF.Configuration',
  'IPF.Files',
]

export function isMailFolder(raw) {
  const cls = typeof raw?.folderClass === 'string' ? raw.folderClass.trim() : ''
  if (!cls) return true
  if (cls === 'IPF.Note' || cls.startsWith('IPF.Note.')) return true
  for (const prefix of NON_MAIL_CLASS_PREFIXES) {
    if (cls === prefix || cls.startsWith(`${prefix}.`)) return false
  }
  return false
}

export function buildFolderTree(rawResult) {
  const rootId = rawResult && !Array.isArray(rawResult) ? String(rawResult.rootId ?? '') : ''
  const rawList = Array.isArray(rawResult) ? rawResult : (rawResult?.folders ?? [])

  const byId = new Map()
  for (const raw of rawList) {
    if (!raw?.id || !raw?.name) continue
    byId.set(String(raw.id), {
      id: String(raw.id),
      parentId: String(raw.parentId ?? ''),
      name: String(raw.name).trim(),
      folderClass: String(raw.folderClass ?? ''),
      isRootChild: Boolean(raw.isRootChild),
    })
  }

  const pathCache = new Map()
  function computePath(id, visiting = new Set()) {
    if (pathCache.has(id)) return pathCache.get(id)
    const entry = byId.get(id)
    if (!entry) return ''
    if (visiting.has(id)) return entry.name
    visiting.add(id)

    let path = entry.name
    if (!entry.isRootChild && entry.parentId && entry.parentId !== rootId && byId.has(entry.parentId)) {
      const parentPath = computePath(entry.parentId, visiting)
      if (parentPath) {
        path = `${parentPath}/${entry.name}`
      }
    }
    const normalized = normalizeFolderPath(path)
    pathCache.set(id, normalized)
    return normalized
  }

  const result = []
  for (const entry of byId.values()) {
    if (!isMailFolder(entry)) continue
    const path = computePath(entry.id)
    if (!path) continue
    result.push({
      id: entry.id,
      parentId: entry.parentId,
      name: entry.name,
      path,
    })
  }
  return result
}

export function folderMapById(folders) {
  const map = new Map()
  for (const f of folders) {
    map.set(f.id, f)
  }
  return map
}

export async function fetchMailFolders(ewsClient, signal) {
  throwIfAborted(signal)
  const raw = await ewsClient.findFolders(signal)
  return buildFolderTree(raw)
}

export async function listFolders({ ewsClient, state, readableOnly = false, signal }) {
  throwIfAborted(signal)
  const tree = await fetchMailFolders(ewsClient, signal)
  const folders = []
  for (const f of tree) {
    const readable = isFolderAllowed(f.path, state.access).allowed
    if (readableOnly && !readable) continue
    folders.push({
      path: f.path,
      name: f.name,
      readable,
    })
  }
  return { folders }
}

function findCandidatePaths(folders, targetPath) {
  const lower = targetPath.toLowerCase()
  const lastSeg = lower.split('/').pop() || lower
  const scored = []
  for (const f of folders) {
    const pLower = f.path.toLowerCase()
    const nLower = f.name.toLowerCase()
    let score = 0
    if (pLower === lower) score = 100
    else if (nLower === lastSeg) score = 80
    else if (pLower.includes(lower) || lower.includes(pLower)) score = 60
    else if (pLower.includes(lastSeg) || nLower.includes(lastSeg)) score = 40
    if (score > 0) scored.push({ path: f.path, score })
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
  return scored.slice(0, 5).map((s) => s.path)
}

export function resolveFolder({ folders, targetPath }) {
  const normalized = normalizeFolderPath(targetPath)
  if (!normalized) {
    throw new ExchangeError(ERROR_CODES.EMAIL_001, '文件夹路径不能为空', { folder: String(targetPath ?? ''), candidates: [] })
  }
  const exact = folders.filter((f) => f.path === normalized)
  if (exact.length === 1) {
    return exact[0]
  }
  if (exact.length > 1) {
    throw new ExchangeError(ERROR_CODES.PERM_001, `文件夹路径存在歧义，匹配到 ${exact.length} 个同名目录`, {
      folder: normalized,
      candidates: exact.map((f) => f.path),
    })
  }

  // Case-insensitive exact fallback if unique
  const lower = normalized.toLowerCase()
  const ciExact = folders.filter((f) => f.path.toLowerCase() === lower)
  if (ciExact.length === 1) {
    return ciExact[0]
  }
  if (ciExact.length > 1) {
    throw new ExchangeError(ERROR_CODES.PERM_001, '文件夹路径存在大小写歧义', {
      folder: normalized,
      candidates: ciExact.map((f) => f.path),
    })
  }

  const candidates = findCandidatePaths(folders, normalized)
  throw new ExchangeError(ERROR_CODES.EMAIL_001, `未找到文件夹「${normalized}」`, {
    folder: normalized,
    candidates,
  })
}
