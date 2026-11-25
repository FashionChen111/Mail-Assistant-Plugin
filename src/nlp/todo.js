const MONTHS = Object.freeze({
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
})

const PRIORITY_ORDER = Object.freeze({
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
})

const SUBMIT_RE = /(?:请(?:尽快)?(?:提交|提供|发送|上传)|提交初稿|submit|deliver|upload|provide\s+(?:the\s+)?[\w\s]{0,30}(?:report|plan|doc|file|log))/i
const REVIEW_RE = /(?:请(?:审核|评审|审阅|确认|批准|核对)|please\s+(?:review|approve|confirm|check|sign\s*off)|need\s+your\s+(?:review|approval))/i
const FOLLOW_UP_RE = /(?:跟进|催促|催进度|等待.*(?:反馈|回复|更新)|waiting\s+for|follow\s*up|check\s+if\s+there.*update)/i
const REPLY_RE = /(?:请回复|麻烦回复|需要你|请提供|please\s+reply|need\s+your\s+input|can\s+you|could\s+you|action\s+required)/i
const URGENT_RE = /(?:asap|as\s+soon\s+as\s+possible|eod\s+today|urgent|紧急|今天下班前|今日前|立刻|马上)/i

function splitSentences(text) {
  return String(text ?? '')
    .split(/[\r\n]+|(?<=[.!?。！？])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
}

function endOfDayUtc(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 18, 0, 0)).toISOString()
}

function nextWeekday(baseDate, targetDay /* 0=Sun..6=Sat */, nextWeek = false) {
  const current = baseDate.getUTCDay()
  let delta = (targetDay - current + 7) % 7
  if (nextWeek) {
    delta = delta === 0 ? 7 : delta + (current > targetDay ? 0 : 7)
  }
  const d = new Date(baseDate.getTime() + delta * 86400 * 1000)
  return endOfDayUtc(d)
}

export function extractDeadline(text, refDate) {
  const ref = refDate instanceof Date && !Number.isNaN(refDate.getTime()) ? refDate : new Date()

  // 1. Explicit ISO YYYY-MM-DD
  const iso = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/)
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 18, 0, 0))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }

  // 2. Chinese M月D日
  const zhDate = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/)
  if (zhDate) {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), Number(zhDate[1]) - 1, Number(zhDate[2]), 18, 0, 0))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }

  // 3. English Month Day (e.g. Nov 25, November 25th)
  const enDate = text.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i)
  if (enDate) {
    const monthIdx = MONTHS[enDate[1].toLowerCase()]
    const d = new Date(Date.UTC(ref.getUTCFullYear(), monthIdx, Number(enDate[2]), 18, 0, 0))
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }

  // 4. Relative deadlines
  if (/(?:eod\s+today|by\s+today|今天下班前|今日前|今天前|今天内)/i.test(text)) {
    return endOfDayUtc(ref)
  }
  if (/(?:tomorrow|明天|明日)/i.test(text)) {
    return endOfDayUtc(new Date(ref.getTime() + 86400 * 1000))
  }
  if (/(?:本周五|这周五|this\s+friday|by\s+friday|by\s+end\s+of\s+week|本周内)/i.test(text)) {
    return nextWeekday(ref, 5, false)
  }
  if (/(?:下周一|next\s+monday)/i.test(text)) {
    return nextWeekday(ref, 1, true)
  }
  if (/(?:下周五|next\s+friday)/i.test(text)) {
    return nextWeekday(ref, 5, true)
  }

  return null
}

function detectActionType(sentence, isUnansweredQuestion) {
  if (SUBMIT_RE.test(sentence)) return 'submit'
  if (REVIEW_RE.test(sentence)) return 'review'
  if (FOLLOW_UP_RE.test(sentence)) return 'follow_up'
  if (REPLY_RE.test(sentence) || isUnansweredQuestion) return 'reply_required'
  return null
}

function computePriority({ deadlineIso, sentence, now, ageDays, isImportant, isUnansweredQuestion }) {
  if (URGENT_RE.test(sentence)) return 'urgent'
  if (deadlineIso) {
    const hoursLeft = (Date.parse(deadlineIso) - now.getTime()) / (3600 * 1000)
    if (hoursLeft <= 24) return 'urgent'
    if (hoursLeft <= 72) return 'high'
    if (hoursLeft <= 168) return 'medium'
    return 'low'
  }
  if (isUnansweredQuestion && ageDays >= 3) return 'urgent'
  if (isImportant || (isUnansweredQuestion && ageDays >= 2)) return 'high'
  return 'medium'
}

export function extractTodosFromEmail(email, now = new Date()) {
  if (!email) return []
  const subject = String(email.subject ?? '').trim()
  const body = String(email.body_text ?? email.snippet ?? '')
  const receivedMs = Date.parse(email.received_time ?? email.receivedTime ?? '') || now.getTime()
  const receivedDate = new Date(receivedMs)
  const ageDays = Math.max(0, (now.getTime() - receivedMs) / (86400 * 1000))
  const isImportant = email.importance === 'high' || Boolean(email.is_important)
  const isUnread = email.is_read === false || email.isRead === false

  const sentences = splitSentences(body)
  let bestCandidate = null

  for (const sentence of sentences) {
    const hasQuestion = /[?？]/.test(sentence)
    const isUnansweredQuestion = hasQuestion && isUnread && ageDays >= 2
    const deadline = extractDeadline(sentence, receivedDate)
    const actionType = detectActionType(sentence, isUnansweredQuestion)
      ?? (deadline ? 'follow_up' : null)

    if (!actionType && !deadline) continue

    const priority = computePriority({
      deadlineIso: deadline,
      sentence,
      now,
      ageDays,
      isImportant,
      isUnansweredQuestion,
    })

    const candidate = {
      title: subject || sentence.slice(0, 80),
      source_email_id: String(email.id ?? ''),
      source_subject: subject,
      deadline,
      priority,
      action_type: actionType ?? 'follow_up',
      context: sentence.slice(0, 300),
    }

    if (
      !bestCandidate ||
      PRIORITY_ORDER[candidate.priority] < PRIORITY_ORDER[bestCandidate.priority] ||
      (candidate.deadline && !bestCandidate.deadline)
    ) {
      bestCandidate = candidate
    }
  }

  return bestCandidate ? [bestCandidate] : []
}

export function extractTodos({ emails = [], now = new Date() } = {}) {
  const todos = []
  for (const email of emails) {
    todos.push(...extractTodosFromEmail(email, now))
  }

  todos.sort((a, b) => {
    const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    if (pDiff !== 0) return pDiff
    const da = a.deadline ? Date.parse(a.deadline) : Number.POSITIVE_INFINITY
    const db = b.deadline ? Date.parse(b.deadline) : Number.POSITIVE_INFINITY
    return da - db
  })

  return { todos }
}
