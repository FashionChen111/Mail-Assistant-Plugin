const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9]{1,15}-\d{1,7})\b/

const PRIORITY_RANK = Object.freeze({
  blocker: 0,
  critical: 0,
  highest: 0,
  紧急: 0,
  最高: 0,
  high: 1,
  高: 1,
  medium: 2,
  normal: 2,
  中: 2,
  low: 3,
  lowest: 4,
  低: 3,
})

function isJiraEmail(email) {
  const from = String(email?.from ?? '').toLowerCase()
  const subject = String(email?.subject ?? '')
  if (from.includes('jira') || from.includes('atlassian')) return true
  if (/\[jira\]/i.test(subject)) return true
  if (ISSUE_KEY_RE.test(subject) && /(status|状态|assignee|指派|comment|评论|jira)/i.test(String(email?.body_text ?? email?.snippet ?? ''))) {
    return true
  }
  return false
}

function cleanJiraSummary(subject, issueKey) {
  let out = String(subject ?? '')
    .replace(/^\s*(?:(?:re|fw|fwd)\s*[:：]\s*)+/i, '')
    .replace(/\[jira\]/gi, '')
    .replace(new RegExp(`[\\(\\[]?\\s*${issueKey}\\s*[\\)\\]]?\\s*[:：-]?`, 'i'), '')
    .replace(/\s+/g, ' ')
    .trim()
  return out || subject || issueKey
}

function extractStatusTransition(body) {
  const patterns = [
    /(?:status|状态)\s*[:：]\s*([^\n\r→>-]+?)\s*(?:->|→|=>|to|变更为)\s*([^\n\r(（]+)/i,
    /(?:from|由)\s+["'「]?([^"'\n\r→>-]+?)["'」]?\s+(?:to|变为|改为)\s+["'「]?([^"'\n\r(（]+?)["'」]?(?:\s|$)/i,
  ]
  for (const re of patterns) {
    const m = body.match(re)
    if (m) {
      return {
        status_from: m[1].trim() || null,
        status_to: m[2].trim() || null,
      }
    }
  }
  return { status_from: null, status_to: null }
}

function extractField(body, patterns) {
  for (const re of patterns) {
    const m = body.match(re)
    if (m && m[1]?.trim()) {
      return m[1].trim()
    }
  }
  return null
}

function extractLatestComment(body) {
  const m = body.match(/(?:latest\s+comment|commented|comment|最新评论|评论)\s*[:：]\s*(.+)/i)
  if (!m) return null
  const text = m[1].replace(/^["'“”「」]+|["'“”「」]+$/g, '').trim()
  return text ? text.slice(0, 300) : null
}

export function parseJiraEmail(email) {
  if (!email || !isJiraEmail(email)) return null
  const subject = String(email.subject ?? '')
  const body = String(email.body_text ?? email.snippet ?? '')

  const keyMatch = subject.match(ISSUE_KEY_RE) ?? body.match(ISSUE_KEY_RE)
  if (!keyMatch) return null

  const issueKey = keyMatch[1]
  const { status_from, status_to } = extractStatusTransition(body)
  const assignee = extractField(body, [
    /(?:assignee|指派人|经办人|负责人)\s*[:：]\s*([^\n\r]+)/i,
    /assigned\s+to\s+([^\n\r.]+)/i,
  ])
  const priority = extractField(body, [
    /(?:priority|优先级)\s*[:：]\s*([^\n\r]+)/i,
  ])
  const latest_comment = extractLatestComment(body)

  return {
    issue_key: issueKey,
    summary: cleanJiraSummary(subject, issueKey),
    status_from,
    status_to,
    assignee,
    priority,
    latest_comment,
    updated_at: String(email.received_time ?? email.receivedTime ?? ''),
    source_email_id: String(email.id ?? ''),
  }
}

function isRelevantToUser(email, parsed, { userEmail = '', userName = '' }) {
  const tokens = []
  const cleanEmail = String(userEmail || '').trim().toLowerCase()
  const cleanUser = String(userName || '').trim().toLowerCase()
  if (cleanEmail) {
    tokens.push(cleanEmail)
    const local = cleanEmail.split('@')[0]
    if (local && local.length >= 2) tokens.push(local)
  }
  if (cleanUser) {
    const shortUser = cleanUser.includes('\\') ? cleanUser.split('\\').pop() : cleanUser
    if (shortUser && shortUser.length >= 2) tokens.push(shortUser)
  }
  if (tokens.length === 0) return true

  const haystack = [
    parsed.assignee ?? '',
    parsed.latest_comment ?? '',
    String(email.body_text ?? ''),
    String(email.subject ?? ''),
  ].join('\n').toLowerCase()

  return tokens.some((tok) => haystack.includes(tok))
}

function priorityRank(priority) {
  if (!priority) return 5
  const key = String(priority).trim().toLowerCase()
  return key in PRIORITY_RANK ? PRIORITY_RANK[key] : 4
}

export function parseJiraNotifications({ emails = [], userEmail = '', userName = '', filterByUser = true } = {}) {
  const notifications = []
  for (const email of emails) {
    const parsed = parseJiraEmail(email)
    if (!parsed) continue
    if (filterByUser && !isRelevantToUser(email, parsed, { userEmail, userName })) {
      continue
    }
    notifications.push(parsed)
  }

  notifications.sort((a, b) => {
    const pDiff = priorityRank(a.priority) - priorityRank(b.priority)
    if (pDiff !== 0) return pDiff
    return (Date.parse(b.updated_at || '') || 0) - (Date.parse(a.updated_at || '') || 0)
  })

  return { notifications }
}
