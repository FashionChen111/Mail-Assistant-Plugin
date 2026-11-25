import * as ews from 'ews-javascript-api'
import * as xhrModule from '@ewsjs/xhr'
import { ERROR_CODES, ExchangeError, isAbortError, throwIfAborted } from '../errors.js'
import { validateServerUrl } from '../state.js'

const XhrApi = xhrModule.XhrApi ?? xhrModule.default?.XhrApi

export const DEFAULT_RETRY_DELAYS_MS = Object.freeze([1000, 2000, 4000])

const PR_IN_REPLY_TO_ID = 0x1042
const PR_INTERNET_REFERENCES = 0x1039

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

export async function withRetry(fn, { signal, delaysMs = DEFAULT_RETRY_DELAYS_MS, onRetry } = {}) {
  let attempt = 0
  while (true) {
    throwIfAborted(signal)
    try {
      return await fn(attempt)
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

function mapRawItemSummary(item) {
  const bodyValue = item?.Body?.Text ?? item?.body?.text ?? ''
  const textBody = item?.TextBody?.Text ?? ''
  const isHtml = item?.Body?.BodyType === ews.BodyType.HTML
  return {
    id: String(item?.Id?.UniqueId ?? ''),
    parentFolderId: String(item?.ParentFolderId?.UniqueId ?? ''),
    conversationId: String(item?.ConversationId?.UniqueId ?? ''),
    from: String(item?.From?.Address ?? item?.Sender?.Address ?? ''),
    to: extractAddressList(item?.ToRecipients),
    cc: extractAddressList(item?.CcRecipients),
    subject: String(item?.Subject ?? ''),
    bodyText: textBody || (!isHtml ? String(bodyValue) : ''),
    bodyHtml: isHtml ? String(bodyValue) : null,
    receivedTime: safeIsoDate(item?.DateTimeReceived),
    sentTime: safeIsoDate(item?.DateTimeSent ?? item?.DateTimeReceived),
    isRead: Boolean(item?.IsRead),
    isDraft: Boolean(item?.IsDraft),
    isFlagged: item?.Flag?.FlagStatus === ews.ItemFlagStatus.Flagged,
    importance: normalizeImportance(item?.Importance),
    hasAttachments: Boolean(item?.HasAttachments),
  }
}

function mapRawItemDetail(item) {
  const base = mapRawItemSummary(item)
  const rawAttachments = item?.Attachments?.Items ?? item?.Attachments?.items ?? []
  const attachments = []
  for (const att of rawAttachments) {
    attachments.push({
      id: String(att?.Id ?? ''),
      name: String(att?.Name ?? ''),
      size: Number(att?.Size ?? 0),
      content_type: String(att?.ContentType ?? 'application/octet-stream'),
      is_inline: Boolean(att?.IsInline),
    })
  }
  return {
    ...base,
    messageId: String(item?.InternetMessageId ?? ''),
    references: parseReferencesHeader(item?.InternetMessageHeaders),
    attachments,
  }
}

function buildSearchFilter(filterOpts = {}) {
  const filters = []
  const sub = ews.ContainmentMode.Substring
  const ci = ews.ComparisonMode.IgnoreCase

  if (filterOpts.query) {
    const q = String(filterOpts.query)
    const orGroup = new ews.SearchFilter.SearchFilterCollection(ews.LogicalOperator.Or)
    orGroup.Add(new ews.SearchFilter.ContainsSubstring(ews.ItemSchema.Subject, q, sub, ci))
    orGroup.Add(new ews.SearchFilter.ContainsSubstring(ews.ItemSchema.Body, q, sub, ci))
    orGroup.Add(new ews.SearchFilter.ContainsSubstring(ews.EmailMessageSchema.From, q, sub, ci))
    filters.push(orGroup)
  }
  if (filterOpts.from) {
    filters.push(new ews.SearchFilter.ContainsSubstring(ews.EmailMessageSchema.From, String(filterOpts.from), sub, ci))
  }
  if (filterOpts.to) {
    filters.push(new ews.SearchFilter.ContainsSubstring(ews.ItemSchema.DisplayTo, String(filterOpts.to), sub, ci))
  }
  if (filterOpts.subject) {
    filters.push(new ews.SearchFilter.ContainsSubstring(ews.ItemSchema.Subject, String(filterOpts.subject), sub, ci))
  }
  if (filterOpts.unreadOnly) {
    filters.push(new ews.SearchFilter.IsEqualTo(ews.EmailMessageSchema.IsRead, false))
  }
  if (filterOpts.importantOnly) {
    filters.push(new ews.SearchFilter.IsEqualTo(ews.ItemSchema.Importance, ews.Importance.High))
  }
  if (filterOpts.sinceIso) {
    filters.push(new ews.SearchFilter.IsGreaterThanOrEqualTo(ews.ItemSchema.DateTimeReceived, ews.DateTime.Parse(filterOpts.sinceIso)))
  }
  if (filterOpts.untilIso) {
    filters.push(new ews.SearchFilter.IsLessThanOrEqualTo(ews.ItemSchema.DateTimeReceived, ews.DateTime.Parse(filterOpts.untilIso)))
  }
  if (filterOpts.conversationId) {
    filters.push(new ews.SearchFilter.IsEqualTo(ews.ItemSchema.ConversationId, new ews.ConversationId(String(filterOpts.conversationId))))
  }

  if (filters.length === 0) return null
  if (filters.length === 1) return filters[0]
  const andGroup = new ews.SearchFilter.SearchFilterCollection(ews.LogicalOperator.And)
  for (const f of filters) andGroup.Add(f)
  return andGroup
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
          ews.EmailMessageSchema.From,
          ews.EmailMessageSchema.ToRecipients,
          ews.EmailMessageSchema.IsRead,
        ]
        view.PropertySet = new ews.PropertySet(ews.BasePropertySet.IdOnly, props)

        const searchFilter = buildSearchFilter(filterOpts)
        const target = new ews.FolderId(folderId)
        const res = searchFilter
          ? await service.FindItems(target, searchFilter, view)
          : await service.FindItems(target, view)
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
          } catch {
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
        const propSet = new ews.PropertySet(ews.BasePropertySet.FirstClassProperties, [
          ews.ItemSchema.Body,
          ews.ItemSchema.TextBody,
          ews.ItemSchema.Attachments,
          ews.ItemSchema.ParentFolderId,
          ews.ItemSchema.ConversationId,
          ews.ItemSchema.InternetMessageHeaders,
          ews.ItemSchema.Flag,
          ews.ItemSchema.Importance,
          ews.ItemSchema.IsDraft,
          ews.ItemSchema.DateTimeReceived,
          ews.ItemSchema.DateTimeSent,
          ews.EmailMessageSchema.InternetMessageId,
          ews.EmailMessageSchema.From,
          ews.EmailMessageSchema.ToRecipients,
          ews.EmailMessageSchema.CcRecipients,
          ews.EmailMessageSchema.IsRead,
        ])
        propSet.RequestedBodyType = ews.BodyType.HTML
        const msg = await ews.EmailMessage.Bind(service, new ews.ItemId(emailId), propSet)
        return mapRawItemDetail(msg)
      }, signal)
    },

    async findConversationItems(conversationId, folderIds, signal) {
      const results = []
      const seen = new Set()
      for (const folderId of folderIds) {
        throwIfAborted(signal)
        const { items } = await this.findItems(
          folderId,
          { conversationId, limit: 100, includeSnippet: false },
          signal,
        )
        for (const item of items) {
          if (!item.id || seen.has(item.id)) continue
          seen.add(item.id)
          throwIfAborted(signal)
          const detail = await this.getItem(item.id, signal)
          results.push(detail)
        }
      }
      return results
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
        msg.Subject = payload.subject
        for (const addr of payload.to) msg.ToRecipients.Add(addr)
        for (const addr of payload.cc ?? []) msg.CcRecipients.Add(addr)
        for (const addr of payload.bcc ?? []) msg.BccRecipients.Add(addr)
        if (payload.bodyHtml) {
          msg.Body = new ews.MessageBody(ews.BodyType.HTML, payload.bodyHtml)
        } else {
          msg.Body = new ews.MessageBody(ews.BodyType.Text, payload.bodyText)
        }
        if (payload.inReplyToMessageId) {
          msg.SetExtendedProperty(
            new ews.ExtendedPropertyDefinition(PR_IN_REPLY_TO_ID, ews.MapiPropertyType.String),
            payload.inReplyToMessageId,
          )
        }
        if (payload.referencesHeader) {
          msg.SetExtendedProperty(
            new ews.ExtendedPropertyDefinition(PR_INTERNET_REFERENCES, ews.MapiPropertyType.String),
            payload.referencesHeader,
          )
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
        if (patch.subject !== undefined) msg.Subject = patch.subject
        if (patch.to !== undefined) {
          msg.ToRecipients.Clear()
          for (const addr of patch.to) msg.ToRecipients.Add(addr)
        }
        if (patch.cc !== undefined) {
          msg.CcRecipients.Clear()
          for (const addr of patch.cc) msg.CcRecipients.Add(addr)
        }
        if (patch.bcc !== undefined) {
          msg.BccRecipients.Clear()
          for (const addr of patch.bcc) msg.BccRecipients.Add(addr)
        }
        if (patch.bodyHtml !== undefined) {
          msg.Body = new ews.MessageBody(ews.BodyType.HTML, patch.bodyHtml)
        } else if (patch.bodyText !== undefined) {
          msg.Body = new ews.MessageBody(ews.BodyType.Text, patch.bodyText)
        }
        if (patch.inReplyToMessageId) {
          msg.SetExtendedProperty(
            new ews.ExtendedPropertyDefinition(PR_IN_REPLY_TO_ID, ews.MapiPropertyType.String),
            patch.inReplyToMessageId,
          )
        }
        if (patch.referencesHeader) {
          msg.SetExtendedProperty(
            new ews.ExtendedPropertyDefinition(PR_INTERNET_REFERENCES, ews.MapiPropertyType.String),
            patch.referencesHeader,
          )
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
          msg.Flag.FlagStatus = isFlagged ? ews.ItemFlagStatus.Flagged : ews.ItemFlagStatus.NotFlagged
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
