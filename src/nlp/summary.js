import { extractTodosFromEmail } from './todo.js'

const BLOCKER_RE = /(?:block(?:ed|er|ing)?|阻塞|delay|延迟|fail(?:ed|ure)?|失败|不足|shortage|issue|pending|waiting\s+for|等待.*(?:固件|反馈|设备|更新))/i

function splitLines(text) {
  return String(text ?? '')
    .split(/[\r\n]+|(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
}

function firstMeaningfulSentence(email) {
  const lines = splitLines(email.body_text ?? email.snippet ?? '')
  return (lines[0] || String(email.subject ?? '')).slice(0, 240)
}

export function summarizeProjectEmails({ project, days = 30, emails = [], now = new Date() } = {}) {
  const toIso = now.toISOString()
  const fromIso = new Date(now.getTime() - days * 86400 * 1000).toISOString()

  // Sort chronologically ascending for timeline construction.
  const sortedAsc = [...emails].sort((a, b) => {
    const ta = Date.parse(a.received_time ?? a.receivedTime ?? '') || 0
    const tb = Date.parse(b.received_time ?? b.receivedTime ?? '') || 0
    return ta - tb
  })

  const timeline = []
  const blocking_issues = []
  const next_actions = []
  const related_emails = []

  for (const email of sortedAsc) {
    const received = String(email.received_time ?? email.receivedTime ?? '')
    const dateLabel = received ? received.slice(0, 10) : ''
    const subject = String(email.subject ?? '')
    const id = String(email.id ?? '')

    timeline.push({
      date: dateLabel,
      summary: subject || firstMeaningfulSentence(email),
      source_email_id: id,
      context: firstMeaningfulSentence(email),
    })

    const lines = splitLines(email.body_text ?? email.snippet ?? '')
    const blockerLine = lines.find((line) => BLOCKER_RE.test(line))
    if (blockerLine || BLOCKER_RE.test(subject)) {
      const context = (blockerLine || subject).slice(0, 300)
      blocking_issues.push({
        issue: subject || context.slice(0, 80),
        status: /已排查|resolved|fixed|已申请|in progress/i.test(email.body_text ?? '') ? 'in_progress' : 'open',
        source_email_id: id,
        context,
      })
    }

    const todos = extractTodosFromEmail(email, now)
    for (const todo of todos) {
      next_actions.push({
        action: todo.title,
        deadline: todo.deadline,
        priority: todo.priority,
        source_email_id: id,
        context: todo.context,
      })
    }

    related_emails.push({
      id,
      subject,
      from: String(email.from ?? ''),
      received_time: received,
      folder: String(email.folder ?? ''),
    })
  }

  // Related emails shown newest-first for quick scanning.
  related_emails.reverse()

  return {
    project: String(project ?? ''),
    time_range: {
      from: fromIso,
      to: toIso,
      days,
    },
    timeline,
    blocking_issues,
    next_actions,
    related_emails,
  }
}
