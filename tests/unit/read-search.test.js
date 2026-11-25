import test from 'node:test'
import assert from 'node:assert/strict'

import { ExchangeError, ERROR_CODES } from '../../src/errors.js'
import { buildFolderTree, listFolders, resolveFolder } from '../../src/ews/folders.js'
import { htmlToText, makeSnippet, searchEmails, listRecentEmails, readEmail } from '../../src/ews/search.js'

const RAW_FOLDERS = {
  rootId: 'root-1',
  folders: [
    { id: 'f-inbox', parentId: 'root-1', name: '收件箱', folderClass: 'IPF.Note', isRootChild: true },
    { id: 'f-sent', parentId: 'root-1', name: '已发送', folderClass: 'IPF.Note', isRootChild: true },
    { id: 'f-cert', parentId: 'root-1', name: '认证项目', folderClass: 'IPF.Note', isRootChild: true },
    { id: 'f-wv', parentId: 'f-cert', name: 'Widevine', folderClass: 'IPF.Note', isRootChild: false },
    { id: 'f-hr', parentId: 'root-1', name: '人事资料', folderClass: 'IPF.Note', isRootChild: true },
    { id: 'f-cal', parentId: 'root-1', name: '日历', folderClass: 'IPF.Appointment', isRootChild: true },
    { id: 'f-contacts', parentId: 'root-1', name: '联系人', folderClass: 'IPF.Contact', isRootChild: true },
  ],
}

test('buildFolderTree builds slash paths and excludes non-mail folders (Calendar/Contacts)', () => {
  const tree = buildFolderTree(RAW_FOLDERS)
  assert.deepEqual(
    tree.map((f) => f.path),
    ['收件箱', '已发送', '认证项目', '认证项目/Widevine', '人事资料'],
  )
})

test('listFolders returns path/name/readable only (no IDs or unread counts) and honors readable_only', async () => {
  const ewsClient = {
    async findFolders() { return RAW_FOLDERS },
  }
  const state = {
    access: { mode: 'whitelist', folders: ['收件箱', '认证项目/Widevine'], emergencyLock: false },
  }

  const all = await listFolders({ ewsClient, state, readableOnly: false })
  assert.equal(all.folders.length, 5)
  for (const f of all.folders) {
    assert.deepEqual(Object.keys(f).sort(), ['name', 'path', 'readable'])
  }
  assert.equal(all.folders.find((f) => f.path === '收件箱').readable, true)
  assert.equal(all.folders.find((f) => f.path === '人事资料').readable, false)

  const readableOnly = await listFolders({ ewsClient, state, readableOnly: true })
  assert.deepEqual(
    readableOnly.folders.map((f) => f.path),
    ['收件箱', '认证项目/Widevine'],
  )
})

test('resolveFolder reports candidates for missing or ambiguous folder paths', () => {
  const tree = buildFolderTree(RAW_FOLDERS)
  assert.equal(resolveFolder({ folders: tree, targetPath: '认证项目/Widevine' }).id, 'f-wv')

  assert.throws(
    () => resolveFolder({ folders: tree, targetPath: '认证项目/Wide' }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.EMAIL_001 && err.details.candidates.includes('认证项目/Widevine'),
  )

  const ambiguous = [
    { id: 'a1', path: '收件箱/项目', name: '项目' },
    { id: 'a2', path: '收件箱/项目', name: '项目' },
  ]
  assert.throws(
    () => resolveFolder({ folders: ambiguous, targetPath: '收件箱/项目' }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001 && Array.isArray(err.details.candidates),
  )
})

test('searchEmails denies forbidden folder BEFORE any EWS call, validates dates, and clamps limit', async () => {
  let ewsCalled = 0
  const ewsClient = {
    async findFolders() { ewsCalled++; return RAW_FOLDERS },
    async findItems(folderId, filterOpts) {
      ewsCalled++
      return {
        total: 2,
        items: [
          {
            id: 'm1',
            parentFolderId: folderId,
            from: 'older@company.com',
            subject: 'code review old',
            bodyText: 'old body',
            bodyHtml: null,
            receivedTime: '2026-11-20T10:00:00.000Z',
            isRead: true,
            hasAttachments: false,
          },
          {
            id: 'm2',
            parentFolderId: folderId,
            from: 'newer@company.com',
            subject: 'code review new',
            bodyText: '',
            bodyHtml: '<p>Hello <b>world</b><br/>line 2</p>',
            receivedTime: '2026-11-23T10:00:00.000Z',
            isRead: false,
            hasAttachments: true,
          },
        ],
        _capturedFilter: filterOpts,
      }
    },
  }
  const state = {
    access: { mode: 'whitelist', folders: ['收件箱'], emergencyLock: false },
  }
  const limits = { maxSearchResults: 10, maxBodyChars: 20000 }

  // Denied folder -> ZERO EWS calls
  await assert.rejects(
    () => searchEmails({ ewsClient, state, limits, args: { folder: '人事资料', query: '薪资' } }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
  )
  assert.equal(ewsCalled, 0)

  // Invalid date_from rejected
  await assert.rejects(
    () => searchEmails({ ewsClient, state, limits, args: { folder: '收件箱', date_from: '2026/11/01' } }),
    /YYYY-MM-DD/,
  )

  // Allowed folder -> sorted descending, snippet converted from HTML, limit clamped to 10
  let capturedFilter = null
  const capturingClient = {
    async findFolders() { return RAW_FOLDERS },
    async findItems(folderId, filterOpts) {
      capturedFilter = filterOpts
      return ewsClient.findItems(folderId, filterOpts)
    },
  }
  const res = await searchEmails({
    ewsClient: capturingClient,
    state,
    limits,
    args: { folder: '收件箱', query: 'code review', days: 7, date_from: '2026-01-01', limit: 99 },
  })
  assert.equal(capturedFilter.limit, 10)
  assert.ok(capturedFilter.sinceIso)
  assert.equal(capturedFilter.untilIso, undefined) // days overrides date_from/date_to
  assert.equal(res.total, 2)
  assert.deepEqual(res.emails.map((e) => e.id), ['m2', 'm1'])
  assert.equal(res.emails[0].folder, '收件箱')
  assert.match(res.emails[0].snippet, /Hello world/)
})

test('listRecentEmails queries ONLY readable folders, merges sorted desc, and aborts cleanly', async () => {
  const queriedFolders = []
  const ewsClient = {
    async findFolders() { return RAW_FOLDERS },
    async findItems(folderId) {
      queriedFolders.push(folderId)
      if (folderId === 'f-inbox') {
        return {
          total: 1,
          items: [{ id: 'a1', parentFolderId: 'f-inbox', from: 'a@x.com', subject: 'A', bodyText: 'body A', receivedTime: '2026-11-22T09:00:00.000Z', isRead: false, hasAttachments: false }],
        }
      }
      return {
        total: 1,
        items: [{ id: 'b1', parentFolderId: 'f-wv', from: 'b@x.com', subject: 'B', bodyText: 'body B', receivedTime: '2026-11-24T09:00:00.000Z', isRead: true, hasAttachments: true }],
      }
    },
  }
  const state = {
    access: { mode: 'whitelist', folders: ['收件箱', '认证项目/Widevine'], emergencyLock: false },
  }
  const res = await listRecentEmails({ ewsClient, state, limits: { maxSearchResults: 100 }, args: { days: 7, limit: 10 } })
  assert.deepEqual(queriedFolders, ['f-inbox', 'f-wv'])
  assert.deepEqual(res.emails.map((e) => e.id), ['b1', 'a1'])
  assert.equal(res.emails[0].folder, '认证项目/Widevine')
  assert.equal(res.emails[1].folder, '收件箱')

  // Abort between folders propagates raw AbortError (Review Focus #5)
  const ac = new AbortController()
  const abortReason = new DOMException('stop', 'AbortError')
  const abortingClient = {
    async findFolders() { return RAW_FOLDERS },
    async findItems(folderId) {
      if (folderId === 'f-inbox') ac.abort(abortReason)
      return { total: 0, items: [] }
    },
  }
  await assert.rejects(
    () => listRecentEmails({ ewsClient: abortingClient, state, limits: { maxSearchResults: 100 }, args: { days: 7 }, signal: ac.signal }),
    (err) => err === abortReason,
  )
})

test('readEmail re-verifies live folder after whitelist revocation, converts HTML, truncates body, and supports mark_as_read', async () => {
  let markedRead = false
  const ewsClient = {
    async findFolders() { return RAW_FOLDERS },
    async getItem(id) {
      if (id === 'revoked-id') {
        return {
          id: 'revoked-id',
          parentFolderId: 'f-hr',
          conversationId: 'c1',
          messageId: '<m1@corp>',
          references: [],
          from: 'hr@corp.com',
          to: ['me@corp.com'],
          cc: [],
          subject: 'Salary',
          bodyText: 'secret',
          bodyHtml: null,
          receivedTime: '2026-11-23T10:00:00.000Z',
          isRead: false,
          hasAttachments: false,
          attachments: [],
        }
      }
      return {
        id: 'ok-id',
        parentFolderId: 'f-inbox',
        conversationId: 'c2',
        messageId: '<m2@corp>',
        references: ['<m0@corp>'],
        from: 'support@google.com',
        to: ['me@corp.com'],
        cc: ['pm@corp.com'],
        subject: 'Widevine update',
        bodyText: '',
        bodyHtml: '<html><head><style>.x{color:red}</style></head><body><p>Line &amp; 1</p><p>' + 'A'.repeat(150) + '</p></body></html>',
        receivedTime: '2026-11-23T12:00:00.000Z',
        isRead: false,
        hasAttachments: true,
        attachments: [{ id: 'att-1', name: 'log.txt', size: 1024, content_type: 'text/plain', is_inline: false }],
      }
    },
    async markItem(_id, opts) {
      if (opts.isRead === true) markedRead = true
      return { updated: true }
    },
  }
  const state = {
    access: { mode: 'whitelist', folders: ['收件箱'], emergencyLock: false },
  }

  // Review Focus #2: old email_id now in forbidden folder -> PERM_001
  await assert.rejects(
    () => readEmail({ ewsClient, state, limits: { maxBodyChars: 50 }, args: { email_id: 'revoked-id', mark_as_read: true } }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
  )
  assert.equal(markedRead, false)

  // Allowed email -> HTML converted, truncated at 50 chars, body_chars records original length, mark_as_read executed
  const detail = await readEmail({ ewsClient, state, limits: { maxBodyChars: 50 }, args: { email_id: 'ok-id', mark_as_read: true } })
  assert.equal(markedRead, true)
  assert.equal(detail.folder, '收件箱')
  assert.equal(detail.body_truncated, true)
  assert.equal(detail.body_text.length, 50)
  assert.ok(detail.body_chars > 150)
  assert.match(detail.body_text, /Line & 1/)
  assert.doesNotMatch(detail.body_text, /color:red/)
  assert.equal(detail.is_read, true)
  assert.equal(detail.attachments.length, 1)
  assert.equal(htmlToText('<script>alert(1)</script><div>Hi&nbsp;there</div>'), 'Hi there')
  assert.equal(makeSnippet('x'.repeat(250), 200).length, 200)
})
