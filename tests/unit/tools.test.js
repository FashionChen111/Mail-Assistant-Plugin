import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ExchangeError, ERROR_CODES } from '../../src/errors.js'
import { writeState } from '../../src/state.js'
import { TOOL_NAMES, createExchangeTools, registerExchangeTools } from '../../src/tools/index.js'

const EXPECTED_15_TOOLS = [
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
]

function makeFakeEwsClient() {
  const folders = {
    rootId: 'root',
    folders: [
      { id: 'f-inbox', parentId: 'root', name: '收件箱', folderClass: 'IPF.Note', isRootChild: true },
      { id: 'f-sent', parentId: 'root', name: '已发送', folderClass: 'IPF.Note', isRootChild: true },
      { id: 'f-hr', parentId: 'root', name: '人事资料', folderClass: 'IPF.Note', isRootChild: true },
    ],
  }
  const email1 = {
    id: 'email-1',
    parentFolderId: 'f-inbox',
    conversationId: 'conv-1',
    messageId: '<m1@corp>',
    references: [],
    from: 'jira@company.com',
    to: ['me@company.com'],
    cc: [],
    subject: '[JIRA] (CERT-101) AirPlay2 delay issue',
    bodyText: 'Status: Open -> Blocked\nPriority: High\nAssignee: me@company.com\nComment: Please submit fix plan by 2026-11-26.\nAudio sync blocked.',
    bodyHtml: null,
    receivedTime: '2026-11-24T10:00:00.000Z',
    sentTime: '2026-11-24T10:00:00.000Z',
    isRead: false,
    isDraft: false,
    isFlagged: false,
    importance: 'high',
    hasAttachments: true,
    attachments: [{ id: 'att-1', name: 'report.txt', size: 11, content_type: 'text/plain', is_inline: false }],
  }
  return {
    async findFolders() { return folders },
    async findItems() { return { items: [email1], total: 1 } },
    async getItem(id) {
      if (id === 'email-1') return email1
      throw new ExchangeError(ERROR_CODES.EMAIL_001, 'not found')
    },
    async findConversationItems() { return [email1] },
    async downloadAttachment() {
      return { id: 'att-1', name: 'report.txt', size: 11, contentType: 'text/plain', buffer: Buffer.from('hello world') }
    },
    async saveDraft() { return { draftId: 'draft-1', savedTime: '2026-11-24T11:00:00.000Z' } },
    async updateDraft(id) { return { draftId: id, savedTime: '2026-11-24T11:05:00.000Z' } },
    async deleteDraft() { return { deleted: true } },
    async moveItem() { return { moved: true } },
    async markItem() { return { updated: true } },
    async deleteItem() { return { deleted: true } },
  }
}

test('createExchangeTools defines all 15 tools with valid DSH defineTool schemas and zero send tool', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-ex-tools-'))
  try {
    const statePath = join(dir, 'state.json')
    const auditPath = join(dir, 'audit.jsonl')
    await writeState(statePath, {
      version: '1.1.0',
      account: {
        serverUrl: 'https://exchange.company.com/EWS/Exchange.asmx',
        email: 'me@company.com',
        domain: 'CORP',
        username: 'me',
      },
      access: { mode: 'whitelist', folders: ['收件箱', '已发送'], emergencyLock: false },
    })

    const fakeClient = makeFakeEwsClient()
    const tools = createExchangeTools({
      ctx: {},
      config: {
        maxSearchResults: 100,
        maxAttachmentMb: 25,
        maxAttachmentBytes: 25 * 1024 * 1024,
        maxBodyChars: 20000,
        requestTimeoutSeconds: 30,
        requestTimeoutMs: 30000,
        explicitPrefix: '@mail',
        dataDir: dir,
      },
      statePath,
      auditPath,
      clientFactory: () => fakeClient,
      getPasswordFn: async () => 'secret-pass',
    })

    assert.deepEqual(TOOL_NAMES, EXPECTED_15_TOOLS)
    assert.deepEqual(tools.map((t) => t.name), EXPECTED_15_TOOLS)
    assert.equal(tools.some((t) => /send/i.test(t.name)), false)

    const byName = new Map(tools.map((t) => [t.name, t]))
    const exec = { signal: new AbortController().signal }

    // Execute every single one of the 15 tools and confirm output.render succeeds
    const calls = [
      ['exchange_list_folders', { readable_only: false }],
      ['exchange_search_emails', { folder: '收件箱', query: 'AirPlay2' }],
      ['exchange_read_email', { email_id: 'email-1' }],
      ['exchange_list_recent_emails', { days: 7 }],
      ['exchange_save_draft', { to: ['support@apple.com'], subject: 'Gentle reminder', body_text: 'Hi there' }],
      ['exchange_update_draft', { draft_id: 'draft-1', subject: 'Updated reminder' }],
      ['exchange_delete_draft', { draft_id: 'draft-1' }],
      ['exchange_get_thread', { email_id: 'email-1' }],
      ['exchange_parse_jira_notifications', { days: 7, filter_by_user: true }],
      ['exchange_extract_todos', { days: 7 }],
      ['exchange_summarize_project', { project: 'AirPlay2', days: 30 }],
      ['exchange_download_attachment', { email_id: 'email-1', attachment_id: 'att-1', save_path: dir }],
      ['exchange_move_email', { email_id: 'email-1', target_folder: '已发送' }],
      ['exchange_mark_email', { email_id: 'email-1', is_read: true }],
      ['exchange_delete_email', { email_id: 'email-1', permanent: false }],
    ]

    for (const [name, args] of calls) {
      const def = byName.get(name)
      assert.ok(def, `missing tool ${name}`)
      const value = await def.execute(args, exec)
      assert.ok(value && typeof value === 'object', `${name} returned non-object`)
      const blocks = def.output.render(args, value)
      assert.ok(Array.isArray(blocks) && blocks.length >= 1 && blocks[0].type === 'text')
    }

    // Verify permanent delete rejected with ExchangeError(PERM_001)
    await assert.rejects(
      () => byName.get('exchange_delete_email').execute({ email_id: 'email-1', permanent: true }, exec),
      (err) => err instanceof ExchangeError && err.code === ERROR_CODES.PERM_001,
    )

    // Verify AbortError propagates raw without wrapping (Review Focus #5)
    const ac = new AbortController()
    const abortErr = new DOMException('cancelled', 'AbortError')
    ac.abort(abortErr)
    await assert.rejects(
      () => byName.get('exchange_list_folders').execute({}, { signal: ac.signal }),
      (err) => err === abortErr && !(err instanceof ExchangeError),
    )

    // Verify audit log recorded calls and contains zero secret or email body text
    const auditRaw = await readFile(auditPath, 'utf8')
    const lines = auditRaw.trim().split('\n').map((l) => JSON.parse(l))
    assert.ok(lines.length >= 16)
    assert.doesNotMatch(auditRaw, /secret-pass|Gentle reminder|Audio sync blocked/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('registerExchangeTools gates all 15 tools and systemPrompt section behind @mail session scope', async () => {
  const registeredTools = []
  let registeredPrompt = null
  const mockCtx = {
    tools: {
      register(def, opts) {
        registeredTools.push({ def, opts })
        return () => {}
      },
    },
    systemPrompt: {
      section(sec) {
        registeredPrompt = sec
        return () => {}
      },
    },
    effect(fn) {
      const dispose = fn()
      return () => { if (typeof dispose === 'function') dispose() }
    },
  }

  const activeSession = { id: 'active' }
  const inactiveSession = { id: 'inactive' }
  const scope = {
    isSessionActivated(s) { return s === activeSession },
  }

  registerExchangeTools(mockCtx, {
    tools: createExchangeTools({
      ctx: mockCtx,
      config: { maxSearchResults: 100, maxAttachmentMb: 25, maxAttachmentBytes: 25 * 1024 * 1024, maxBodyChars: 20000, requestTimeoutSeconds: 30, requestTimeoutMs: 30000, explicitPrefix: '@mail', dataDir: '/tmp' },
      statePath: '/tmp/nonexistent.json',
      auditPath: '/tmp/nonexistent-audit.jsonl',
      clientFactory: makeFakeEwsClient,
      getPasswordFn: async () => 'x',
    }),
    scope,
  })

  assert.equal(registeredTools.length, 15)
  for (const { opts } of registeredTools) {
    assert.equal(opts.when({ agent: { session: inactiveSession } }), false)
    assert.equal(opts.when({ agent: { session: activeSession } }), true)
  }

  assert.ok(registeredPrompt)
  assert.equal(registeredPrompt.text({ agent: { session: inactiveSession } }), '')
  assert.match(registeredPrompt.text({ agent: { session: activeSession } }), /exchange_save_draft/)
})
