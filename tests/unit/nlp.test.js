import test from 'node:test'
import assert from 'node:assert/strict'

import { parseJiraEmail, parseJiraNotifications } from '../../src/nlp/jira.js'
import { extractTodosFromEmail, extractTodos } from '../../src/nlp/todo.js'
import { summarizeProjectEmails } from '../../src/nlp/summary.js'

test('Jira parser extracts issue key, status transition, assignee, priority, comment, and filters by user', () => {
  const emails = [
    {
      id: 'j1',
      from: 'jira@company.com',
      subject: '[JIRA] (CERT-1234) Widevine 认证失败 - Level 3 测试',
      body_text: [
        'Status: Open -> In Progress',
        'Priority: High',
        'Assignee: 张三',
        'Comment: 已定位到密钥交换问题，预计今天下班前修复',
      ].join('\n'),
      received_time: '2026-11-23T10:30:00.000Z',
    },
    {
      id: 'j2',
      from: 'jira@company.com',
      subject: '[JIRA] (CERT-5678) AirPlay2 音频同步延迟',
      body_text: [
        '状态：In Progress → Blocked',
        '优先级：高',
        '指派人：alice@company.com',
        '评论：等待硬件团队提供新固件',
      ].join('\n'),
      received_time: '2026-11-22T15:00:00.000Z',
    },
    {
      id: 'non-jira',
      from: 'news@company.com',
      subject: 'Weekly newsletter',
      body_text: 'Nothing about Jira here.',
      received_time: '2026-11-23T08:00:00.000Z',
    },
  ]

  assert.equal(parseJiraEmail(emails[2]), null)

  const all = parseJiraNotifications({ emails, filterByUser: false })
  assert.equal(all.notifications.length, 2)
  const n1 = all.notifications.find((n) => n.issue_key === 'CERT-1234')
  assert.equal(n1.summary, 'Widevine 认证失败 - Level 3 测试')
  assert.equal(n1.status_from, 'Open')
  assert.equal(n1.status_to, 'In Progress')
  assert.equal(n1.assignee, '张三')
  assert.equal(n1.priority, 'High')
  assert.match(n1.latest_comment, /密钥交换问题/)
  assert.equal(n1.source_email_id, 'j1')

  const mine = parseJiraNotifications({
    emails,
    userEmail: 'alice@company.com',
    userName: 'alice',
    filterByUser: true,
  })
  assert.equal(mine.notifications.length, 1)
  assert.equal(mine.notifications[0].issue_key, 'CERT-5678')
  assert.equal(mine.notifications[0].status_from, 'In Progress')
  assert.equal(mine.notifications[0].status_to, 'Blocked')
})

test('Todo extractor extracts bilingual deadlines, action types, unanswered questions, and verbatim context sorted by priority', () => {
  const now = new Date('2026-11-23T12:00:00.000Z')
  const emails = [
    {
      id: 't1',
      subject: 'Re: AirPlay2 Audio Sync - Need Your Input',
      body_text: 'Hi team,\nCan you provide the audio latency test report by EOD today?\nThanks.',
      received_time: '2026-11-23T08:00:00.000Z',
      is_read: false,
      importance: 'high',
    },
    {
      id: 't2',
      subject: 'Widevine Cert - Environment Setup Question',
      body_text: "What's your Android version and DRM library version?",
      received_time: '2026-11-20T09:00:00.000Z',
      is_read: false,
      importance: 'normal',
    },
    {
      id: 't3',
      subject: 'DTS Cert Timeline',
      body_text: '请在 2026-11-27 前提交初稿并完成内部审核。',
      received_time: '2026-11-21T09:00:00.000Z',
      is_read: true,
      importance: 'normal',
    },
    {
      id: 't4',
      subject: 'FYI company picnic',
      body_text: 'Hope everyone had fun last weekend.',
      received_time: '2026-11-23T07:00:00.000Z',
      is_read: true,
      importance: 'normal',
    },
  ]

  assert.equal(extractTodosFromEmail(emails[3], now).length, 0)

  const res = extractTodos({ emails, now })
  assert.equal(res.todos.length, 3)

  // Urgent items come first
  assert.equal(res.todos[0].source_email_id, 't1')
  assert.equal(res.todos[0].priority, 'urgent')
  assert.equal(res.todos[0].action_type, 'submit')
  assert.ok(res.todos[0].deadline && res.todos[0].deadline.startsWith('2026-11-23'))
  assert.match(res.todos[0].context, /audio latency test report/i)

  const wvTodo = res.todos.find((t) => t.source_email_id === 't2')
  assert.equal(wvTodo.action_type, 'reply_required')
  assert.ok(wvTodo.priority === 'urgent' || wvTodo.priority === 'high')
  assert.match(wvTodo.context, /Android version/)

  const dtsTodo = res.todos.find((t) => t.source_email_id === 't3')
  assert.equal(dtsTodo.action_type, 'submit')
  assert.ok(dtsTodo.deadline && dtsTodo.deadline.startsWith('2026-11-27'))
  assert.match(dtsTodo.context, /2026-11-27/)
})

test('Project summarizer builds traceable timeline, blocking issues, next actions, and related emails', () => {
  const now = new Date('2026-11-24T12:00:00.000Z')
  const emails = [
    {
      id: 'p1',
      from: 'pm@company.com',
      subject: 'AirPlay2 测试设备采购申请',
      body_text: '当前测试设备不足，已申请采购，等待采购部门反馈。',
      received_time: '2026-11-18T10:00:00.000Z',
      folder: '认证项目/AirPlay2',
    },
    {
      id: 'p2',
      from: 'apple-support@apple.com',
      subject: 'Re: AirPlay2 Certification - Initial Review Passed',
      body_text: 'Initial review passed, entering testing phase. Expected completion 2026-12-10.',
      received_time: '2026-11-20T10:00:00.000Z',
      folder: '收件箱',
    },
    {
      id: 'p3',
      from: 'apple-support@apple.com',
      subject: 'AirPlay2 Audio Sync Issue',
      body_text: 'Audio sync delay is 50ms (blocked: requires <30ms). Please submit audio sync fix plan by 2026-11-25.',
      received_time: '2026-11-22T10:00:00.000Z',
      folder: '收件箱',
    },
  ]

  const summary = summarizeProjectEmails({ project: 'AirPlay2', days: 30, emails, now })
  assert.equal(summary.project, 'AirPlay2')
  assert.equal(summary.time_range.days, 30)
  assert.equal(summary.related_emails.length, 3)
  assert.equal(summary.timeline.length, 3)
  assert.equal(summary.timeline[0].source_email_id, 'p1') // chronological ascending
  assert.equal(summary.timeline[2].source_email_id, 'p3')
  assert.ok(summary.blocking_issues.length >= 2)
  assert.ok(summary.blocking_issues.every((b) => b.source_email_id && b.context))
  assert.ok(summary.next_actions.length >= 1)
  assert.ok(summary.next_actions.every((a) => a.source_email_id && a.context))
})
