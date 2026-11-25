import { defineTool, ToolArgsError } from '@deepseek-ai/dsh-tools'
import { ERROR_CODES, ExchangeError, isAbortError, throwIfAborted } from '../errors.js'
import { createEwsClient } from '../ews/connection.js'
import { listFolders } from '../ews/folders.js'
import { searchEmails, listRecentEmails, readEmail } from '../ews/search.js'
import { saveDraft, updateDraft, deleteDraft } from '../ews/draft.js'
import { getThread } from '../ews/thread.js'
import { downloadAttachment } from '../ews/attachment.js'
import { moveEmail, markEmail, deleteEmail } from '../ews/mutate.js'
import { parseJiraNotifications } from '../nlp/jira.js'
import { extractTodos } from '../nlp/todo.js'
import { summarizeProjectEmails } from '../nlp/summary.js'
import { getPassword, readState } from '../state.js'
import { createAuditLogger } from '../security/audit.js'

export const TOOL_NAMES = Object.freeze([
  'exchange_list_folders',
  'exchange_search_emails',
  'exchange_read_email',
  'exchange_list_recent_emails',
  'exchange_save_draft',
  'exchange_update_draft',
  'exchange_delete_draft',
  'exchange_get_thread',
  'exchange_parse_jira_notifications',
  'exchange_extract_todos',
  'exchange_summarize_project',
  'exchange_download_attachment',
  'exchange_move_email',
  'exchange_mark_email',
  'exchange_delete_email',
])

export const EXCHANGE_SYSTEM_PROMPT = [
  '## Mail Assistant (Exchange EWS)',
  '- You have access to `exchange_*` tools for this session because the user invoked `@mail`.',
  '- Sending email is intentionally unavailable. Whenever the user asks to write or reply to an email, save a draft with `exchange_save_draft` and inform them to review and send it manually in Outlook/OWA.',
  '- Permanent deletion is forbidden. Only recoverable deletion (moving to Deleted Items) is supported.',
  '- Respect folder privacy boundaries: if a call returns `PERM_001`, inform the user that the folder is restricted and can be adjusted in Mail Assistant settings; if `AUTH_001`, ask them to verify Exchange credentials.',
  '- Output from `exchange_extract_todos`, `exchange_parse_jira_notifications`, and `exchange_summarize_project` are heuristic candidates backed by `source_email_id` and verbatim `context`; verify uncertain items with `exchange_read_email` before presenting authoritative conclusions.',
].join('\n')

const NULLABLE_STRING = { oneOf: [{ type: 'string' }, { type: 'null' }] }

const EMAIL_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    from: { type: 'string', required: true },
    subject: { type: 'string', required: true },
    snippet: { type: 'string', required: true },
    received_time: { type: 'string', required: true },
    is_read: { type: 'boolean', required: true },
    has_attachments: { type: 'boolean', required: true },
    folder: { type: 'string', required: true },
  },
}

const ATTACHMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    size: { type: 'integer', required: true },
    content_type: { type: 'string', required: true },
    is_inline: { type: 'boolean', required: true },
  },
}

const EMAIL_DETAIL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    conversation_id: { type: 'string', required: true },
    message_id: { type: 'string', required: true },
    references: { type: 'array', items: { type: 'string' }, required: true },
    from: { type: 'string', required: true },
    to: { type: 'array', items: { type: 'string' }, required: true },
    cc: { type: 'array', items: { type: 'string' }, required: true },
    subject: { type: 'string', required: true },
    body_text: { type: 'string', required: true },
    body_html: { ...NULLABLE_STRING, required: true },
    body_chars: { type: 'integer', required: true },
    body_truncated: { type: 'boolean', required: true },
    received_time: { type: 'string', required: true },
    is_read: { type: 'boolean', required: true },
    has_attachments: { type: 'boolean', required: true },
    attachments: { type: 'array', items: ATTACHMENT_SCHEMA, required: true },
    folder: { type: 'string', required: true },
  },
}

const DRAFT_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    draft_id: { type: 'string', required: true },
    saved_time: { type: 'string', required: true },
  },
}

function renderJson(_args, value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
}

function isJiraCandidateSummary(email) {
  const from = String(email.from ?? '').toLowerCase()
  const subject = String(email.subject ?? '')
  return (
    from.includes('jira') ||
    from.includes('atlassian') ||
    /\[jira\]/i.test(subject) ||
    /\b[A-Z][A-Z0-9]{1,15}-\d{1,7}\b/.test(subject)
  )
}

export function createExchangeTools({
  ctx,
  config,
  statePath,
  auditPath,
  clientFactory = createEwsClient,
  getPasswordFn = getPassword,
  nowFn = () => new Date(),
}) {
  const audit = createAuditLogger(auditPath)

  async function buildClientFromState(state) {
    const serverUrl = state.account?.serverUrl
    if (!serverUrl) {
      throw new ExchangeError(
        ERROR_CODES.AUTH_001,
        '尚未配置 Exchange 账号信息，请先在 Mail Assistant 设置页填写 EWS 地址与账号',
      )
    }
    const password = await getPasswordFn(ctx)
    if (!password) {
      throw new ExchangeError(
        ERROR_CODES.AUTH_001,
        '未配置 Exchange 密码，请在 Mail Assistant 设置页设置密码或配置 DSH_EXCHANGE_PASSWORD',
      )
    }
    return clientFactory({
      serverUrl,
      email: state.account.email,
      domain: state.account.domain,
      username: state.account.username,
      password,
      timeoutMs: config.requestTimeoutMs,
    })
  }

  async function runAudited({ action, folder = null, emailId = null, signal, handler }) {
    const start = Date.now()
    throwIfAborted(signal)
    let outcome = 'ok'
    let code = null
    let count
    let resolvedFolder = folder
    let resolvedEmailId = emailId

    try {
      const state = await readState(statePath)
      const result = await handler({
        state,
        getClient: () => buildClientFromState(state),
        setAuditMeta(meta) {
          if (meta.folder !== undefined) resolvedFolder = meta.folder
          if (meta.emailId !== undefined) resolvedEmailId = meta.emailId
          if (meta.count !== undefined) count = meta.count
        },
      })
      return result
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) {
        outcome = 'error'
        code = 'ABORTED'
        throw err
      }
      if (err instanceof ExchangeError) {
        outcome = err.code === ERROR_CODES.PERM_001 ? 'denied' : 'error'
        code = err.code
        if (err.details?.folder && !resolvedFolder) {
          resolvedFolder = String(err.details.folder)
        }
      } else {
        outcome = 'error'
        code = err?.code ? String(err.code) : 'INTERNAL_ERROR'
      }
      throw err
    } finally {
      const elapsedMs = Date.now() - start
      await audit.log({
        action,
        folder: resolvedFolder,
        emailId: resolvedEmailId,
        outcome,
        code,
        count,
        elapsedMs,
      }).catch(() => {})
    }
  }

  const tools = [
    defineTool({
      name: 'exchange_list_folders',
      description: 'List Exchange mail folders with full slash-separated paths and whether each folder is readable under the current access policy.',
      parameters: {
        readable_only: {
          type: 'boolean',
          default: false,
          description: 'When true, return only folders permitted by the current access policy.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            folders: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  path: { type: 'string', required: true },
                  name: { type: 'string', required: true },
                  readable: { type: 'boolean', required: true },
                },
              },
            },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'list_folders',
          signal: exec.signal,
          async handler({ state, getClient, setAuditMeta }) {
            const ewsClient = await getClient()
            const res = await listFolders({
              ewsClient,
              state,
              readableOnly: Boolean(args.readable_only),
              signal: exec.signal,
            })
            setAuditMeta({ count: res.folders.length })
            return res
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_search_emails',
      description: 'Search emails inside one permitted Exchange folder, returning summaries ordered newest-first.',
      parameters: {
        folder: { type: 'string', required: true, description: 'Full folder path, e.g. "收件箱" or "认证项目/Widevine".' },
        query: { type: 'string', description: 'Keyword matched across subject, body, and sender.' },
        from: { type: 'string', description: 'Partial match on sender.' },
        to: { type: 'string', description: 'Partial match on recipient.' },
        subject: { type: 'string', description: 'Partial match on subject.' },
        days: { type: 'integer', description: 'Search within the last N days; takes precedence over date_from/date_to.' },
        date_from: { type: 'string', description: 'Start date in YYYY-MM-DD format.' },
        date_to: { type: 'string', description: 'End date in YYYY-MM-DD format.' },
        unread_only: { type: 'boolean', default: false, description: 'Return unread emails only.' },
        important_only: { type: 'boolean', default: false, description: 'Return high-importance emails only.' },
        limit: { type: 'integer', default: 20, description: 'Maximum results to return (clamped to configured limit).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            emails: { type: 'array', items: EMAIL_SUMMARY_SCHEMA, required: true },
            total: { type: 'integer', required: true },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'search_emails',
          folder: args.folder,
          signal: exec.signal,
          async handler({ state, getClient, setAuditMeta }) {
            // Check permission BEFORE even constructing EWS transport if folder is denied.
            const { assertFolderAllowed } = await import('../security/permissions.js')
            const allowedPath = assertFolderAllowed(args.folder, state.access)
            setAuditMeta({ folder: allowedPath })
            const ewsClient = await getClient()
            const res = await searchEmails({
              ewsClient,
              state,
              limits: config,
              args,
              signal: exec.signal,
              now: nowFn(),
            })
            setAuditMeta({ count: res.emails.length })
            return res
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_read_email',
      description: 'Read full email details (text/HTML body, headers, attachment metadata) after re-verifying folder permission.',
      parameters: {
        email_id: { type: 'string', required: true, description: 'Email ID from search or recent listing.' },
        mark_as_read: { type: 'boolean', default: false, description: 'When true, mark the email as read after loading.' },
      },
      output: {
        schema: EMAIL_DETAIL_SCHEMA,
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'read_email',
          emailId: args.email_id,
          signal: exec.signal,
          async handler({ state, getClient, setAuditMeta }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            const detail = await readEmail({
              ewsClient,
              state,
              limits: config,
              args,
              signal: exec.signal,
            })
            setAuditMeta({ folder: detail.folder, emailId: detail.id })
            return detail
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_list_recent_emails',
      description: 'List recent emails across all currently readable Exchange folders, merged and sorted newest-first.',
      parameters: {
        days: { type: 'integer', default: 7, description: 'Lookback window in days (1-90, default 7).' },
        unread_only: { type: 'boolean', default: false, description: 'Return unread emails only.' },
        limit: { type: 'integer', default: 20, description: 'Maximum merged results (clamped to configured limit).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            emails: { type: 'array', items: EMAIL_SUMMARY_SCHEMA, required: true },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'list_recent_emails',
          signal: exec.signal,
          async handler({ state, getClient, setAuditMeta }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            const res = await listRecentEmails({
              ewsClient,
              state,
              limits: config,
              args,
              signal: exec.signal,
              now: nowFn(),
            })
            setAuditMeta({ count: res.emails.length })
            return res
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_save_draft',
      description: 'Save a new email draft to Exchange Drafts. Does NOT send email; the user reviews and sends it manually in Outlook/OWA.',
      parameters: {
        to: { type: 'array', items: { type: 'string' }, required: true, description: 'At least one recipient email address.' },
        cc: { type: 'array', items: { type: 'string' }, description: 'Optional CC email addresses.' },
        bcc: { type: 'array', items: { type: 'string' }, description: 'Optional BCC email addresses.' },
        subject: { type: 'string', required: true, description: 'Non-empty email subject.' },
        body_text: { type: 'string', required: true, description: 'Plain-text email body.' },
        body_html: { type: 'string', description: 'Optional HTML email body.' },
        in_reply_to: { type: 'string', description: 'Optional email ID being replied to for In-Reply-To/References threading.' },
      },
      output: {
        schema: DRAFT_RESULT_SCHEMA,
        render: (_args, value) => [{
          type: 'text',
          text: `${JSON.stringify(value, null, 2)}\n\n草稿已保存至 Exchange 草稿箱，请在 Outlook/OWA 中审核后手动发送。`,
        }],
      },
      async execute(args, exec) {
        return runAudited({
          action: 'save_draft',
          folder: '草稿箱',
          signal: exec.signal,
          async handler({ state, getClient, setAuditMeta }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权保存草稿', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            const saved = await saveDraft({ ewsClient, state, args, signal: exec.signal })
            setAuditMeta({ emailId: saved.draft_id })
            return saved
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_update_draft',
      description: 'Update an existing Exchange draft with only the fields provided. Does NOT send email.',
      parameters: {
        draft_id: { type: 'string', required: true, description: 'Existing draft ID.' },
        to: { type: 'array', items: { type: 'string' }, description: 'Updated recipient list.' },
        cc: { type: 'array', items: { type: 'string' }, description: 'Updated CC list.' },
        bcc: { type: 'array', items: { type: 'string' }, description: 'Updated BCC list.' },
        subject: { type: 'string', description: 'Updated subject.' },
        body_text: { type: 'string', description: 'Updated plain-text body.' },
        body_html: { type: 'string', description: 'Updated HTML body.' },
        in_reply_to: { type: 'string', description: 'Updated reply target email ID.' },
      },
      output: {
        schema: DRAFT_RESULT_SCHEMA,
        render: (_args, value) => [{
          type: 'text',
          text: `${JSON.stringify(value, null, 2)}\n\n草稿已更新，请在 Outlook/OWA 中审核后手动发送。`,
        }],
      },
      async execute(args, exec) {
        return runAudited({
          action: 'update_draft',
          folder: '草稿箱',
          emailId: args.draft_id,
          signal: exec.signal,
          async handler({ state, getClient }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权更新草稿', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            return updateDraft({ ewsClient, state, args, signal: exec.signal })
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_delete_draft',
      description: 'Delete an existing Exchange draft (moves to Deleted Items).',
      parameters: {
        draft_id: { type: 'string', required: true, description: 'Draft ID to delete.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            deleted: { type: 'boolean', required: true },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'delete_draft',
          folder: '草稿箱',
          emailId: args.draft_id,
          signal: exec.signal,
          async handler({ state, getClient }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权删除草稿', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            return deleteDraft({ ewsClient, state, args, signal: exec.signal })
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_get_thread',
      description: 'Reconstruct a full email conversation thread ordered chronologically by sent time and References. Denies the whole thread if any member is in a restricted folder.',
      parameters: {
        email_id: { type: 'string', required: true, description: 'Any email ID in the thread.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            emails: { type: 'array', items: EMAIL_DETAIL_SCHEMA, required: true },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'get_thread',
          emailId: args.email_id,
          signal: exec.signal,
          async handler({ state, getClient, setAuditMeta }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            const res = await getThread({
              ewsClient,
              state,
              limits: config,
              args,
              signal: exec.signal,
            })
            setAuditMeta({ count: res.emails.length, folder: res.emails[0]?.folder ?? null })
            return res
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_parse_jira_notifications',
      description: 'Heuristically parse recent Jira notification emails from readable folders into issue updates (candidates for verification).',
      parameters: {
        days: { type: 'integer', default: 7, description: 'Lookback window in days (1-90, default 7).' },
        filter_by_user: { type: 'boolean', default: true, description: 'When true, prioritize issues referencing the configured mailbox user.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            notifications: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  issue_key: { type: 'string', required: true },
                  summary: { type: 'string', required: true },
                  status_from: { ...NULLABLE_STRING, required: true },
                  status_to: { ...NULLABLE_STRING, required: true },
                  assignee: { ...NULLABLE_STRING, required: true },
                  priority: { ...NULLABLE_STRING, required: true },
                  latest_comment: { ...NULLABLE_STRING, required: true },
                  updated_at: { type: 'string', required: true },
                  source_email_id: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'parse_jira_notifications',
          signal: exec.signal,
          async handler({ state, getClient, setAuditMeta }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            const recent = await listRecentEmails({
              ewsClient,
              state,
              limits: config,
              args: { days: args.days ?? 7, limit: config.maxSearchResults },
              signal: exec.signal,
              now: nowFn(),
            })
            const jiraCandidates = recent.emails.filter(isJiraCandidateSummary)
            const details = []
            for (const summary of jiraCandidates) {
              throwIfAborted(exec.signal)
              const detail = await readEmail({
                ewsClient,
                state,
                limits: config,
                args: { email_id: summary.id, mark_as_read: false },
                signal: exec.signal,
              })
              details.push(detail)
            }
            const res = parseJiraNotifications({
              emails: details,
              userEmail: state.account.email,
              userName: state.account.username,
              filterByUser: args.filter_by_user !== false,
            })
            setAuditMeta({ count: res.notifications.length })
            return res
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_extract_todos',
      description: 'Heuristically extract candidate deadlines, reply requests, and action items with verbatim source context from recent readable emails.',
      parameters: {
        days: { type: 'integer', default: 7, description: 'Lookback window in days (1-90, default 7).' },
        include_unread: { type: 'boolean', default: true, description: 'Include unread emails.' },
        include_important: { type: 'boolean', default: true, description: 'Include high-importance emails.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            todos: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  title: { type: 'string', required: true },
                  source_email_id: { type: 'string', required: true },
                  source_subject: { type: 'string', required: true },
                  deadline: { ...NULLABLE_STRING, required: true },
                  priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], required: true },
                  action_type: { type: 'string', enum: ['reply_required', 'follow_up', 'review', 'submit'], required: true },
                  context: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'extract_todos',
          signal: exec.signal,
          async handler({ state, getClient, setAuditMeta }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹', {
                reason: 'emergency_lock',
              })
            }
            const includeUnread = args.include_unread !== false
            const includeImportant = args.include_important !== false
            const ewsClient = await getClient()
            const recent = await listRecentEmails({
              ewsClient,
              state,
              limits: config,
              args: {
                days: args.days ?? 7,
                unread_only: includeUnread && !includeImportant,
                important_only: !includeUnread && includeImportant,
                limit: Math.min(50, config.maxSearchResults),
              },
              signal: exec.signal,
              now: nowFn(),
            })
            const details = []
            for (const summary of recent.emails) {
              throwIfAborted(exec.signal)
              const detail = await readEmail({
                ewsClient,
                state,
                limits: config,
                args: { email_id: summary.id, mark_as_read: false },
                signal: exec.signal,
              })
              details.push(detail)
            }
            const res = extractTodos({ emails: details, now: nowFn() })
            setAuditMeta({ count: res.todos.length })
            return res
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_summarize_project',
      description: 'Collect recent readable emails matching a certification project keyword and build a traceable heuristic timeline, blocking issues, and next actions summary.',
      parameters: {
        project: { type: 'string', required: true, description: 'Project keyword, e.g. "AirPlay2" or "Widevine".' },
        days: { type: 'integer', default: 30, description: 'Lookback window in days (1-90, default 30).' },
        include_threads: { type: 'boolean', default: true, description: 'Expand matched emails with their permitted conversation threads.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            project: { type: 'string', required: true },
            time_range: {
              type: 'object',
              additionalProperties: false,
              required: true,
              properties: {
                from: { type: 'string', required: true },
                to: { type: 'string', required: true },
                days: { type: 'integer', required: true },
              },
            },
            timeline: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  date: { type: 'string', required: true },
                  summary: { type: 'string', required: true },
                  source_email_id: { type: 'string', required: true },
                  context: { type: 'string', required: true },
                },
              },
            },
            blocking_issues: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  issue: { type: 'string', required: true },
                  status: { type: 'string', required: true },
                  source_email_id: { type: 'string', required: true },
                  context: { type: 'string', required: true },
                },
              },
            },
            next_actions: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  action: { type: 'string', required: true },
                  deadline: { ...NULLABLE_STRING, required: true },
                  priority: { type: 'string', enum: ['urgent', 'high', 'medium', 'low'], required: true },
                  source_email_id: { type: 'string', required: true },
                  context: { type: 'string', required: true },
                },
              },
            },
            related_emails: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  subject: { type: 'string', required: true },
                  from: { type: 'string', required: true },
                  received_time: { type: 'string', required: true },
                  folder: { type: 'string', required: true },
                },
              },
            },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'summarize_project',
          signal: exec.signal,
          async handler({ state, getClient, setAuditMeta }) {
            const project = typeof args.project === 'string' ? args.project.trim() : ''
            if (!project) {
              throw new ToolArgsError(['project 参数必填且不能为空'])
            }
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权访问任何文件夹', {
                reason: 'emergency_lock',
              })
            }
            const days = args.days ?? 30
            const ewsClient = await getClient()
            const recent = await listRecentEmails({
              ewsClient,
              state,
              limits: config,
              args: { days, limit: config.maxSearchResults },
              signal: exec.signal,
              now: nowFn(),
            })
            const needle = project.toLowerCase()
            const matched = recent.emails.filter((e) =>
              String(e.subject ?? '').toLowerCase().includes(needle) ||
              String(e.snippet ?? '').toLowerCase().includes(needle) ||
              String(e.folder ?? '').toLowerCase().includes(needle),
            )

            const detailById = new Map()
            for (const item of matched) {
              throwIfAborted(exec.signal)
              if (detailById.has(item.id)) continue
              if (args.include_threads !== false) {
                try {
                  const thread = await getThread({
                    ewsClient,
                    state,
                    limits: config,
                    args: { email_id: item.id },
                    signal: exec.signal,
                  })
                  for (const msg of thread.emails) {
                    if (!detailById.has(msg.id)) detailById.set(msg.id, msg)
                  }
                  continue
                } catch (err) {
                  if (isAbortError(err) || exec.signal?.aborted) throw err
                  // If thread spans a restricted folder, fall back cleanly to skipping that forbidden thread.
                  if (err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001) {
                    continue
                  }
                  throw err
                }
              }
              const detail = await readEmail({
                ewsClient,
                state,
                limits: config,
                args: { email_id: item.id, mark_as_read: false },
                signal: exec.signal,
              })
              detailById.set(detail.id, detail)
            }

            const summary = summarizeProjectEmails({
              project,
              days,
              emails: [...detailById.values()],
              now: nowFn(),
            })
            setAuditMeta({ count: summary.related_emails.length })
            return summary
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_download_attachment',
      description: 'Download an email attachment up to 25 MiB to disk after checking folder access and size limits. Returns content_base64 for files <= 1 MiB.',
      parameters: {
        email_id: { type: 'string', required: true, description: 'Parent email ID.' },
        attachment_id: { type: 'string', required: true, description: 'Attachment ID from exchange_read_email.' },
        save_path: { type: 'string', description: 'Optional local file path or target directory (defaults to a temporary directory).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            file_path: { type: 'string', required: true },
            size: { type: 'integer', required: true },
            content_base64: { type: 'string' },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'download_attachment',
          emailId: args.email_id,
          signal: exec.signal,
          async handler({ state, getClient }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权下载附件', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            return downloadAttachment({
              ewsClient,
              state,
              limits: config,
              args,
              signal: exec.signal,
            })
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_move_email',
      description: 'Move an email to another permitted Exchange folder (both source and target folders must be allowed).',
      parameters: {
        email_id: { type: 'string', required: true, description: 'Email ID to move.' },
        target_folder: { type: 'string', required: true, description: 'Full path of destination folder.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            moved: { type: 'boolean', required: true },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'move_email',
          folder: args.target_folder,
          emailId: args.email_id,
          signal: exec.signal,
          async handler({ state, getClient }) {
            const { assertFolderAllowed } = await import('../security/permissions.js')
            assertFolderAllowed(args.target_folder, state.access)
            const ewsClient = await getClient()
            return moveEmail({ ewsClient, state, args, signal: exec.signal })
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_mark_email',
      description: 'Mark an email as read/unread and/or flagged/unflagged.',
      parameters: {
        email_id: { type: 'string', required: true, description: 'Email ID to update.' },
        is_read: { type: 'boolean', description: 'Set read status.' },
        is_flagged: { type: 'boolean', description: 'Set flag/star status.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            updated: { type: 'boolean', required: true },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'mark_email',
          emailId: args.email_id,
          signal: exec.signal,
          async handler({ state, getClient }) {
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权标记邮件', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            return markEmail({ ewsClient, state, args, signal: exec.signal })
          },
        })
      },
    }),

    defineTool({
      name: 'exchange_delete_email',
      description: 'Move an email to Deleted Items (recoverable). Permanent deletion (permanent=true) is unconditionally denied.',
      parameters: {
        email_id: { type: 'string', required: true, description: 'Email ID to delete.' },
        permanent: { type: 'boolean', default: false, description: 'Always rejected when true; only recoverable deletion is allowed.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            deleted: { type: 'boolean', required: true },
          },
        },
        render: renderJson,
      },
      async execute(args, exec) {
        return runAudited({
          action: 'delete_email',
          emailId: args.email_id,
          signal: exec.signal,
          async handler({ state, getClient }) {
            if (args.permanent === true) {
              throw new ExchangeError(
                ERROR_CODES.PERM_001,
                '不允许永久删除邮件，仅支持移至「已删除项目」以保留可恢复性',
                { email_id: args.email_id, permanent: true },
              )
            }
            if (state.access.emergencyLock) {
              throw new ExchangeError(ERROR_CODES.PERM_001, '邮箱访问已处于紧急锁定状态，Agent 无权删除邮件', {
                reason: 'emergency_lock',
              })
            }
            const ewsClient = await getClient()
            return deleteEmail({ ewsClient, state, args, signal: exec.signal })
          },
        })
      },
    }),
  ]

  return tools
}

export function registerExchangeTools(ctx, { tools, scope }) {
  const disposers = []
  const when = ({ agent }) => Boolean(agent?.session && scope.isSessionActivated(agent.session))

  for (const def of tools) {
    const dispose = ctx.tools.register(def, { when })
    if (typeof dispose === 'function') disposers.push(dispose)
  }

  const systemPrompt = typeof ctx?.get === 'function'
    ? ctx.get('systemPrompt')
    : ctx?.systemPrompt
  if (systemPrompt && typeof systemPrompt.section === 'function') {
    const disposePrompt = systemPrompt.section({
      name: 'dsh-exchange:instructions',
      order: 3200,
      interpolate: false,
      text: ({ agent }) => (agent?.session && scope.isSessionActivated(agent.session) ? EXCHANGE_SYSTEM_PROMPT : ''),
    })
    if (typeof disposePrompt === 'function') disposers.push(disposePrompt)
  }

  return () => {
    for (const d of disposers.splice(0)) {
      try { d() } catch {}
    }
  }
}
