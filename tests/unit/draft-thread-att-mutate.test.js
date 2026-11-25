import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'

import { ExchangeError, ERROR_CODES } from '../../src/errors.js'
import { saveDraft, updateDraft, deleteDraft } from '../../src/ews/draft.js'
import { getThread, sortThreadEmails } from '../../src/ews/thread.js'
import { sanitizeAttachmentName, downloadAttachment } from '../../src/ews/attachment.js'
import { moveEmail, markEmail, deleteEmail } from '../../src/ews/mutate.js'

const RAW_FOLDERS = {
  rootId: 'root-1',
  folders: [
    { id: 'f-inbox', parentId: 'root-1', name: '收件箱', folderClass: 'IPF.Note', isRootChild: true },
    { id: 'f-sent', parentId: 'root-1', name: '已发送', folderClass: 'IPF.Note', isRootChild: true },
    { id: 'f-drafts', parentId: 'root-1', name: '草稿箱', folderClass: 'IPF.Note', isRootChild: true },
    { id: 'f-hr', parentId: 'root-1', name: '人事资料', folderClass: 'IPF.Note', isRootChild: true },
  ],
}

test('draft operations validate inputs, enrich in_reply_to headers, gracefully degrade when reply target is missing, and never send', async () => {
  const savedPayloads = []
  let updatedPatch = null
  let deletedId = null
  const ewsClient = {
    async findFolders() { return RAW_FOLDERS },
    async getItem(id) {
      if (id === 'orig-1') {
        return {
          id: 'orig-1',
          parentFolderId: 'f-inbox',
          messageId: '<msg-orig@support.com>',
          references: ['<msg-root@support.com>'],
        }
      }
      throw new ExchangeError(ERROR_CODES.EMAIL_001, 'not found')
    },
    async saveDraft(payload) {
      savedPayloads.push(payload)
      return { draftId: `draft-${savedPayloads.length}`, savedTime: '2026-11-24T10:00:00.000Z' }
    },
    async updateDraft(draftId, patch) {
      updatedPatch = { draftId, patch }
      return { draftId, savedTime: '2026-11-24T10:05:00.000Z' }
    },
    async deleteDraft(draftId) {
      deletedId = draftId
      return { deleted: true }
    },
  }
  const state = {
    access: { mode: 'whitelist', folders: ['收件箱', '草稿箱'], emergencyLock: false },
  }

  // Validation failures
  await assert.rejects(() => saveDraft({ ewsClient, state, args: { to: [], subject: 'Hi', body_text: 'x' } }))
  await assert.rejects(() => saveDraft({ ewsClient, state, args: { to: ['a@b.com'], subject: '   ', body_text: 'x' } }))

  // With existing in_reply_to -> adds In-Reply-To and References
  const d1 = await saveDraft({
    ewsClient,
    state,
    args: {
      to: ['support@google.com'],
      subject: 'Re: Widevine Issue #123',
      body_text: 'Gentle reminder...',
      in_reply_to: 'orig-1',
    },
  })
  assert.equal(d1.draft_id, 'draft-1')
  assert.equal(savedPayloads[0].inReplyToMessageId, '<msg-orig@support.com>')
  assert.equal(savedPayloads[0].referencesHeader, '<msg-root@support.com> <msg-orig@support.com>')

  // Missing in_reply_to -> gracefully degrades to ordinary draft without failing
  const d2 = await saveDraft({
    ewsClient,
    state,
    args: {
      to: ['support@google.com'],
      subject: 'Follow-up',
      body_text: 'Checking in...',
      in_reply_to: 'deleted-id',
    },
  })
  assert.equal(d2.draft_id, 'draft-2')
  assert.equal(savedPayloads[1].inReplyToMessageId, undefined)

  // Update only supplied fields
  const u = await updateDraft({ ewsClient, state, args: { draft_id: 'draft-1', subject: 'Updated subject' } })
  assert.equal(u.draft_id, 'draft-1')
  assert.deepEqual(updatedPatch.patch, { subject: 'Updated subject' })

  // Delete draft
  const del = await deleteDraft({ ewsClient, state, args: { draft_id: 'draft-1' } })
  assert.deepEqual(del, { deleted: true })
  assert.equal(deletedId, 'draft-1')
})

test('getThread reconstructs 10-email thread in chronological + References order, deduplicates, and rejects entire thread if any member is forbidden', async () => {
  // Build 10 emails in scrambled order + 1 duplicate Message-ID
  const rawThread = []
  for (let i = 1; i <= 10; i++) {
    rawThread.push({
      id: `m-${i}`,
      parentFolderId: i % 2 === 0 ? 'f-sent' : 'f-inbox',
      conversationId: 'conv-10',
      messageId: `<m${i}@corp>`,
      references: i === 1 ? [] : [`<m${i - 1}@corp>`],
      from: i % 2 === 0 ? 'me@corp.com' : 'support@apple.com',
      to: ['team@corp.com'],
      cc: [],
      subject: 'AirPlay2 Thread',
      bodyText: `Message #${i}`,
      bodyHtml: null,
      sentTime: `2026-11-${String(10 + i).padStart(2, '0')}T10:00:00.000Z`,
      receivedTime: `2026-11-${String(10 + i).padStart(2, '0')}T10:00:05.000Z`,
      isRead: true,
      hasAttachments: false,
      attachments: [],
    })
  }
  const scrambled = [...rawThread].reverse()
  scrambled.push({ ...rawThread[4], id: 'm-5-dup' }) // duplicate Message-ID

  const ewsClient = {
    async findFolders() { return RAW_FOLDERS },
    async getItem() { return rawThread[3] },
    async findConversationItems() { return scrambled },
  }
  const allowedState = {
    access: { mode: 'whitelist', folders: ['收件箱', '已发送'], emergencyLock: false },
  }

  const res = await getThread({
    ewsClient,
    state: allowedState,
    limits: { maxBodyChars: 20000 },
    args: { email_id: 'm-4' },
  })
  assert.equal(res.emails.length, 10)
  assert.deepEqual(
    res.emails.map((e) => e.message_id),
    Array.from({ length: 10 }, (_, idx) => `<m${idx + 1}@corp>`),
  )

  // Review Focus #2: if ONE member is in forbidden folder, entire thread rejected with PERM_001
  const mixedThread = [...rawThread.slice(0, 9), { ...rawThread[9], parentFolderId: 'f-hr' }]
  const mixedClient = {
    async findFolders() { return RAW_FOLDERS },
    async getItem() { return rawThread[0] },
    async findConversationItems() { return mixedThread },
  }
  await assert.rejects(
    () => getThread({ ewsClient: mixedClient, state: allowedState, limits: { maxBodyChars: 20000 }, args: { email_id: 'm-1' } }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
  )

  // Out-of-order clock skew corrected by References chain
  const skewed = sortThreadEmails([
    { id: 'child', message_id: '<c@x>', references: ['<p@x>'], sent_time: '2026-11-20T09:00:00.000Z', received_time: '2026-11-20T09:00:00.000Z' },
    { id: 'parent', message_id: '<p@x>', references: [], sent_time: '2026-11-20T09:00:10.000Z', received_time: '2026-11-20T09:00:10.000Z' },
  ])
  assert.deepEqual(skewed.map((e) => e.id), ['parent', 'child'])
})

test('downloadAttachment enforces 25 MiB exact boundary, sanitizes hostile names, and returns base64 only <= 1 MiB', async () => {
  // Hostile filenames (Review Focus #3)
  assert.equal(sanitizeAttachmentName('../../.bashrc', 'a1'), '.bashrc')
  assert.equal(sanitizeAttachmentName('C:\\Windows\\System32\\evil.exe', 'a2'), 'evil.exe')
  assert.equal(sanitizeAttachmentName('foo/bar/build.log', 'a3'), 'build.log')
  assert.equal(sanitizeAttachmentName('..', 'a4'), 'attachment-a4')
  assert.equal(sanitizeAttachmentName('', 'a5'), 'attachment-a5')

  const MAX_25_MB = 25 * 1024 * 1024
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-att-'))
  try {
    let downloadCalls = 0
    const makeClient = (metaSize, actualBuffer) => ({
      async findFolders() { return RAW_FOLDERS },
      async getItem() {
        return {
          id: 'e1',
          parentFolderId: 'f-inbox',
          attachments: [{ id: 'att-1', name: '../../report.log', size: metaSize, content_type: 'text/plain', is_inline: false }],
        }
      },
      async downloadAttachment() {
        downloadCalls++
        return { id: 'att-1', name: '../../report.log', size: actualBuffer.byteLength, contentType: 'text/plain', buffer: actualBuffer }
      },
    })
    const state = { access: { mode: 'whitelist', folders: ['收件箱'], emergencyLock: false } }
    const limits = { maxAttachmentBytes: MAX_25_MB }

    // 1. Metadata > 25 MiB (25 MiB + 1 byte) -> ATT_001 BEFORE calling downloadAttachment
    downloadCalls = 0
    await assert.rejects(
      () => downloadAttachment({
        ewsClient: makeClient(MAX_25_MB + 1, Buffer.alloc(0)),
        state,
        limits,
        args: { email_id: 'e1', attachment_id: 'att-1', save_path: dir },
      }),
      (err) => err instanceof ExchangeError && err.code === ERROR_CODES.ATT_001,
    )
    assert.equal(downloadCalls, 0)

    // 2. Lying metadata (says 100 bytes, actual buffer is 25 MiB + 1) -> ATT_001 BEFORE writing disk
    const overBuf = Buffer.alloc(MAX_25_MB + 1)
    await assert.rejects(
      () => downloadAttachment({
        ewsClient: makeClient(100, overBuf),
        state,
        limits,
        args: { email_id: 'e1', attachment_id: 'att-1', save_path: dir },
      }),
      (err) => err instanceof ExchangeError && err.code === ERROR_CODES.ATT_001,
    )
    await assert.rejects(() => stat(join(dir, 'report.log')))

    // 3. Exactly 25 MiB -> allowed, NO content_base64 (> 1 MiB)
    const exact25 = Buffer.alloc(MAX_25_MB, 0x61)
    const res25 = await downloadAttachment({
      ewsClient: makeClient(MAX_25_MB, exact25),
      state,
      limits,
      args: { email_id: 'e1', attachment_id: 'att-1', save_path: dir },
    })
    assert.equal(basename(res25.file_path), 'report.log')
    assert.equal(res25.file_path, join(dir, 'report.log'))
    assert.equal(res25.size, MAX_25_MB)
    assert.equal('content_base64' in res25, false)

    // 4. Small file (<= 1 MiB) -> includes content_base64 and writes exact bytes
    const smallBuf = Buffer.from('hello log\n', 'utf8')
    const resSmall = await downloadAttachment({
      ewsClient: makeClient(smallBuf.byteLength, smallBuf),
      state,
      limits,
      args: { email_id: 'e1', attachment_id: 'att-1', save_path: join(dir, 'small.log') },
    })
    assert.equal(resSmall.size, smallBuf.byteLength)
    assert.equal(resSmall.content_base64, smallBuf.toString('base64'))
    assert.equal(await readFile(resSmall.file_path, 'utf8'), 'hello log\n')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('mutate operations enforce target+source permissions on move, require mark fields, and unconditionally deny permanent delete', async () => {
  let ewsCalls = 0
  const ewsClient = {
    async findFolders() { ewsCalls++; return RAW_FOLDERS },
    async getItem(id) {
      ewsCalls++
      return { id, parentFolderId: id === 'hr-mail' ? 'f-hr' : 'f-inbox' }
    },
    async moveItem() { ewsCalls++; return { moved: true } },
    async markItem() { ewsCalls++; return { updated: true } },
    async deleteItem() { ewsCalls++; return { deleted: true } },
  }
  const state = {
    access: { mode: 'whitelist', folders: ['收件箱', '已发送'], emergencyLock: false },
  }

  // Permanent delete -> PERM_001 with ZERO EWS calls
  ewsCalls = 0
  await assert.rejects(
    () => deleteEmail({ ewsClient, state, args: { email_id: 'e1', permanent: true } }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
  )
  assert.equal(ewsCalls, 0)

  // Move to forbidden target -> PERM_001 with ZERO EWS calls
  ewsCalls = 0
  await assert.rejects(
    () => moveEmail({ ewsClient, state, args: { email_id: 'e1', target_folder: '人事资料' } }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
  )
  assert.equal(ewsCalls, 0)

  // Move from forbidden source -> PERM_001
  await assert.rejects(
    () => moveEmail({ ewsClient, state, args: { email_id: 'hr-mail', target_folder: '收件箱' } }),
    (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
  )

  // Valid move, mark, soft delete
  assert.deepEqual(await moveEmail({ ewsClient, state, args: { email_id: 'e1', target_folder: '已发送' } }), { moved: true })
  assert.deepEqual(await markEmail({ ewsClient, state, args: { email_id: 'e1', is_read: true, is_flagged: true } }), { updated: true })
  await assert.rejects(() => markEmail({ ewsClient, state, args: { email_id: 'e1' } }))
  assert.deepEqual(await deleteEmail({ ewsClient, state, args: { email_id: 'e1', permanent: false } }), { deleted: true })
})
