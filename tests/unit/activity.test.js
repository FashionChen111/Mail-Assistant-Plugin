import test from 'node:test'
import assert from 'node:assert/strict'
import { appendFile, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ACTION_CATEGORIES,
  MAX_ACTIVITY_ENTRIES,
  createActivityLogger,
  formatActivityRecord,
  readActivityHistory,
} from '../../src/activity.js'
import { createAuditLogger } from '../../src/security/audit.js'

test('ACTION_CATEGORIES maps all 15 Exchange actions and formatActivityRecord strips secrets, bodies, and raw attachments', () => {
  const expectedActions = [
    'list_folders',
    'search_emails',
    'read_email',
    'list_recent_emails',
    'save_draft',
    'update_draft',
    'delete_draft',
    'get_thread',
    'parse_jira_notifications',
    'extract_todos',
    'summarize_project',
    'download_attachment',
    'move_email',
    'mark_email',
    'delete_email',
  ]
  for (const act of expectedActions) {
    assert.ok(
      ['read', 'draft', 'search', 'analyze', 'modify'].includes(ACTION_CATEGORIES[act]),
      `action ${act} must map to a valid category`,
    )
  }
  assert.equal(MAX_ACTIVITY_ENTRIES, 500)

  const longSubject = 'S'.repeat(300)
  const rec = formatActivityRecord({
    ts: '2026-11-26T10:00:00.000Z',
    action: 'save_draft',
    folder: '草稿箱',
    emailId: 'draft-123',
    outcome: 'ok',
    elapsedMs: 42.6,
    password: 'TOP_SECRET_PASSWORD',
    body_text: 'CONFIDENTIAL_DRAFT_BODY',
    body_html: '<p>CONFIDENTIAL_HTML</p>',
    content_base64: 'QUJDREVGRw==',
    summary: {
      subject: longSubject,
      to: ['a@corp.com', 'b@corp.com', 'c@corp.com', 'd@corp.com', 'e@corp.com', 'f@corp.com', 'g@corp.com'],
      toCount: 7,
      ccCount: 2,
      bccCount: 1,
      isReply: true,
      bodyChars: 420,
      body_text: 'NESTED_SECRET_BODY',
      password: 'NESTED_PASSWORD',
      token: 'BEARER_SECRET',
    },
  })

  assert.equal(rec.action, 'save_draft')
  assert.equal(rec.category, 'draft')
  assert.equal(rec.outcome, 'ok')
  assert.equal(rec.elapsedMs, 43)
  assert.equal(rec.source, 'activity')
  assert.ok(typeof rec.id === 'string' && rec.id.length > 0)
  assert.ok(rec.summary.subject.length <= 200)
  assert.equal(rec.summary.to.length, 6)
  assert.equal(rec.summary.toCount, 7)
  assert.equal(rec.summary.ccCount, 2)
  assert.equal(rec.summary.isReply, true)
  assert.equal(rec.summary.bodyChars, 420)

  const serialized = JSON.stringify(rec)
  assert.doesNotMatch(
    serialized,
    /TOP_SECRET_PASSWORD|CONFIDENTIAL_DRAFT_BODY|CONFIDENTIAL_HTML|QUJDREVGRw==|NESTED_SECRET_BODY|NESTED_PASSWORD|BEARER_SECRET/,
  )
})

test('createActivityLogger writes 0600 JSONL, handles concurrent logs, and compacts at rolling maxEntries cap', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-activity-'))
  try {
    const activityPath = join(dir, 'activity.jsonl')
    const logger = createActivityLogger(activityPath, { maxEntries: 15, compactThreshold: 20 })

    // 25 concurrent log writes — must serialize cleanly and compact down to <= 15 newest entries
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        logger.log({
          ts: new Date(Date.UTC(2026, 10, 26, 10, 0, i)).toISOString(),
          action: 'read_email',
          folder: '收件箱',
          emailId: `mail-${i}`,
          outcome: 'ok',
          elapsedMs: 10 + i,
          summary: {
            subject: `Subject #${i}`,
            from: `sender${i}@corp.com`,
          },
        }),
      ),
    )

    const fileStat = await stat(activityPath)
    assert.equal(fileStat.mode & 0o777, 0o600)

    const res = await readActivityHistory({ activityPath, limit: 50 })
    assert.ok(res.items.length <= 20 && res.items.length >= 15, `expected bounded count, got ${res.items.length}`)
    assert.equal(res.items[0].emailId, 'mail-24')
    assert.equal(res.items[0].summary.subject, 'Subject #24')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readActivityHistory merges legacy audit.jsonl, deduplicates shared ts, skips corrupt lines, filters, and respects clearedAt watermark', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-history-merge-'))
  try {
    const activityPath = join(dir, 'activity.jsonl')
    const auditPath = join(dir, 'audit.jsonl')
    const audit = createAuditLogger(auditPath)
    const activity = createActivityLogger(activityPath)

    // 1. Legacy audit-only record (pre-v1.4.0)
    await audit.log({
      ts: '2026-11-26T08:00:00.000Z',
      action: 'search_emails',
      folder: '收件箱',
      outcome: 'ok',
      count: 6,
      elapsedMs: 120,
    })

    // 2. Shared timestamp record written to BOTH audit.jsonl and activity.jsonl -> must NOT duplicate, must favor rich activity record
    const sharedTs = '2026-11-26T09:00:00.000Z'
    await audit.log({
      ts: sharedTs,
      action: 'read_email',
      folder: '认证项目/Widevine',
      emailId: 'e-widevine',
      outcome: 'ok',
      elapsedMs: 85,
    })
    await activity.log({
      ts: sharedTs,
      action: 'read_email',
      folder: '认证项目/Widevine',
      emailId: 'e-widevine',
      outcome: 'ok',
      elapsedMs: 85,
      summary: {
        subject: 'Widevine L1 Certification Follow-up',
        from: 'support@google.com',
        markAsRead: false,
      },
    })

    // 3. Draft saved & denied delete attempt
    await activity.log({
      ts: '2026-11-26T09:15:00.000Z',
      action: 'save_draft',
      folder: '草稿箱',
      emailId: 'draft-1',
      outcome: 'ok',
      elapsedMs: 210,
      summary: {
        subject: 'Re: Widevine L1 Certification Follow-up',
        to: ['support@google.com'],
        toCount: 1,
        isReply: true,
        bodyChars: 350,
      },
    })
    await activity.log({
      ts: '2026-11-26T09:30:00.000Z',
      action: 'delete_email',
      folder: '人事资料',
      emailId: 'e-hr',
      outcome: 'denied',
      code: 'PERM_001',
      elapsedMs: 2,
      summary: { permanentAttempt: true },
    })

    // 4. Inject corrupted truncated JSON lines into BOTH files (Review Focus #1)
    await appendFile(activityPath, '{"ts":"broken-json\n', 'utf8')
    await appendFile(auditPath, 'not valid json at all\n', 'utf8')

    // Read all merged history
    const all = await readActivityHistory({ activityPath, auditPath, limit: 20 })
    assert.equal(all.total, 4)
    assert.equal(all.unfilteredTotal, 4)
    assert.equal(all.hasMore, false)
    assert.deepEqual(
      all.items.map((x) => [x.action, x.source]),
      [
        ['delete_email', 'activity'],
        ['save_draft', 'activity'],
        ['read_email', 'activity'],
        ['search_emails', 'audit'],
      ],
    )
    assert.equal(all.items[2].summary.subject, 'Widevine L1 Certification Follow-up')
    assert.equal(all.stats.total, 4)
    assert.equal(all.stats.read, 1)
    assert.equal(all.stats.draft, 1)
    assert.equal(all.stats.search, 1)
    assert.equal(all.stats.modify, 1)
    assert.equal(all.stats.denied, 1)

    // Filter by category='draft'
    const draftsOnly = await readActivityHistory({ activityPath, auditPath, category: 'draft' })
    assert.equal(draftsOnly.total, 1)
    assert.equal(draftsOnly.unfilteredTotal, 4)
    assert.equal(draftsOnly.items[0].action, 'save_draft')

    // Filter by outcome='denied'
    const deniedOnly = await readActivityHistory({ activityPath, auditPath, outcome: 'denied' })
    assert.equal(deniedOnly.total, 1)
    assert.equal(deniedOnly.items[0].code, 'PERM_001')

    // Filter by keyword q='widevine'
    const searched = await readActivityHistory({ activityPath, auditPath, q: 'widevine' })
    assert.equal(searched.total, 2)

    // Pagination check
    const page1 = await readActivityHistory({ activityPath, auditPath, limit: 2, offset: 0 })
    assert.equal(page1.items.length, 2)
    assert.equal(page1.hasMore, true)
    const page2 = await readActivityHistory({ activityPath, auditPath, limit: 2, offset: 2 })
    assert.equal(page2.items.length, 2)
    assert.equal(page2.hasMore, false)

    // Clear history -> writes clearedAt watermark; audit.jsonl MUST remain intact on disk; old records stay hidden!
    const auditBeforeClear = await readFile(auditPath, 'utf8')
    const { clearedAt } = await activity.clear('2026-11-26T09:45:00.000Z')
    assert.equal(clearedAt, '2026-11-26T09:45:00.000Z')
    assert.equal(await readFile(auditPath, 'utf8'), auditBeforeClear, 'audit.jsonl must NEVER be modified by clear()')

    const afterClear = await readActivityHistory({ activityPath, auditPath })
    assert.equal(afterClear.total, 0)
    assert.equal(afterClear.items.length, 0)
    assert.equal(afterClear.stats.total, 0)

    // New activity AFTER clearedAt appears normally
    await activity.log({
      ts: '2026-11-26T10:00:00.000Z',
      action: 'summarize_project',
      outcome: 'ok',
      count: 5,
      elapsedMs: 410,
      summary: { project: 'AirPlay2', days: 30, relatedCount: 5, blockingCount: 1, nextActionCount: 2 },
    })
    const afterNew = await readActivityHistory({ activityPath, auditPath })
    assert.equal(afterNew.total, 1)
    assert.equal(afterNew.items[0].summary.project, 'AirPlay2')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readActivityHistory returns clean empty result when neither file exists (ENOENT)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-empty-'))
  try {
    const res = await readActivityHistory({
      activityPath: join(dir, 'missing-activity.jsonl'),
      auditPath: join(dir, 'missing-audit.jsonl'),
    })
    assert.equal(res.total, 0)
    assert.equal(res.unfilteredTotal, 0)
    assert.equal(res.hasMore, false)
    assert.deepEqual(res.items, [])
    assert.equal(res.stats.total, 0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('readActivityHistory prevents audit resurrection past rolling cap, preserves post-clear records under backward clock skew, and ignores corrupt ts/prototype actions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-review-fixes-'))
  try {
    const activityPath = join(dir, 'activity.jsonl')
    const auditPath = join(dir, 'audit.jsonl')
    const audit = createAuditLogger(auditPath)
    const activity = createActivityLogger(activityPath, { auditPath, maxEntries: 10, compactThreshold: 15 })

    // I1 + M4: Write 18 shared entries to both audit.jsonl and activity.jsonl -> activity compacts to <= 10; audit must NOT resurrect older rows beyond maxEntries
    for (let i = 0; i < 18; i++) {
      const ts = new Date(Date.UTC(2026, 10, 25, 10, 0, i)).toISOString()
      await audit.log({ ts, action: 'read_email', folder: '收件箱', emailId: `m-${i}`, outcome: 'ok', elapsedMs: 5 })
      await activity.log({ ts, action: 'read_email', folder: '收件箱', emailId: `m-${i}`, outcome: 'ok', elapsedMs: 5, summary: { subject: `Sub ${i}` } })
    }
    const capped = await readActivityHistory({ activityPath, auditPath, limit: 50, maxEntries: 10 })
    assert.equal(capped.total, 10)
    assert.equal(capped.unfilteredTotal, 10)
    assert.equal(capped.items.every((x) => x.source === 'activity'), true, 'compacted audit entries must not resurrect past maxEntries')

    // I5: Corrupt JSONL rows without valid ts must be skipped (never get synthetic now ts), and prototype action names ("toString") must map safely to "search"
    await appendFile(activityPath, '{"action":"read_email","outcome":"ok"}\n{"action":"toString","ts":"2026-11-25T10:05:00.000Z","outcome":"ok"}\n', 'utf8')
    await appendFile(auditPath, '{"action":"search_emails","outcome":"ok"}\n', 'utf8')
    const withCorrupt = await readActivityHistory({ activityPath, auditPath, limit: 50, maxEntries: 20 })
    const protoItem = withCorrupt.items.find((x) => x.action === 'toString')
    assert.ok(protoItem)
    assert.equal(protoItem.category, 'search')
    assert.equal(withCorrupt.items.some((x) => x.action === 'read_email' && !x.emailId), false, 'row missing valid ts must be skipped')

    // I2: Backward clock skew & same-millisecond post-clear logging
    // Audit has a future-skewed timestamp 2099-01-01T00:00:00.000Z; user clicks clear() -> clearedAt advances to 2099
    await audit.log({ ts: '2099-01-01T00:00:00.000Z', action: 'list_folders', outcome: 'ok', count: 5, elapsedMs: 10 })
    await activity.clear()
    const rightAfterClear = await readActivityHistory({ activityPath, auditPath })
    assert.equal(rightAfterClear.total, 0)

    // Subsequent brand-new activity written AFTER clear() with an earlier (NTP-corrected) clock timestamp MUST STILL APPEAR!
    await activity.log({
      ts: '2026-11-26T02:00:00.000Z',
      action: 'save_draft',
      folder: '草稿箱',
      emailId: 'draft-post-clear',
      outcome: 'ok',
      elapsedMs: 40,
      summary: { subject: 'Post-clear NTP draft', to: ['a@corp.com'], toCount: 1, bodyChars: 50 },
    })
    const afterSkewLog = await readActivityHistory({ activityPath, auditPath })
    assert.equal(afterSkewLog.total, 1, 'post-clear entry appended after marker must stay visible even under backward clock skew')
    assert.equal(afterSkewLog.items[0].emailId, 'draft-post-clear')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
