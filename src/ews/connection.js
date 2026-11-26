import ews from '../../dist/ews.cjs'
import { ERROR_CODES, ExchangeError, isAbortError, throwIfAborted } from '../errors.js'
import { validateServerUrl } from '../state.js'

const { XhrApi } = ews

export const DEFAULT_RETRY_DELAYS_MS = Object.freeze([1000, 2000, 4000])

export function formatNtlmUsername({ email = '', domain = '', username = '' } = {}) {
  const cleanUser = typeof username === 'string' ? username.trim() : ''
  const cleanDomain = typeof domain === 'string' ? domain.trim() : ''
  const cleanEmail = typeof email === 'string' ? email.trim() : ''

  if (cleanUser) {
    if (cleanUser.includes('\\') || cleanUser.includes('@')) {
      return cleanUser
    }
    if (cleanDomain) {
      return `${cleanDomain}\\${cleanUser}`
    }
    return cleanUser
  }

  if (cleanEmail) {
    return cleanEmail
  }

  throw new ExchangeError(ERROR_CODES.AUTH_001, '缺少 Exchange 登录用户名或邮箱地址')
}

export function createEwsTransport({
  serverUrl,
  email = '',
  domain = '',
  username = '',
  password = '',
  timeoutMs = 30000,
  httpsAgent,
  rejectUnauthorized = true,
} = {}) {
  const validUrl = validateServerUrl(serverUrl)
  const loginUser = formatNtlmUsername({ email, domain, username })

  if (typeof password !== 'string' || password.length === 0) {
    throw new ExchangeError(ERROR_CODES.AUTH_001, '未配置 Exchange 密码，请在设置页配置或设置 DSH_EXCHANGE_PASSWORD')
  }

  const xhrOptions = {
    gzip: true,
    decompress: true,
    timeout: timeoutMs,
    rejectUnauthorized,
  }
  if (httpsAgent) {
    xhrOptions.httpsAgent = httpsAgent
  }

  const xhrApi = new XhrApi(xhrOptions)
  xhrApi.useNtlmAuthentication(loginUser, password)

  const service = new ews.ExchangeService(ews.ExchangeVersion.Exchange2013)
  service.XHRApi = xhrApi
  service.Credentials = new ews.WebCredentials(loginUser, password)
  service.Url = new ews.Uri(validUrl)

  return { service, xhrApi, loginUser }
}

function extractErrorText(err) {
  if (!err) return ''
  const parts = []
  if (typeof err.message === 'string') parts.push(err.message)
  if (typeof err.statusText === 'string') parts.push(err.statusText)
  if (typeof err.ResponseCode === 'string') parts.push(err.ResponseCode)
  if (typeof err.ErrorCode === 'string') parts.push(err.ErrorCode)
  if (typeof err.response === 'string') parts.push(err.response.slice(0, 500))
  return parts.join(' | ')
}

export function mapEwsError(err, context = {}) {
  if (isAbortError(err)) {
    return err
  }
  if (err instanceof ExchangeError) {
    return err
  }

  const status = Number(err?.status ?? err?.statusCode ?? err?.response?.status ?? 0)
  const code = String(err?.code ?? err?.cause?.code ?? '')
  const text = extractErrorText(err)

  if (
    status === 401 ||
    status === 403 ||
    /ErrorAccessDenied|ErrorLogonFailure|Unauthorized|NTLM|Authentication|AccountIsLocked/i.test(text)
  ) {
    return new ExchangeError(
      ERROR_CODES.AUTH_001,
      'Exchange 认证失败，请检查邮箱、域、用户名及密码配置',
      { ...context, status: status || undefined },
      { cause: err },
    )
  }

  if (
    status === 429 ||
    status === 503 ||
    /ErrorServerBusy|ErrorTooManyObjectsOpened|ErrorExceededConnectionCount|Too Many Requests|Service Unavailable/i.test(text)
  ) {
    return new ExchangeError(
      ERROR_CODES.RATE_001,
      'Exchange 服务器繁忙或触发速率限制，请稍后重试',
      { ...context, status: status || undefined },
      { cause: err },
    )
  }

  if (
    /ErrorItemNotFound|ErrorFolderNotFound|ErrorInvalidIdMalformed|ErrorInvalidId|ErrorInvalidChangeKey/i.test(text)
  ) {
    return new ExchangeError(
      ERROR_CODES.EMAIL_001,
      '指定的邮件或文件夹不存在，可能已被移动或删除',
      { ...context },
      { cause: err },
    )
  }

  if (/ENOTFOUND|EAI_AGAIN/i.test(code) || /ENOTFOUND|getaddrinfo/i.test(text)) {
    return new ExchangeError(
      ERROR_CODES.NET_001,
      '无法解析 Exchange 服务器域名（DNS 失败）',
      { ...context, category: 'dns', errno: code || undefined },
      { cause: err },
    )
  }

  if (
    /CERT|TLS|SSL|UNABLE_TO_VERIFY|SELF_SIGNED|ERR_TLS/i.test(code) ||
    /certificate|self-signed|unable to verify|ssl/i.test(text)
  ) {
    return new ExchangeError(
      ERROR_CODES.NET_001,
      'Exchange 服务器 HTTPS 证书校验失败',
      { ...context, category: 'tls', errno: code || undefined },
      { cause: err },
    )
  }

  if (
    /ETIMEDOUT|ECONNABORTED|UND_ERR_CONNECT_TIMEOUT/i.test(code) ||
    /timeout|timed out/i.test(text)
  ) {
    return new ExchangeError(
      ERROR_CODES.NET_001,
      '连接 Exchange 服务器超时',
      { ...context, category: 'timeout', errno: code || undefined },
      { cause: err },
    )
  }

  if (/ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ENETUNREACH|EPIPE/i.test(code)) {
    return new ExchangeError(
      ERROR_CODES.NET_001,
      '无法连接到 Exchange 服务器端口，请检查网络或防火墙策略',
      { ...context, category: 'connection', errno: code || undefined },
      { cause: err },
    )
  }

  if (/Cannot read properties of undefined \(reading 'headers'\)|www-authenticate not found/i.test(text)) {
    return new ExchangeError(
      ERROR_CODES.NET_001,
      'Exchange 服务器未返回 NTLM 握手响应，请检查服务器地址、HTTPS 证书或网络连通性',
      { ...context, category: 'connection' },
      { cause: err },
    )
  }

  return new ExchangeError(
    ERROR_CODES.NET_001,
    `Exchange 请求失败: ${text || '未知网络错误'}`,
    { ...context, status: status || undefined, errno: code || undefined },
    { cause: err },
  )
}

function abortableSleep(ms, signal) {
  throwIfAborted(signal)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function raceWithAbort(promise, signal) {
  if (!signal) return promise
  if (signal.aborted) {
    promise.catch(() => {})
    return Promise.reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
  }
  return new Promise((resolve, reject) => {
    function onAbort() {
      promise.catch(() => {})
      reject(signal.reason ?? new DOMException('The operation was aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (val) => {
        signal.removeEventListener('abort', onAbort)
        resolve(val)
      },
      (err) => {
        signal.removeEventListener('abort', onAbort)
        reject(err)
      },
    )
  })
}

export async function withRetry(fn, { signal, delaysMs = DEFAULT_RETRY_DELAYS_MS, onRetry } = {}) {
  let attempt = 0
  while (true) {
    throwIfAborted(signal)
    try {
      return await raceWithAbort(Promise.resolve().then(() => fn(attempt)), signal)
    } catch (rawErr) {
      if (isAbortError(rawErr) || signal?.aborted) {
        if (signal?.aborted && signal.reason !== undefined) {
          throw signal.reason
        }
        throw rawErr
      }
      const mapped = mapEwsError(rawErr)
      if (mapped.code !== ERROR_CODES.RATE_001 || attempt >= delaysMs.length) {
        throw mapped
      }
      const delayMs = delaysMs[attempt]
      attempt += 1
      if (typeof onRetry === 'function') {
        onRetry(mapped, attempt, delayMs)
      }
      await abortableSleep(delayMs, signal)
    }
  }
}

function safeIsoDate(ewsDate) {
  if (!ewsDate) return new Date(0).toISOString()
  if (typeof ewsDate === 'string') {
    const parsed = new Date(ewsDate)
    return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString()
  }
  if (typeof ewsDate.ToISOString === 'function') {
    return ewsDate.ToISOString()
  }
  if (ewsDate.MomentDate && typeof ewsDate.MomentDate.toISOString === 'function') {
    return ewsDate.MomentDate.toISOString()
  }
  if (ewsDate instanceof Date) {
    return ewsDate.toISOString()
  }
  return new Date(0).toISOString()
}

function extractAddressList(collection) {
  const items = collection?.Items ?? collection?.items ?? (Array.isArray(collection) ? collection : [])
  const out = []
  for (const addr of items) {
    const value = addr?.Address ?? addr?.address ?? (typeof addr === 'string' ? addr : '')
    if (value) out.push(String(value))
  }
  return out
}

function parseReferencesHeader(headers) {
  const items = headers?.Items ?? headers?.items ?? (Array.isArray(headers) ? headers : [])
  const refs = []
  const seen = new Set()
  for (const header of items) {
    const name = String(header?.Name ?? header?.name ?? '').toLowerCase()
    if (name !== 'references' && name !== 'in-reply-to') continue
    const val = String(header?.Value ?? header?.value ?? '')
    const matches = val.match(/<[^>]+>/g) ?? val.split(/\s+/).filter(Boolean)
    for (const token of matches) {
      if (!seen.has(token)) {
        seen.add(token)
        refs.push(token)
      }
    }
  }
  return refs
}

function normalizeImportance(raw) {
  if (raw === ews.Importance.High || raw === 'High' || raw === 2) return 'high'
  if (raw === ews.Importance.Low || raw === 'Low' || raw === 0) return 'low'
  return 'normal'
}

function safeProp(getter, fallback = undefined) {
  try {
    const val = getter()
    return val === undefined ? fallback : val
  } catch {
    return fallback
  }
}

function mapRawItemSummary(item) {
  const bodyObj = safeProp(() => item?.Body, null)
  const bodyValue = safeProp(() => bodyObj?.Text, '')
  const textBody = safeProp(() => item?.TextBody?.Text, '')
  const isHtml = safeProp(() => bodyObj?.BodyType, null) === ews.BodyType.HTML
  const fromAddr = safeProp(() => item?.From?.Address, '') || safeProp(() => item?.Sender?.Address, '')
  const toList = extractAddressList(safeProp(() => item?.ToRecipients, null))
  const displayTo = safeProp(() => item?.DisplayTo, '')
  const resolvedTo = toList.length > 0
    ? toList
    : (displayTo ? String(displayTo).split(/[;,]/).map((s) => s.trim()).filter(Boolean) : [])

  return {
    id: String(safeProp(() => item?.Id?.UniqueId, '')),
    parentFolderId: String(safeProp(() => item?.ParentFolderId?.UniqueId, '')),
    conversationId: String(safeProp(() => item?.ConversationId?.UniqueId, '')),
    from: String(fromAddr || ''),
    to: resolvedTo,
    cc: extractAddressList(safeProp(() => item?.CcRecipients, null)),
    subject: String(safeProp(() => item?.Subject, '')),
    bodyText: textBody || (!isHtml ? String(bodyValue || '') : ''),
    bodyHtml: isHtml ? String(bodyValue || '') : null,
    receivedTime: safeIsoDate(safeProp(() => item?.DateTimeReceived, null)),
    sentTime: safeIsoDate(safeProp(() => item?.DateTimeSent, null) ?? safeProp(() => item?.DateTimeReceived, null)),
    isRead: Boolean(safeProp(() => item?.IsRead, false)),
    isDraft: Boolean(safeProp(() => item?.IsDraft, false)),
    isFlagged: safeProp(() => item?.Flag?.FlagStatus, null) === ews.ItemFlagStatus.Flagged,
    importance: normalizeImportance(safeProp(() => item?.Importance, null)),
    hasAttachments: Boolean(safeProp(() => item?.HasAttachments, false)),
  }
}

function mapRawItemDetail(item) {
  const base = mapRawItemSummary(item)
  const rawAttachments = safeProp(() => item?.Attachments?.Items, null)
    ?? safeProp(() => item?.Attachments?.items, [])
  const attachments = []
  for (const att of rawAttachments) {
    attachments.push({
      id: String(safeProp(() => att?.Id, '')),
      name: String(safeProp(() => att?.Name, '')),
      size: Number(safeProp(() => att?.Size, 0)),
      content_type: String(safeProp(() => att?.ContentType, 'application/octet-stream')),
      is_inline: Boolean(safeProp(() => att?.IsInline, false)),
    })
  }
  const headerRefs = parseReferencesHeader(safeProp(() => item?.InternetMessageHeaders, null))
  const directRefsRaw = [
    safeProp(() => item?.References, ''),
    safeProp(() => item?.InReplyTo, ''),
  ].filter(Boolean).join(' ')
  const combinedRefs = [...headerRefs]
  const refSeen = new Set(combinedRefs)
  if (directRefsRaw) {
    const tokens = directRefsRaw.match(/<[^>]+>/g) ?? directRefsRaw.split(/\s+/).filter(Boolean)
    for (const tok of tokens) {
      if (!refSeen.has(tok)) {
        refSeen.add(tok)
        combinedRefs.push(tok)
      }
    }
  }
  return {
    ...base,
    messageId: String(safeProp(() => item?.InternetMessageId, '')),
    references: combinedRefs,
    attachments,
  }
}

export function escapeXmlText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function toEwsEmailAddress(raw) {
  const cleaned = String(raw ?? '').trim()
  const match = cleaned.match(/^"?([^"<>]*?)"?\s*<\s*([^<>\s]+)\s*>$/)
  if (match) {
    const displayName = match[1].trim()
    const addr = match[2].trim()
    if (displayName) {
      return new ews.EmailAddress(escapeXmlText(displayName), escapeXmlText(addr))
    }
    return new ews.EmailAddress(escapeXmlText(addr))
  }
  return new ews.EmailAddress(escapeXmlText(cleaned))
}

function formatAqsQuoted(value) {
  const clean = String(value ?? '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/"/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return clean ? `"${clean}"` : ''
}

function formatAqsIso(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function buildAqsQueryString(filterOpts = {}) {
  const clauses = []
  if (filterOpts.from) {
    const q = formatAqsQuoted(filterOpts.from)
    if (q) clauses.push(`from:${q}`)
  }
  if (filterOpts.to) {
    const q = formatAqsQuoted(filterOpts.to)
    if (q) clauses.push(`to:${q}`)
  }
  if (filterOpts.subject) {
    const q = formatAqsQuoted(filterOpts.subject)
    if (q) clauses.push(`subject:${q}`)
  }
  if (filterOpts.query) {
    const q = formatAqsQuoted(filterOpts.query)
    if (q) clauses.push(q)
  }
  if (filterOpts.unreadOrImportant) {
    clauses.push('(isread:false OR importance:high)')
  } else {
    if (filterOpts.unreadOnly) clauses.push('isread:false')
    if (filterOpts.importantOnly) clauses.push('importance:high')
  }
  if (filterOpts.sinceIso) {
    const ts = formatAqsIso(filterOpts.sinceIso)
    if (ts) clauses.push(`received>=${ts}`)
  }
  if (filterOpts.untilIso) {
    const ts = formatAqsIso(filterOpts.untilIso)
    if (ts) clauses.push(`received<=${ts}`)
  }
  return escapeXmlText(clauses.join(' '))
}

export function buildSearchFilter(filterOpts = {}) {
  const filters = []
  const sub = ews.ContainmentMode.Substring
  const ci = ews.ComparisonMode.IgnoreCase

  if (filterOpts.to) {
    filters.push(new ews.SearchFilter.ContainsSubstring(ews.ItemSchema.DisplayTo, escapeXmlText(filterOpts.to), sub, ci))
  }
  if (filterOpts.subject) {
    filters.push(new ews.SearchFilter.ContainsSubstring(ews.ItemSchema.Subject, escapeXmlText(filterOpts.subject), sub, ci))
  }
  if (filterOpts.unreadOrImportant) {
    const orGroup = new ews.SearchFilter.SearchFilterCollection(ews.LogicalOperator.Or)
    orGroup.Add(new ews.SearchFilter.IsEqualTo(ews.EmailMessageSchema.IsRead, false))
    orGroup.Add(new ews.SearchFilter.IsEqualTo(ews.ItemSchema.Importance, ews.Importance[ews.Importance.High]))
    filters.push(orGroup)
  } else {
    if (filterOpts.unreadOnly) {
      filters.push(new ews.SearchFilter.IsEqualTo(ews.EmailMessageSchema.IsRead, false))
    }
    if (filterOpts.importantOnly) {
      filters.push(new ews.SearchFilter.IsEqualTo(ews.ItemSchema.Importance, ews.Importance[ews.Importance.High]))
    }
  }
  if (filterOpts.sinceIso) {
    filters.push(new ews.SearchFilter.IsGreaterThanOrEqualTo(ews.ItemSchema.DateTimeReceived, ews.DateTime.Parse(filterOpts.sinceIso)))
  }
  if (filterOpts.untilIso) {
    filters.push(new ews.SearchFilter.IsLessThanOrEqualTo(ews.ItemSchema.DateTimeReceived, ews.DateTime.Parse(filterOpts.untilIso)))
  }

  if (filters.length === 0) return null
  if (filters.length === 1) return filters[0]
  const andGroup = new ews.SearchFilter.SearchFilterCollection(ews.LogicalOperator.And)
  for (const f of filters) andGroup.Add(f)
  return andGroup
}

function buildDetailPropertySet() {
  const propSet = new ews.PropertySet(ews.BasePropertySet.FirstClassProperties, [
    ews.ItemSchema.Body,
    ews.ItemSchema.TextBody,
    ews.ItemSchema.Attachments,
    ews.ItemSchema.ParentFolderId,
    ews.ItemSchema.ConversationId,
    ews.ItemSchema.InternetMessageHeaders,
    ews.ItemSchema.InReplyTo,
    ews.ItemSchema.Flag,
    ews.ItemSchema.Importance,
    ews.ItemSchema.IsDraft,
    ews.ItemSchema.DateTimeReceived,
    ews.ItemSchema.DateTimeSent,
    ews.EmailMessageSchema.InternetMessageId,
    ews.EmailMessageSchema.References,
    ews.EmailMessageSchema.From,
    ews.EmailMessageSchema.ToRecipients,
    ews.EmailMessageSchema.CcRecipients,
    ews.EmailMessageSchema.IsRead,
  ])
  propSet.RequestedBodyType = ews.BodyType.HTML
  return propSet
}

export function createEwsClient(options = {}) {
  const {
    serverUrl,
    email,
    domain,
    username,
    password,
    timeoutMs = 30000,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
    httpsAgent,
    rejectUnauthorized = true,
  } = options

  const { service } = createEwsTransport({
    serverUrl,
    email,
    domain,
    username,
    password,
    timeoutMs,
    httpsAgent,
    rejectUnauthorized,
  })

  const run = (fn, signal) => withRetry(fn, { signal, delaysMs: retryDelaysMs })

  return {
    async findFolders(signal) {
      return run(async () => {
        const rootFolder = await ews.Folder.Bind(service, ews.WellKnownFolderName.MsgFolderRoot)
        const rootId = String(rootFolder?.Id?.UniqueId ?? '')
        const allFolders = []
        let offset = 0
        const pageSize = 200
        while (true) {
          throwIfAborted(signal)
          const view = new ews.FolderView(pageSize, offset)
          view.Traversal = ews.FolderTraversal.Deep
          view.PropertySet = new ews.PropertySet(ews.BasePropertySet.IdOnly, [
            ews.FolderSchema.DisplayName,
            ews.FolderSchema.ParentFolderId,
            ews.FolderSchema.FolderClass,
          ])
          const res = await service.FindFolders(ews.WellKnownFolderName.MsgFolderRoot, view)
          const batch = res?.Folders ?? []
          for (const folder of batch) {
            allFolders.push({
              id: String(folder?.Id?.UniqueId ?? ''),
              parentId: String(folder?.ParentFolderId?.UniqueId ?? ''),
              name: String(folder?.DisplayName ?? ''),
              folderClass: folder?.FolderClass ? String(folder.FolderClass) : '',
              isRootChild: String(folder?.ParentFolderId?.UniqueId ?? '') === rootId,
            })
          }
          if (!res?.MoreAvailable || batch.length === 0) break
          offset += batch.length
        }
        return { rootId, folders: allFolders }
      }, signal)
    },

    async findItems(folderId, filterOpts = {}, signal) {
      return run(async () => {
        const limit = Math.max(1, Number(filterOpts.limit ?? 20))
        const view = new ews.ItemView(limit, 0)
        view.OrderBy.Add(ews.ItemSchema.DateTimeReceived, ews.SortDirection.Descending)
        const props = [
          ews.ItemSchema.Subject,
          ews.ItemSchema.DateTimeReceived,
          ews.ItemSchema.DateTimeSent,
          ews.ItemSchema.HasAttachments,
          ews.ItemSchema.ParentFolderId,
          ews.ItemSchema.ConversationId,
          ews.ItemSchema.Importance,
          ews.ItemSchema.IsDraft,
          ews.ItemSchema.DisplayTo,
          ews.EmailMessageSchema.From,
          ews.EmailMessageSchema.IsRead,
        ]
        view.PropertySet = new ews.PropertySet(ews.BasePropertySet.IdOnly, props)

        const target = new ews.FolderId(folderId)
        const useAqs = Boolean(filterOpts.query || filterOpts.from)
        let res
        if (useAqs) {
          const queryString = buildAqsQueryString(filterOpts)
          res = queryString
            ? await service.FindItems(target, queryString, view)
            : await service.FindItems(target, view)
        } else {
          const searchFilter = buildSearchFilter(filterOpts)
          res = searchFilter
            ? await service.FindItems(target, searchFilter, view)
            : await service.FindItems(target, view)
        }
        const rawItems = res?.Items ?? []

        // Load lightweight body preview for snippets if items were returned.
        if (rawItems.length > 0 && filterOpts.includeSnippet !== false) {
          throwIfAborted(signal)
          const snippetSet = new ews.PropertySet(ews.BasePropertySet.IdOnly, [
            ews.ItemSchema.Body,
            ews.ItemSchema.TextBody,
          ])
          snippetSet.RequestedBodyType = ews.BodyType.Text
          try {
            await service.LoadPropertiesForItems(rawItems, snippetSet)
          } catch (err) {
            if (isAbortError(err) || signal?.aborted) throw err
            // Fall back to empty snippets if batch body preview fails on a partial item.
          }
        }

        return {
          items: rawItems.map(mapRawItemSummary),
          total: Number(res?.TotalCount ?? rawItems.length),
        }
      }, signal)
    },

    async getItem(emailId, signal) {
      return run(async () => {
        const propSet = buildDetailPropertySet()
        const msg = await ews.EmailMessage.Bind(service, new ews.ItemId(emailId), propSet)
        return mapRawItemDetail(msg)
      }, signal)
    },

    async findConversationItems(conversationId, _folderIds, signal) {
      return run(async () => {
        const propSet = buildDetailPropertySet()
        // Query all folders (empty foldersToIgnore) so thread.js fails closed if any item is in a restricted folder.
        const convResp = await service.GetConversationItems(
          new ews.ConversationId(String(conversationId)),
          propSet,
          null,
          [],
          ews.ConversationSortOrder.DateOrderAscending,
        )
        const nodes = convResp?.ConversationNodes?.Items ?? convResp?.ConversationNodes ?? []
        const results = []
        const seen = new Set()
        for (const node of nodes) {
          const items = node?.Items ?? []
          for (const rawItem of items) {
            const detail = mapRawItemDetail(rawItem)
            if (!detail.id || seen.has(detail.id)) continue
            seen.add(detail.id)
            results.push(detail)
          }
        }
        return results
      }, signal)
    },

    async downloadAttachment(emailId, attachmentId, signal) {
      return run(async () => {
        const propSet = new ews.PropertySet(ews.BasePropertySet.IdOnly, [
          ews.ItemSchema.Attachments,
          ews.ItemSchema.ParentFolderId,
        ])
        const msg = await ews.EmailMessage.Bind(service, new ews.ItemId(emailId), propSet)
        const items = msg?.Attachments?.Items ?? []
        const target = items.find((att) => String(att?.Id ?? '') === String(attachmentId))
        if (!target) {
          throw new ExchangeError(ERROR_CODES.EMAIL_001, '指定的附件不存在', {
            email_id: emailId,
            attachment_id: attachmentId,
          })
        }
        throwIfAborted(signal)
        if (target instanceof ews.ItemAttachment) {
          // Use GetAttachments([id]) instead of target.Load() to bypass ews-javascript-api@0.15.3 ItemAttachment.Validate() NPE when Item is unloaded.
          const responses = await service.GetAttachments(
            [String(target.Id ?? attachmentId)],
            null,
            [ews.ItemSchema.MimeContent],
          )
          const loadedAtt = safeProp(() => responses.__thisIndexer(0)?.Attachment, null)
          const mimeBase64 = safeProp(() => loadedAtt?.Item?.MimeContent?.Content, '')
          if (typeof mimeBase64 !== 'string' || mimeBase64.length === 0) {
            throw new ExchangeError(
              ERROR_CODES.ATT_001,
              '暂不支持下载此嵌套邮件附件 (ItemAttachment) 或其不包含可导出的 MIME 内容',
              { email_id: emailId, attachment_id: attachmentId, attachment_type: 'ItemAttachment' },
            )
          }
          const buffer = Buffer.from(mimeBase64, 'base64')
          return {
            id: String(loadedAtt?.Id ?? target.Id ?? attachmentId),
            name: String(loadedAtt?.Name ?? target.Name ?? 'message.eml'),
            size: buffer.byteLength,
            contentType: String(loadedAtt?.ContentType || target.ContentType || 'message/rfc822'),
            isInline: Boolean(loadedAtt?.IsInline ?? target.IsInline),
            buffer,
          }
        }
        await target.Load()
        const base64 = typeof target.Base64Content === 'string' ? target.Base64Content : ''
        const buffer = Buffer.from(base64, 'base64')
        return {
          id: String(target.Id ?? attachmentId),
          name: String(target.Name ?? ''),
          size: buffer.byteLength,
          contentType: String(target.ContentType ?? 'application/octet-stream'),
          isInline: Boolean(target.IsInline),
          buffer,
        }
      }, signal)
    },

    async saveDraft(payload, signal) {
      return run(async () => {
        const msg = new ews.EmailMessage(service)
        msg.Subject = escapeXmlText(payload.subject)
        for (const addr of payload.to) msg.ToRecipients.Add(toEwsEmailAddress(addr))
        for (const addr of payload.cc ?? []) msg.CcRecipients.Add(toEwsEmailAddress(addr))
        for (const addr of payload.bcc ?? []) msg.BccRecipients.Add(toEwsEmailAddress(addr))
        if (payload.bodyHtml) {
          msg.Body = new ews.MessageBody(ews.BodyType.HTML, escapeXmlText(payload.bodyHtml))
        } else {
          msg.Body = new ews.MessageBody(ews.BodyType.Text, escapeXmlText(payload.bodyText))
        }
        if (payload.inReplyToMessageId) {
          msg.InReplyTo = escapeXmlText(payload.inReplyToMessageId)
        }
        if (payload.referencesHeader) {
          msg.References = escapeXmlText(payload.referencesHeader)
        }
        // Draft-only by design: ONLY Save to Drafts, NEVER Send / SendAndSaveCopy.
        await msg.Save(ews.WellKnownFolderName.Drafts)
        return {
          draftId: String(msg.Id?.UniqueId ?? ''),
          savedTime: new Date().toISOString(),
        }
      }, signal)
    },

    async updateDraft(draftId, patch, signal) {
      return run(async () => {
        const msg = await ews.EmailMessage.Bind(service, new ews.ItemId(draftId))
        if (!msg.IsDraft) {
          throw new ExchangeError(ERROR_CODES.PERM_001, '只能更新草稿箱中的草稿邮件', { draft_id: draftId })
        }
        if (patch.subject !== undefined) msg.Subject = escapeXmlText(patch.subject)
        if (patch.to !== undefined) {
          msg.ToRecipients.Clear()
          for (const addr of patch.to) msg.ToRecipients.Add(toEwsEmailAddress(addr))
        }
        if (patch.cc !== undefined) {
          msg.CcRecipients.Clear()
          for (const addr of patch.cc) msg.CcRecipients.Add(toEwsEmailAddress(addr))
        }
        if (patch.bcc !== undefined) {
          msg.BccRecipients.Clear()
          for (const addr of patch.bcc) msg.BccRecipients.Add(toEwsEmailAddress(addr))
        }
        if (patch.bodyHtml !== undefined) {
          msg.Body = new ews.MessageBody(ews.BodyType.HTML, escapeXmlText(patch.bodyHtml))
        } else if (patch.bodyText !== undefined) {
          msg.Body = new ews.MessageBody(ews.BodyType.Text, escapeXmlText(patch.bodyText))
        }
        if (patch.inReplyToMessageId) {
          msg.InReplyTo = escapeXmlText(patch.inReplyToMessageId)
        }
        if (patch.referencesHeader) {
          msg.References = escapeXmlText(patch.referencesHeader)
        }
        await msg.Update(ews.ConflictResolutionMode.AlwaysOverwrite)
        return {
          draftId: String(msg.Id?.UniqueId ?? draftId),
          savedTime: new Date().toISOString(),
        }
      }, signal)
    },

    async deleteDraft(draftId, signal) {
      return run(async () => {
        const msg = await ews.EmailMessage.Bind(service, new ews.ItemId(draftId))
        if (!msg.IsDraft) {
          throw new ExchangeError(ERROR_CODES.PERM_001, '只能删除草稿邮件', { draft_id: draftId })
        }
        await msg.Delete(ews.DeleteMode.MoveToDeletedItems)
        return { deleted: true }
      }, signal)
    },

    async moveItem(emailId, targetFolderId, signal) {
      return run(async () => {
        const msg = await ews.EmailMessage.Bind(service, new ews.ItemId(emailId))
        await msg.Move(new ews.FolderId(targetFolderId))
        return { moved: true }
      }, signal)
    },

    async markItem(emailId, { isRead, isFlagged }, signal) {
      return run(async () => {
        const msg = await ews.EmailMessage.Bind(service, new ews.ItemId(emailId))
        if (typeof isRead === 'boolean') {
          msg.IsRead = isRead
        }
        if (typeof isFlagged === 'boolean') {
          const flag = safeProp(() => msg.Flag, null) ?? new ews.Flag()
          flag.FlagStatus = isFlagged ? ews.ItemFlagStatus.Flagged : ews.ItemFlagStatus.NotFlagged
          msg.Flag = flag
        }
        await msg.Update(ews.ConflictResolutionMode.AlwaysOverwrite)
        return { updated: true }
      }, signal)
    },

    async deleteItem(emailId, signal) {
      return run(async () => {
        const msg = await ews.EmailMessage.Bind(service, new ews.ItemId(emailId))
        // Recoverable delete ONLY: MoveToDeletedItems. Never HardDelete.
        await msg.Delete(ews.DeleteMode.MoveToDeletedItems)
        return { deleted: true }
      }, signal)
    },
  }
}
